# app — Expo (React Native)

A single codebase for **web, Android and iOS**. It shows the aircraft received by the Porto receiver on a live map, using the SkyTracer API.

## Running

```bash
cd app
npm install          # also copies the MapLibre worker to public/
npm run web          # development server (web)
npm run typecheck
npm run build:web    # static export to app/dist/, served under /SkyTracer
```

The app uses the production API by default; `EXPO_PUBLIC_API_URL` points it to another backend (for example a local backend). The API only accepts browser requests from the production site and from the Expo development server (`localhost:8081`).

## Structure

```
App.tsx                       layout: map, header and aircraft panel
src/
  useLiveAircraft.ts          live state from WS /ws/live, with automatic reconnection (US06)
  api.ts                      REST calls (track, US10; stored aircraft, US09)
  filters.ts                  search keywords and quick filters over the live state (US08, US09)
  altitude.ts                 altitude colour scale shared by icons, track and legend
  theme.ts                    design tokens: day and night palettes, map styles, type scale, spacing
  ThemeContext.tsx            day / night theme, remembered on the device
  components/
    LiveMap.web.tsx           maplibre-gl map (browser)
    LiveMap.tsx               native placeholder until the native map (Sprint 3, US18)
    AircraftPanel.tsx         aircraft details as a flight progress strip: route, live values, photo (US03, US04, US07)
    TopBar.tsx                title block in ruled sections: status, search, filters, legend, theme and language;
                              on narrow screens a compact bar whose filters open on demand
    SearchFilters.tsx         search field and results (US09), quick filters (US08)
assets/source/                SVG sources of the app icon, splash and favicon (PNGs rendered from them)
```

## Visual design

The interface borrows from aeronautical charts and ATC flight progress strips. Text uses B612, the typeface designed by Airbus for cockpit displays, and B612 Mono for codes (callsigns, squawks, ICAO and IATA codes). The day theme uses chart-paper tones with aeronautical blue and chart magenta; the night theme uses instrument-panel navy. Aircraft, tracks and the legend share one altitude colour scale.

Expo picks `LiveMap.web.tsx` on the web and `LiveMap.tsx` on Android and iOS. The native map will use `@maplibre/maplibre-react-native`, which relies on native code and therefore requires a *development build* (`npx expo run:android` / `eas build`) instead of Expo Go.

## Deployment

The web build is published to GitHub Pages by the `Web app (GitHub Pages)` workflow on every push to `main` that changes `app/`, at https://miguelsiilva1.github.io/SkyTracer/. The published site needs no local process: it connects directly to the production API.
