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
import load from 'audio-loader';
import fs from 'fs';
import { AudioBuffer, AudioContext } from 'web-audio-api';

import { BasicPitch } from './inference';
import {
  addPitchBendsToNoteEvents,
  NoteEventTime,
  noteFramesToTime,
  outputToNotesPoly,
} from './toMidi';
require('@tensorflow/tfjs-node');
import './matchers';

import { Midi } from '@tonejs/midi';

import { toAllBeClose } from './matchers';

// @ts-ignore
function writeDebugOutput(
  name: string,
  notes: NoteEventTime[],
  noMelodiaNotes: NoteEventTime[],
) {
  // Leaving this in because it's good when we need to update tests
  fs.writeFileSync(`${name}.json`, JSON.stringify(notes));
  fs.writeFileSync(`${name}.nomelodia.json`, JSON.stringify(noMelodiaNotes));
  const midi = new Midi();
  const trackWithMelodia = midi.addTrack();
  trackWithMelodia.name = name;
  notes.forEach(note => {
    trackWithMelodia.addNote({
      midi: note.pitchMidi,
      duration: note.durationSeconds,
      time: note.startTimeSeconds,
      velocity: note.amplitude,
    });
    if (note.pitchBends) {
      note.pitchBends.forEach((b, i) =>
        trackWithMelodia.addPitchBend({
          time:
            note.startTimeSeconds +
            (note.durationSeconds * i) / note.pitchBends!.length,
          value: b,
        }),
      );
    }
  });
  const trackNoMelodia = midi.addTrack();
  trackNoMelodia.name = `${name}.nomelodia`;
  noMelodiaNotes.forEach(note => {
    trackNoMelodia.addNote({
      midi: note.pitchMidi,
      duration: note.durationSeconds,
      time: note.startTimeSeconds,
      velocity: note.amplitude,
    });
    if (note.pitchBends) {
      note.pitchBends.forEach((b, i) =>
        trackWithMelodia.addPitchBend({
          time:
            note.startTimeSeconds +
            (note.durationSeconds * i) / note.pitchBends!.length,
          value: b,
        }),
      );
    }
  });
  fs.writeFileSync(`${name}.mid`, midi.toArray());
}

expect.extend({
  toBeCloseToMidi(
    received: NoteEventTime[],
    argument: NoteEventTime[],
    atol: number = 1e-3,
    rtol: number = 1e-5,
  ) {
    // not done with reduce for early break
    for (let i = 0; i < received.length; ++i) {
      if (
        received[i].pitchBends !== undefined &&
        argument[i].pitchBends !== undefined
      ) {
        const isClose = toAllBeClose(
          received[i].pitchBends!,
          argument[i].pitchBends!,
          1e-3,
          0,
        );
        if (!isClose.pass) {
          return isClose;
        }
      }

      if (
        (received[i].pitchBends === undefined &&
          argument[i].pitchBends !== undefined) ||
        (received[i].pitchBends !== undefined &&
          argument[i].pitchBends === undefined)
      ) {
        return {
          pass: false,
          message: () =>
            `pitchbends for note ${i} do not match. ${JSON.stringify(
              received[i].pitchBends,
            )} != ${JSON.stringify(argument[i].pitchBends)}`,
        };
      }

      if (
        received[i].pitchMidi !== argument[i].pitchMidi ||
        Math.abs(received[i].amplitude - argument[i].amplitude) >
          atol + rtol * Math.abs(received[i].amplitude) ||
        Math.abs(received[i].durationSeconds - argument[i].durationSeconds) >
          atol + rtol * Math.abs(received[i].durationSeconds) ||
        Math.abs(received[i].startTimeSeconds - argument[i].startTimeSeconds) >
          atol + rtol * Math.abs(received[i].startTimeSeconds)
      ) {
        return {
          pass: false,
          message: () =>
            `Expected all midi elements in ${JSON.stringify(
              received.slice(
                Math.max(0, i - 5),
                Math.min(received.length - 1, i + 5),
              ),
              null,
              '  ',
            )} to be close to ${JSON.stringify(
              argument.slice(
                Math.max(0, i - 5),
                Math.min(argument.length - 1, i + 5),
              ),
              null,
              '  ',
            )} ` +
            `(this is a slice of the data at the location + -5 elements). ` +
            `${JSON.stringify(received[i], null, '  ')} != ${JSON.stringify(
              argument[i],
              null,
              '  ',
            )} at index ${i}.`,
        };
      }
    }

    return {
      pass: true,
      message: () => ``,
    };
  },
});

