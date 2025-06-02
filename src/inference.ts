/*
 * Copyright 2022 Spotify AB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as tf from '@tensorflow/tfjs';
import * as tflite from "@tensorflow/tfjs-tflite";

import type { NoteEventTime } from './toMidi';

export type OnCompleteCallback = (
  frames: number[][],
  onsets: number[][],
  conotours: number[][],
) => void;

const OUTPUT_TO_TENSOR_NAME = {
  contours: 'Identity',
  onsets: 'Identity_2',
  frames: 'Identity_1',
};

// All taken from constants.py
// https://github.com/spotify/basic-pitch/blob/main/basic_pitch/constants.py
const NUM_CHANNELS = 1;
const AUDIO_SAMPLE_RATE = 22050;
const FFT_HOP = 256;
const ANNOTATIONS_FPS = Math.floor(AUDIO_SAMPLE_RATE / FFT_HOP);
const AUDIO_WINDOW_LENGTH_SECONDS = 2;
const AUDIO_N_SAMPLES =
  AUDIO_SAMPLE_RATE * AUDIO_WINDOW_LENGTH_SECONDS - FFT_HOP;

const N_OVERLAPPING_FRAMES = 30;
const N_OVERLAP_OVER_2 = Math.floor(N_OVERLAPPING_FRAMES / 2);

const OVERLAP_LENGTH_FRAMES = N_OVERLAPPING_FRAMES * FFT_HOP;
const HOP_SIZE = AUDIO_N_SAMPLES - OVERLAP_LENGTH_FRAMES;

export class BasicPitch {
  model: Promise<tf.GraphModel | tflite.TFLiteModel>;
  /**
   * Create Basic Pitch object.
   * @param modelOrModelPath A GraphModel of an already loaded tf.js graph
   * or a URL pointing to tf.js assets.
   */
  constructor(modelOrModelPath: string | Promise<tf.GraphModel | tflite.TFLiteModel>, type_of_model: "tf" | "tflite" = "tflite") {
    if (OVERLAP_LENGTH_FRAMES % 2 !== 0) {
      throw new Error(
        `OVERLAP_LENGTH_FRAMES is not divisible by 2! Is ${OVERLAP_LENGTH_FRAMES}`,
      );
    }

    this.model =
      typeof modelOrModelPath === 'string'
        ? type_of_model == "tf" ? tf.loadGraphModel(modelOrModelPath) : tflite.loadTFLiteModel(modelOrModelPath)
        : modelOrModelPath;
  }

  /**
   * Adjust notes' start times by an offset.
   * @param notes Notes to adjust.
   * @param offsetSeconds Time in seconds to adjust the note starts by
   * @returns The same NoteEventTime array with offsetSeconds added to the
   * start times.
   */
  adjustNoteStart(notes: NoteEventTime[], offsetSeconds: number) {
    return notes.map((note: NoteEventTime) => ({
      startTimeSeconds: note.startTimeSeconds + offsetSeconds,
      durationSeconds: note.durationSeconds,
      pitch_midi: note.pitchMidi,
      amplitude: note.amplitude,
      pitchBends: note.pitchBends,
    }));
  }

  /**
   * Run inference for a single frame of audio.
   * @param reshapedInput A 3D tensor with dimensions audio x batchNumber x 1.
   * @param batchNumber Number of batches in the input.
   * @returns The frames, onsets and contour matrices output by the basic pitch model.
   */
  async evaluateSingleFrame(
    reshapedInput: tf.Tensor3D,
    batchNumber: number,
  ): Promise<[tf.Tensor3D, tf.Tensor3D, tf.Tensor3D]> {
    const model = await this.model;
    const singleBatch = tf.slice(reshapedInput, batchNumber, 1);
    const results = model instanceof tf.GraphModel
      ? model.execute(singleBatch as any, [
        OUTPUT_TO_TENSOR_NAME.frames,
        OUTPUT_TO_TENSOR_NAME.onsets,
        OUTPUT_TO_TENSOR_NAME.contours,
      ]) as tf.Tensor3D[]
      : model.predict({ 'serving_default_input_2:0': singleBatch.squeeze([2]) } as unknown as any) as Record<string, tf.Tensor3D>;
    return Array.isArray(results) ? [results[0], results[1], results[2]] : [results['StatefulPartitionedCall:0'], results['StatefulPartitionedCall:1'], results['StatefulPartitionedCall:2']];
  }

  /**
   * Preprocess the data before handing it off to the model.
   * @param singleChannelAudioData The mono audio signal.
   * @returns The audio padded and framed for input to the model.
   */
  async prepareData(
    singleChannelAudioData: Float32Array,
  ): Promise<[tf.Tensor3D, number]> {
    const wavSamples = tf.concat1d([
      tf.zeros([Math.floor(OVERLAP_LENGTH_FRAMES / 2)], 'float32'),
      tf.tensor(singleChannelAudioData),
    ]);

    return [
      tf.expandDims(
        tf.signal.frame(wavSamples, AUDIO_N_SAMPLES, HOP_SIZE, true, 0),
        -1,
      ),
      singleChannelAudioData.length,
    ];
  }

  /**
   * Remove overlaps from the framed output.
   * @param result Result from running model inference.
   * @returns The output converted back to the mono input audio dimensions.
   */
  unwrapOutput(result: tf.Tensor3D): tf.Tensor2D {
    let rawOutput = result;
    // remove half of the overlapping frames from beginning and end
    // - 2 * nOverlap, 1 for the nOverlap from the start and another from the
    // one from the end
    rawOutput = result.slice(
      [0, N_OVERLAP_OVER_2, 0],
      [-1, result.shape[1] - 2 * N_OVERLAP_OVER_2, -1],
    );

    const outputShape = rawOutput.shape;
    return rawOutput.reshape([outputShape[0] * outputShape[1], outputShape[2]]);
  }

  /**
   * Pass 22050Hz audio through the model in a callback-based fashion.
   * This function will evaluate one frame of audio at a time and call callbacks
   * upon completion of a single frame. Because outputNotesToPolyphonic is intended to be run on the
   * entire output and not on a frame at a time, a separate callback for completion is used.
   * @param resampledBuffer Either an AudioBuffer or a Float32Array of audio to run through the model.
   * The audio buffer must have a sample rate of 22050 and must be mono audio.
   * @param onComplete Called when the audio is finished processing with the complete result.
   * @param percentCallback Called whenever a single frame of audio has been processed with the updated
   * amount of data processed so far.
   */
  async evaluateModel(
    resampledBuffer: AudioBuffer | Float32Array,
    onComplete: OnCompleteCallback,
    percentCallback: (percent: number) => void,
  ) {
    let singleChannelAudioData: Float32Array;
    if (resampledBuffer instanceof Float32Array) {
      singleChannelAudioData = resampledBuffer;
    } else {
      if (resampledBuffer.sampleRate !== AUDIO_SAMPLE_RATE) {
        throw new Error(
          `Input audio buffer is not at correct sample rate! ` +
          `Is ${resampledBuffer.sampleRate}. Should be ${AUDIO_SAMPLE_RATE}`,
        );
      }

      if (resampledBuffer.numberOfChannels !== NUM_CHANNELS) {
        throw new Error(
          `Input audio buffer is not mono! ` +
          `Number of channels is ${resampledBuffer.numberOfChannels}. Should be ${NUM_CHANNELS}`,
        );
      }
      singleChannelAudioData = resampledBuffer.getChannelData(0);
    }
    const [reshapedInput, audioOriginalLength] = await this.prepareData(
      singleChannelAudioData,
    );

    const nOutputFramesOriginal = Math.floor(
      audioOriginalLength * (ANNOTATIONS_FPS / AUDIO_SAMPLE_RATE),
    );
    let calculatedFrames = 0;

    for (let i = 0; i < reshapedInput.shape[0]; ++i) {
      percentCallback(i / reshapedInput.shape[0]);
      const [resultingFrames, resultingOnsets, resultingContours] =
        await this.evaluateSingleFrame(reshapedInput, i);
      let unwrappedResultingFrames = this.unwrapOutput(resultingFrames);
      let unwrappedResultingOnsets = this.unwrapOutput(resultingOnsets);
      let unwrappedResultingContours = this.unwrapOutput(resultingContours);
      // Lets try to replicate
      // return unwrapped_output[:n_output_frames_original, :]  # trim to original audio length
      // We are running this slice by slice so we have to be a tad tricky in how we extract the "slice"
      const calculatedFramesTmp = unwrappedResultingFrames.shape[0];

      if (calculatedFrames >= nOutputFramesOriginal) {
        continue;
      }
      if (calculatedFramesTmp + calculatedFrames >= nOutputFramesOriginal) {
        const framesToOutput = nOutputFramesOriginal - calculatedFrames;
        unwrappedResultingFrames = unwrappedResultingFrames.slice(
          [0, 0],
          [framesToOutput, -1],
        );
        unwrappedResultingOnsets = unwrappedResultingOnsets.slice(
          [0, 0],
          [framesToOutput, -1],
        );
        unwrappedResultingContours = unwrappedResultingContours.slice(
          [0, 0],
          [framesToOutput, -1],
        );
      }
      calculatedFrames += calculatedFramesTmp;
      onComplete(
        await unwrappedResultingFrames.array(),
        await unwrappedResultingOnsets.array(),
        await unwrappedResultingContours.array(),
      );
    }

    percentCallback(1.0);
  }
}
