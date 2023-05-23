![Basic Pitch Logo](https://user-images.githubusercontent.com/213293/167478083-de988de2-9137-4325-8a5f-ceeb51233753.png)
[![Actions Status](https://github.com/spotify/basic-pitch-ts/workflows/Tests/badge.svg)](https://github.com/spotify/basic-pitch-ts/actions)
[![Version](https://img.shields.io/npm/v/@spotify/basic-pitch.svg)](https://www.npmjs.com/package/@spotify/basic-pitch)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
![Supported Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-green)

Basic Pitch is a Typescript and [Python](https://github.com/spotify/basic-pitch) library for Automatic Music Transcription (AMT), using lightweight neural network developed by [Spotify's Audio Intelligence Lab](https://research.atspotify.com/audio-intelligence/). It's small, easy-to-use, and `npm install`-able.

Basic Pitch may be simple, but it's is far from "basic"! `basic-pitch` is efficient and easy to use, and its multipitch support, its ability to generalize across instruments, and its note accuracy competes with much larger and more resource-hungry AMT systems.

Provide a compatible audio file and basic-pitch will generate a MIDI file, complete with pitch bends. Basic pitch is instrument-agnostic and supports polyphonic instruments, so you can freely enjoy transcription of all your favorite music, no matter what instrument is used. Basic pitch works best on one instrument at a time.

### Research Paper

This library was released in conjunction with Spotify's publication at [ICASSP 2022](https://2022.ieeeicassp.org/). You can read more about this research in the paper, [A Lightweight Instrument-Agnostic Model for Polyphonic Note Transcription and Multipitch Estimation](https://arxiv.org/abs/2203.09893).

If you use this library in academic research, consider citing it:

```bibtex
@inproceedings{2022_BittnerBRME_LightweightNoteTranscription_ICASSP,
  author= {Bittner, Rachel M. and Bosch, Juan Jos\'e and Rubinstein, David and Meseguer-Brocal, Gabriel and Ewert, Sebastian},
  title= {A Lightweight Instrument-Agnostic Model for Polyphonic Note Transcription and Multipitch Estimation},
  booktitle= {Proceedings of the IEEE International Conference on Acoustics, Speech, and Signal Processing (ICASSP)},
  address= {Singapore},
  year= 2022,
}
```

### Demo

If, for whatever reason, you're not yet completely inspired, or you're just like so totally over the general vibe and stuff, checkout our snappy demo website, [basicpitch.io](https://basicpitch.io), to experiment with our model on whatever music audio you provide!

### Relation to its Python sibling

This library is intended to be 100% compatible with feature parity to its Python sibling, [basic-pitch](https://github.com/spotify/basic-pitch). To that end, please open an issue in the Python library when contributing a change in this library that affects the input features or output.

## Usage

To add to your project, run

```sh
yarn add @spotify/basic-pitch
```
or
```sh
npm install @spotify/basic-pitch
```

From there you can look at `src/inference.test.ts` for examples of how to use Basic Pitch. 

For instance, here's a detailed example of a typescript function called `audioToNoteEvents`, that allows you to manipulate the detected notes through a input callback function (see `onSuccess`):

```typescript
// audioToNoteEvents.ts

import { BasicPitch, noteFramesToTime, addPitchBendsToNoteEvents, outputToNotesPoly } from "@spotify/basic-pitch";

/**
 * Converts audio to note events using the BasicPitch library.
 *
 * @param audioURL - The URL of the audio file.
 * @param onSuccess - A callback function called when the conversion is successful. It receives an array of note events.
 * @param onError - An optional callback function called if an error occurs during the conversion.
 * @param onProgress - An optional callback function called to get progress percentage value.
 * @param options - Optional detection options.
 * @returns A promise that resolves when the conversion is complete.
 */
export default async function audioToNoteEvents(
  audioURL: string,
  onSuccess: onSuccessCallback,
  onError?: onErrorCallback,
  onProgress?: onProgressCallback,
  options?: detectionOptions
): Promise<void> {
  const audioContext = new AudioContext({ sampleRate: 22050 });

  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];

  try {
    const response = await fetch(audioURL);
    const arrayBuffer = await response.arrayBuffer();
    const decodedData = await audioContext.decodeAudioData(arrayBuffer);

    // Instantiate the BasicPitch model
    const basicPitch = new BasicPitch("https://raw.githubusercontent.com/spotify/basic-pitch-ts/main/model/model.json");

    // Evaluate the model on the decoded audio data
    await basicPitch.evaluateModel(
      decodedData,
      (frame: number[][], onset: number[][], contour: number[][]) => {
        // Collect the frame, onset, and contour data
        frames.push(...frame);
        onsets.push(...onset);
        contours.push(...contour);
      },
      (pct: number) => {
        if (onProgress) {
          onProgress(pct);
        }
      }
    );

    // Destructure the options with default values
    const {
      onsetThresh = 0.5,
      frameThresh = 0.3,
      minNoteLen = 5,
      inferOnsets = true,
      maxFreq = null,
      minFreq = null,
      melodiaTrick = true,
      energyTolerance = 11,
    } = options || {};

    // Convert the collected data to note events
    const notes = noteFramesToTime(
      addPitchBendsToNoteEvents(
        contours,
        outputToNotesPoly(frames, onsets, onsetThresh, frameThresh, minNoteLen, inferOnsets, maxFreq, minFreq, melodiaTrick, energyTolerance)
      )
    );
    const noteEvents = notes.map((n) => ({
      pitch: n.pitchMidi,
      duration: n.durationSeconds,
      onset: n.startTimeSeconds,
      pitchBends: n.pitchBends,
      velocity: n.amplitude,
    }));

    // Sort the note events by onset time and pitch
    noteEvents.sort((a, b) => a.onset - b.onset || a.pitch - b.pitch);

    // Call the success callback with the resulting note events
    onSuccess(noteEvents);
  } catch (error) {
    // Call the error callback if provided
    if (onError) {
      onError(error);
    }
  }
}

// Define note event
type NoteEvent = {
  pitch: number;
  onset: number;
  duration: number;
  velocity?: number;
  pitchBends?: number[];
};

// Define the options for audio detection
type detectionOptions = {
  onsetThresh?: number;
  frameThresh?: number;
  minNoteLen?: number;
  inferOnsets?: boolean;
  maxFreq?: number | null;
  minFreq?: number | null;
  melodiaTrick?: boolean;
  energyTolerance?: number;
};

// Define the callback types
type onSuccessCallback = (notes: NoteEvent[]) => void;
type onErrorCallback = (error: any) => void;
type onProgressCallback = (percent: number) => void;

```

You can then use this function in your application however you wish!

### Scripts

- `yarn build`: CommonJS Modules (`/cjs`), and ESModule (`/esm`) from the source using the [TypeScript Compiler](https://www.typescriptlang.org/docs/handbook/compiler-options.html).
- `yarn lint`: Lint all source files via [ESLint].
- `yarn test`: Run all tests via [Jest].
- `yarn commit`: Create a commit, correctly formatted using [commitizen].
- `yarn release`: Trigger a release based on your commit messages using [semantic-release].

### Continuous Integration / Publishing

CI is enabled via github actions.

[commitizen], [semantic-release], and [conventional-changelog] are all enabled by default. If you use `yarn commit` to format your commit messages, semantic-release will figure out what the next release of your library should be and will publish it to npm on every merge to master.

### Model Input

**Supported Audio Codecs**

`basic-pitch` accepts all sound files that are compatible with [AudioBuffer](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer) including:

- `.mp3`
- `.ogg`
- `.wav`
- `.flac`

**Mono Channel Audio Only**

While you may use stereo audio as an input to our model, at prediction time, the channels of the input will be down-mixed to mono, and then analyzed and transcribed.

**File Size/Audio Length**

This model can process any size or length of audio, but processing of larger/longer audio files could be limited by your machine's available disk space. To process these files, we recommend streaming the audio of the file, processing windows of audio at a time.

**Sample Rate**

Input audio maybe be of any sample rate, however, all audio will be resampled to 22050 Hz before processing.

## Contributing

Contributions to `basic-pitch` are welcomed! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Copyright and License

`basic-pitch` is Copyright 2022 Spotify AB.

This software is licensed under the Apache License, Version 2.0 (the "Apache License"). You may choose either license to govern your use of this software only upon the condition that you accept all of the terms of either the Apache License.

You may obtain a copy of the Apache License at:

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the Apache License or the GPL License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Apache License for the specific language governing permissions and limitations under the Apache License.

---

[commitizen]: https://github.com/commitizen/cz-cli
[conventional-changelog]: https://github.com/conventional-changelog/conventional-changelog
[eslint]: https://eslint.org/
[jest]: http://jestjs.io/
[semantic-release]: https://github.com/semantic-release/semantic-release