test.each([
  [`file://${__dirname}/../model/model.json`],
  [tf.loadGraphModel(`file://${__dirname}/../model/model.json`)],
])('Can infer a C Major Scale', async model => {
  const wavBuffer = fs.readFileSync(
    `${__dirname}/../test_data/C_major.resampled.mp3`,
  );

  const audioCtx = new AudioContext();
  let audioBuffer = undefined;

  audioCtx.decodeAudioData(
    wavBuffer,
    async (_audioBuffer: AudioBuffer) => {
      audioBuffer = _audioBuffer;
    },
    () => {},
  );

  while (audioBuffer === undefined) {
    await new Promise(r => setTimeout(r, 1));
  }

  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];
  let pct: number = 0;

  const basicPitch = new BasicPitch(model);
  // testing with an AudioBuffer as input
  await basicPitch.evaluateModel(
    audioBuffer as unknown as AudioBuffer,
    (f: number[][], o: number[][], c: number[][]) => {
      frames.push(...f);
      onsets.push(...o);
      contours.push(...c);
    },
    (p: number) => {
      pct = p;
    },
  );

  expect(pct).toEqual(1);

  const framesForArray: number[][] = [];
  const onsetsForArray: number[][] = [];
  const contoursForArray: number[][] = [];
  pct = 0;

  // testing if get the same result with a Float32Array as input
  await basicPitch.evaluateModel(
    (audioBuffer as AudioBuffer).getChannelData(0),
    (f: number[][], o: number[][], c: number[][]) => {
      framesForArray.push(...f);
      onsetsForArray.push(...o);
      contoursForArray.push(...c);
    },
    (p: number) => {
      pct = p;
    },
  );

  expect(pct).toEqual(1);
  expect(framesForArray).toEqual(frames);
  expect(onsetsForArray).toEqual(onsets);
  expect(contoursForArray).toEqual(contours);

  const poly = noteFramesToTime(
    addPitchBendsToNoteEvents(
      contours,
      outputToNotesPoly(frames, onsets, 0.25, 0.25, 5),
    ),
  );
  const polyNoMelodia = noteFramesToTime(
    addPitchBendsToNoteEvents(
      contours,
      outputToNotesPoly(frames, onsets, 0.5, 0.3, 5, true, null, null, false),
    ),
  );
  // writeDebugOutput('test_data/poly', poly, polyNoMelodia); // use if we update the note creation
  const polyNotes: NoteEventTime[] = require('../test_data/poly.json');
  const polyNoMelodiaNotes: NoteEventTime[] = require('../test_data/poly.nomelodia.json');

  expect(poly).toBeCloseToMidi(polyNotes, 1e-3, 0);
  expect(polyNoMelodia).toBeCloseToMidi(polyNoMelodiaNotes, 1e-3, 0);
});

