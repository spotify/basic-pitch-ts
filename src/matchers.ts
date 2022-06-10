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

/**
 * A jest matcher to test whether or not two arrays are "close" to each other.
 * @param received The calculated result.
 * @param argument The expected result.
 * @param atol absolute tolerance.
 * @param rtol relative tolerance.
 * @returns A success object if |received - argument| > atol + rtol * |received|
 * for all elements in both arrays else a failure object.
 */
export const toAllBeClose = (
  received: number[],
  argument: number[],
  atol: number = 1e-3,
  rtol: number = 1e-5,
) => {
  if (received === undefined) {
    return {
      pass: false,
      message: () => `Received must be number[] ` + `Received is ${received}. `,
    };
  }
  if (argument === undefined) {
    return {
      pass: false,
      message: () =>
        `Argument must be number[]. ` + `Received is ${argument}. `,
    };
  }
  if (received.length !== argument.length) {
    return {
      pass: false,
      message: () =>
        `Received and expected lengths do not match! ` +
        `Received has length ${received.length}. ` +
        `Expected has length ${argument.length}.`,
    };
  }
  for (let i = 0; i < received.length; ++i) {
    if (
      Math.abs(received[i] - argument[i]) >
      atol + rtol * Math.abs(received[i])
    ) {
      return {
        pass: false,
        message: () =>
          `Expected all number elements in ${JSON.stringify(
            received.slice(
              Math.max(0, i - 5),
              Math.min(received.length - 1, i + 5),
            ),
            null,
            '  ',
          )} ` +
          `to be close to ${JSON.stringify(
            argument.slice(
              Math.max(0, i - 5),
              Math.min(argument.length - 1, i + 5),
            ),
            null,
            '  ',
          )} ` +
          `(this is a slice of the data at the location + -5 elements). ` +
          `${received[i]} != ${argument[i]} at index ${i}.`,
      };
    }
  }

  return {
    pass: true,
    message: () => ``,
  };
};

expect.extend({
  toAllBeClose,
  // this could be done recursively so we can support n-dimensional arrays
  // alternatively, this could be done with TFJS. Subtract the two tensors and then use whereAsync to find
  // indexes where they are greater than some threshold
});
