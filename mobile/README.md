# Luma Mobile

React Native/Expo version of Luma for mobile development.

## Run

From the repository root:

```bash
npm run mobile:dev
```

Or from this folder:

```bash
npm run start
```

Then open the project with Expo Go, Android Emulator, iOS Simulator, or the web target.

## Scripts

```bash
npm run mobile:dev
npm run mobile:android
npm run mobile:ios
npm run mobile:web
```

On this Windows workspace the scripts disable Expo telemetry so Expo does not need to write to the user home `.expo` folder while running under Codex sandboxing.

## Current Scope

- Pick local audio files from the device
- Build a temporary playback queue
- Play, pause, previous, next
- Show current playback progress
- Clear queue

Desktop and mobile are intentionally separate apps for now. The desktop app uses Electron/Howler and the mobile app uses Expo APIs, so the first shared layer should be data shape and UI language rather than audio runtime code.