test('Can correctly evaluate vocal 80 bpm data', async () => {
  const vocalDa80bpmData = require('../test_data/vocal-da-80bpm.json');
  const vocalDa80bpmDataNoMelodia = require('../test_data/vocal-da-80bpm.nomelodia.json');

  const wavBuffer = await load(
    `${__dirname}/../test_data/vocal-da-80bpm.22050.wav`,
  );

  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];
  let pct: number = 0;

  const basicPitch = new BasicPitch(`file://${__dirname}/../model/model.json`);

  const wavData = Array.from(Array(wavBuffer.length).keys()).map(
    key => wavBuffer._data[key],
  );
  const audioBuffer: AudioBuffer = AudioBuffer.fromArray([wavData], 22050);
  const [preparedDataTensor, audioOriginalLength] =
    await basicPitch.prepareData(audioBuffer.getChannelData(0));
  const audioWindowedWindows = vocalDa80bpmData.audio_windowed.length;
  const audioWindowedFrames = vocalDa80bpmData.audio_windowed[0].length;
  const audioWindowedChannels = vocalDa80bpmData.audio_windowed[0][0].length;
  expect(preparedDataTensor.shape).toEqual([
    audioWindowedWindows,
    audioWindowedFrames,
    audioWindowedChannels,
  ]);
  // This is unfortunately very long, but very useful (adds almost 90 seconds to test runtime)
  // prepared is (windows, frames, channels)
  const preparedData = preparedDataTensor.arraySync();
  expect(preparedData.length).toStrictEqual(
    vocalDa80bpmData.audio_windowed.length,
  );
  expect(audioOriginalLength).toStrictEqual(
    vocalDa80bpmData.audio_original_length,
  );

  preparedData.forEach((window, i) => {
    // window is (frames, channels).
    expect(window.length).toStrictEqual(
      vocalDa80bpmData.audio_windowed[i].length,
    );
    window.forEach((frame, j) => {
      expect(frame.length).toStrictEqual(
        vocalDa80bpmData.audio_windowed[i][j].length,
      );
      frame.forEach((channel, k) => {
        expect(channel).toBeCloseTo(
          vocalDa80bpmData.audio_windowed[i][j][k],
          4,
        );
      });
    });
  });

  await basicPitch.evaluateModel(
    wavBuffer,
    (f: number[][], o: number[][], c: number[][]) => {
      frames.push(...f);
      onsets.push(...o);
      contours.push(...c);
    },
    (p: number) => {
      pct = p;
    },
  );

  expect(pct).toEqual(1);

  expect(frames.length).toStrictEqual(
    vocalDa80bpmData.unwrapped_output.note.length,
  );
  frames.forEach((frame, i) => {
    expect(frame).toAllBeClose(
      vocalDa80bpmData.unwrapped_output.note[i],
      5e-3,
      0,
    );
  });

  expect(onsets.length).toStrictEqual(
    vocalDa80bpmData.unwrapped_output.onset.length,
  );
  onsets.forEach((onset, i) => {
    expect(onset).toAllBeClose(
      vocalDa80bpmData.unwrapped_output.onset[i],
      5e-3,
      0,
    );
  });
  expect(contours.length).toStrictEqual(
    vocalDa80bpmData.unwrapped_output.contour.length,
  );
  contours.forEach((contour, i) => {
    expect(contour).toAllBeClose(
      vocalDa80bpmData.unwrapped_output.contour[i],
      5e-3,
      0,
    );
  });
  const poly = noteFramesToTime(
    addPitchBendsToNoteEvents(
      contours,
      outputToNotesPoly(
        frames,
        onsets,
        vocalDa80bpmData.onset_thresh,
        vocalDa80bpmData.frame_thresh,
        vocalDa80bpmData.min_note_length,
      ),
    ),
  );

  const polyNoMelodia = noteFramesToTime(
    addPitchBendsToNoteEvents(
      contours,
      outputToNotesPoly(
        frames,
        onsets,
        vocalDa80bpmDataNoMelodia.onset_thresh,
        vocalDa80bpmDataNoMelodia.frame_thresh,
        vocalDa80bpmDataNoMelodia.min_note_length,
        true,
        null,
        null,
        false,
      ),
    ),
  );

  expect(polyNoMelodia).toBeCloseToMidi(
    (
      vocalDa80bpmDataNoMelodia.estimated_notes as [
        number,
        number,
        number,
        number,
        number[],
      ][]
    ).map<NoteEventTime>(note => {
      return {
        startTimeSeconds: note[0],
        durationSeconds: note[1] - note[0],
        pitchMidi: note[2],
        amplitude: note[3],
        pitchBends: note[4],
      };
    }),
    1e-2,
    0,
  );

  expect(poly).toBeCloseToMidi(
    (
      vocalDa80bpmData.estimated_notes as [
        number,
        number,
        number,
        number,
        number[],
      ][]
    ).map<NoteEventTime>(note => {
      return {
        startTimeSeconds: note[0],
        durationSeconds: note[1] - note[0],
        pitchMidi: note[2],
        amplitude: note[3],
        pitchBends: note[4],
      };
    }),
    1e-2,
    0,
  );
}, 100000);
