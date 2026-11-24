/** Backend address; `EXPO_PUBLIC_API_URL` overrides it (for example a local `wrangler dev`). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "https://skytracer.cardly-server.workers.dev").replace(/\/+$/, "");

export const WS_URL = API_URL.replace(/^http/, "ws") + "/ws/live";

/** Map start: centred on the receiver area (Porto). */
export const MAP_CENTER: [number, number] = [-8.6, 41.3];
export const MAP_ZOOM = 6.5;

/** Track window shown for the selected aircraft, and how often it is refreshed. */
export const TRACK_MINUTES = 60;
export const TRACK_REFRESH_MS = 15_000;
