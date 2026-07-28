# Muscu Tracker

Muscu Tracker is a web-based strength-training tracker packaged for Android with Capacitor. It supports workout logging, programs, exercise tracking, progression, statistics, rest timers, and native Android notifications.

## Independent, AI-Assisted Development

This project was coded entirely by AI under my direction. I set the product vision, requirements, priorities, and technical constraints; the AI translated those instructions into implementation work across the web application and its Android integration.

I also designed a workflow that makes the AI's work independently verifiable. The AI can run the automated checks, synchronize and build the Android project, launch an Android emulator, and test the application in a real mobile runtime. It uses the results of those checks to identify issues, correct its own implementation, and repeat the validation cycle until the expected behavior is reached.

My role is to direct the AI, validate the outcomes, and retain ownership of the project. The code is AI-generated; the intent, decisions, evaluation framework, and final acceptance are mine.

## Requirements

- Node.js (an LTS version is recommended)
- Android Studio and an Android SDK, only required to build or install the Android application

## Installation

```sh
npm install
```

## Useful commands

| Command | Description |
| --- | --- |
| `npm test` | Runs the business-logic test suite. |
| `npm run sync:web` | Copies the web source files to `www/`. |
| `npm run sync:android` | Synchronizes the web source files, then the Capacitor Android project. |

## Project structure

- `app.js`, `index.html`, `index.css`: main application interface.
- `data/`: exercise catalogue, default program, and progression rules.
- `models/`: workout data schemas, validation, and migrations.
- `services/`: program storage and progression logic.
- `storage.js`: local persistence, imports, and exports.
- `tests/`: automated Node.js tests.
- `android/`: Capacitor Android project and native notification integration.
- `www/`: generated copy of the web source files used by Capacitor.

## Development workflow

The root-level files and the `data/`, `models/`, and `services/` directories are the source of truth. Do not edit `www/` directly; regenerate it after changing the web source files:

```sh
npm run sync:web
```

Before a release, run:

```sh
npm test
npm run sync:android
```

Node.js dependencies and Android build/cache files are not versioned. Recreate them with `npm install` and the synchronization or Android build commands.
