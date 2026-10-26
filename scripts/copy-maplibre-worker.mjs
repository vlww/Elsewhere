// MapLibre 6 resolves its web worker relative to its own module URL, which a bundler rewrites.
// Serve the worker from /maplibre/ instead (see setWorkerUrl in MapCanvas).
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("maplibre-gl/package.json")) + "/dist";
const out = new URL("../public/maplibre/", import.meta.url);
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(dist, "maplibre-gl-worker.mjs"), new URL("maplibre-gl-worker.mjs", out));
console.log("copied maplibre-gl-worker.mjs → public/maplibre/");
