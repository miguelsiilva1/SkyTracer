# app — Expo (React Native)

A single codebase for **web, Android and iOS**.

## Project setup (Sprint 0)

From the repository root:

```bash
npx create-expo-app@latest app --template default
cd app
npx expo install react-dom react-native-web @expo/metro-runtime
npm install maplibre-gl @maplibre/maplibre-react-native
```

## Platform-specific map

Expo selects the appropriate file automatically:

```
components/
  Map.web.tsx      → maplibre-gl (browser)
  Map.native.tsx   → @maplibre/maplibre-react-native (Android/iOS)
```

The rest of the application (panels, filters, API calls) is shared.

> Note: `@maplibre/maplibre-react-native` relies on native code, so mobile devices require a *development build* (`npx expo run:android` / `eas build`) rather than Expo Go.

## Web build for GitHub Pages

```bash
npx expo export --platform web   # outputs to app/dist/
```
