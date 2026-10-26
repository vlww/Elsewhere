import snapshot from "@/data/demo-area.json";
import { distanceM } from "@/lib/geo";
import { normalizeOsm, type OsmElement } from "@/lib/places/osm";
import type { Place } from "@/types";
import { ProviderError, type NearbyQuery, type PlaceProvider } from "./types";

export const DEMO_AREA = {
  name: snapshot.name,
  center: snapshot.center,
  bbox: snapshot.bbox as [number, number, number, number],
  snapshotDate: snapshot.snapshotDate,
  license: snapshot.license,
};

export function inDemoArea(lat: number, lon: number) {
  const [w, s, e, n] = DEMO_AREA.bbox;
  const pad = 0.006;
  return lon >= w - pad && lon <= e + pad && lat >= s - pad && lat <= n + pad;
}

let cached: Place[] | null = null;
function allPlaces(): Place[] {
  if (!cached) {
    const fetchedAt = `${snapshot.snapshotDate}T00:00:00Z`;
    cached = (snapshot.elements as unknown as OsmElement[])
      .map((el) => normalizeOsm(el, "demo-snapshot", fetchedAt))
      .filter((p): p is Place => p !== null)
      .map((p) => ({ ...p, dataNote: [`OpenStreetMap snapshot from ${snapshot.snapshotDate}`, p.dataNote].filter(Boolean).join(" · ") }));
  }
  return cached;
}

export const demoProvider: PlaceProvider = {
  id: "demo",
  label: `OpenStreetMap snapshot (${snapshot.snapshotDate})`,
  async searchNearby(q: NearbyQuery) {
    if (!inDemoArea(q.lat, q.lon)) {
      throw new ProviderError(
        "outside demo area",
        `No live places provider is configured, so Elsewhere can only explore the demo area (${DEMO_AREA.name}). Add GOOGLE_PLACES_API_KEY or OVERPASS_URL to search anywhere.`,
        "out-of-area",
      );
    }
    return allPlaces().filter(
      (p) => distanceM(q, p) <= q.radiusM && (q.categories.length === 0 || q.categories.includes(p.category)),
    );
  },
};
