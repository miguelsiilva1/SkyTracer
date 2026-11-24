// maplibre-gl 6 runs its tile parsing in a separate ES module worker, which Metro does not
// bundle; it is copied to public/ so it is served next to the web build.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre-gl-worker.mjs");
