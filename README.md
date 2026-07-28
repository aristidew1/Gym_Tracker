# Muscu Tracker

Muscu Tracker is a web-based strength-training tracker packaged for Android with Capacitor. It supports workout logging, programs, exercise tracking, progression, statistics, rest timers, and native Android notifications.

## Independent, AI-Assisted Development

This project was built as an autonomous personal effort. I defined the goals, made the product and technical decisions, implemented and tested the application, and used AI as an assistant to research, review ideas, solve implementation problems, and improve the codebase. AI supported the process; the direction, validation, and ownership of the work remain mine.

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
