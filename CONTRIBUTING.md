# How to Contribute

Basic Pitch welcomes your contributions!

## Getting Started

To get your environment set up to build `basic-pitch`, you'll need [Yarn](https://classic.yarnpkg.com/en/) and [Node](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) on your machine. We also recommend installing [Node Version Manager](https://github.com/nvm-sh/nvm).

Then, you can run `yarn install` followed by `yarn test` to test your local changes.

## Workflow

We follow the [GitHub Flow Workflow](https://guides.github.com/introduction/flow/):

1.  Fork the project
1.  Check out the `main` branch
1.  Create a feature branch
1.  Write code and tests for your change
1.  From your branch, make a pull request against `https://github.com/spotify/basic-pitch-ts`
1.  Work with repo maintainers to get your change reviewed
1.  Wait for your change to be pulled into `https://github.com/spotify/basic-pitch/main-ts`
1.  Delete your feature branch

## Committing

We use semantic-release for releasing new versions. As such, the version is not controlled by `package.json` but instead by the CI via commit messages. When committing new code please use

```
yarn commit
```

or else a new version will not be created upon merge.

## Testing

We use a package.json script for testing - running tests from end-to-end should be as simple as:

```
yarn test
```

### Generating new testing data

Some tests are designed to ensure parity with the [Python version of Basic Pitch](https://github.com/spotify/basic-pitch). If you are trying to adapt changes from the Python library you will have to:

1. Uncomment the line calling `writeDebugOutput` in the `Can infer a C Major Scale` test. Once the test runs you should double check the output files to ensure they make sense and then recomment that line. You will have to commit the new test results.
2. Generate new debug output from the Python library for the `vocal-da-80bpm` test. These new files will also have to be committed. For example, assuming you have the Python library already installed, this can be as simple as:

```
python3 -m basic_pitch.predict . ~/basic-pitch-ts/test_data/vocal-da-80bpm.22050.wav  --debug-file ~/basic-pitch-ts/test_data/vocal-da-80bpm.nomelodia.json  --no-melodia
python3 -m basic_pitch.predict . ~//basic-pitch-ts/test_data/vocal-da-80bpm.22050.wav  --debug-file ~/basic-pitch-ts/test_data/vocal-da-80bpm.nomelodia.json  --no-melodia
```

## Style

Use `prettier` with defaults for Python code. The associated package.json script is:

```
yarn format
yarn lint
```

## Issues

When creating an issue please try to ahere to the following format:

    module-name: One line summary of the issue (less than 72 characters)

    ### Expected behaviour

    As concisely as possible, describe the expected behaviour.

    ### Actual behaviour

    As concisely as possible, describe the observed behaviour.

    ### Steps to reproduce the behaviour

    List all relevant steps to reproduce the observed behaviour.

## Documentation

We also welcome improvements to the project documentation or to the existing
docs. Please file an [issue](https://github.com/spotify/basic-pitch/issues/new).

## First Contributions

If you are a first time contributor to `basic-pitch`, familiarize yourself with the:

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [GitHub Flow Workflow](https://guides.github.com/introduction/flow/)
<!-- * Issue and pull request style guides -->

When you're ready, navigate to [issues](https://github.com/spotify/basic-pitch/issues/new). Some issues have been identified by community members as [good first issues](https://github.com/spotify/basic-pitch/labels/good%20first%20issue).

There is a lot to learn when making your first contribution. As you gain experience, you will be able to make contributions faster. You can submit an issue using the [question](https://github.com/spotify/basic-pitch/labels/question) label if you encounter challenges.

# License

By contributing your code, you agree to license your contribution under the
terms of the [LICENSE](https://github.com/spotify/basic-pitch/blob/main/LICENSE).

# Code of Conduct

Read our [Code of Conduct](CODE_OF_CONDUCT.md) for the project.
