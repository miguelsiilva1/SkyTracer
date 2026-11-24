# US18 — Cross-platform application

**Epic:** E5 · **Priority:** M · **SP:** 8 · **Status:** ⏳ planned for Sprint 3

## User Story

> As a user, I want to use the application on the web, Android, and iOS with the same features.

## Acceptance Criteria (proposed)

- The app is a single Expo (React Native) codebase building for web, Android, and iOS.
- The map uses `maplibre-gl` on the web. On mobile, two options will be compared during Sprint 3 planning: `@maplibre/maplibre-react-native` (same map and themes as the web) or the device's own map through `react-native-maps` (Apple Maps on iOS, Google Maps on Android, the latter requiring a Google Maps API key). On the web, Google or Apple maps would require API keys and billing accounts, so the web keeps the OpenStreetMap-based themes.
- Features from US06–US10 are available across all three platforms.
- The web version is published to GitHub Pages by CI.

> Criteria to be validated during Sprint 3 planning; the design (SD) will be produced at that stage.

## Diagrams

- Cross-cutting requirement (no dedicated SSD); app architecture will be described in Sprint 3.
