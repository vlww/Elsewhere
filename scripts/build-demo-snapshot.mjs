// Builds src/data/demo-area.json from a raw OpenStreetMap API export.
//
//   curl -H "Accept: application/json" \
//     "https://api.openstreetmap.org/api/0.6/map.json?bbox=-74.0045,40.7255,-73.9905,40.7365" -o osm.json
//   node scripts/build-demo-snapshot.mjs osm.json
//
// Only tags Elsewhere uses are kept. Data © OpenStreetMap contributors, ODbL 1.0.
import fs from "node:fs";

const [, , input] = process.argv;
if (!input) throw new Error("usage: node scripts/build-demo-snapshot.mjs <osm.json>");

const raw = JSON.parse(fs.readFileSync(input, "utf8"));
const nodes = new Map();
for (const el of raw.elements) if (el.type === "node") nodes.set(el.id, el);

const KEEP = [
  "name", "amenity", "shop", "leisure", "tourism", "place", "highway", "cuisine",
  "opening_hours", "internet_access", "internet_access:fee", "outdoor_seating", "indoor_seating",
  "website", "contact:website", "phone", "addr:housenumber", "addr:street", "addr:city", "addr:postcode",
  "wheelchair", "description", "image", "wikidata", "wikimedia_commons", "check_date", "check_date:opening_hours",
  "fee", "access", "operator", "brand", "takeaway", "smoking", "toilets", "socket", "level",
];

const RELEVANT = (t) =>
  t.name &&
  (["cafe", "library", "arts_centre", "coworking_space", "community_centre", "cinema", "studio", "restaurant", "fast_food", "food_court", "ice_cream"].includes(t.amenity) ||
    ["books", "tea", "music", "art", "stationery", "bakery", "pastry", "deli"].includes(t.shop) ||
    ["park", "garden"].includes(t.leisure) ||
    ["gallery", "museum"].includes(t.tourism) ||
    (t.place === "square"));

const out = [];
for (const el of raw.elements) {
  const t = el.tags;
  if (!t || !RELEVANT(t)) continue;
  if (t.access === "private") continue;
  let lat, lon;
  if (el.type === "node") ({ lat, lon } = el);
  else if (el.type === "way") {
    const pts = (el.nodes ?? []).map((id) => nodes.get(id)).filter(Boolean);
    if (!pts.length) continue;
    lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    lon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
  } else continue;
  const tags = Object.fromEntries(KEEP.filter((k) => t[k] != null).map((k) => [k, t[k]]));
  out.push({ type: el.type, id: el.id, lat: +lat.toFixed(6), lon: +lon.toFixed(6), tags });
}

const snapshot = {
  name: "Washington Square & Greenwich Village, New York",
  center: { lat: 40.73085, lon: -73.99735 },
  bbox: [-74.0045, 40.7255, -73.9905, 40.7365],
  source: "OpenStreetMap API 0.6 export",
  license: "© OpenStreetMap contributors, ODbL 1.0",
  snapshotDate: new Date().toISOString().slice(0, 10),
  elements: out,
};
fs.writeFileSync(new URL("../src/data/demo-area.json", import.meta.url), JSON.stringify(snapshot));
console.log(`wrote ${out.length} places`);
