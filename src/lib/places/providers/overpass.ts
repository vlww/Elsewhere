import { fetchWithTimeout } from "@/lib/cache";
import { normalizeOsm, type OsmElement } from "@/lib/places/osm";
import type { Place, PlaceCategory } from "@/types";
import { ProviderError, type NearbyQuery, type PlaceProvider } from "./types";

const SELECTORS: Record<PlaceCategory, string[]> = {
  cafe: ['["amenity"="cafe"]'],
  tea: ['["shop"="tea"]', '["amenity"="cafe"]["cuisine"~"tea"]'],
  library: ['["amenity"="library"]'],
  bookstore: ['["shop"="books"]'],
  park: ['["leisure"="park"]'],
  garden: ['["leisure"="garden"]'],
  gallery: ['["tourism"="gallery"]', '["shop"="art"]'],
  museum: ['["tourism"="museum"]'],
  arts_centre: ['["amenity"="arts_centre"]'],
  coworking: ['["amenity"="coworking_space"]', '["office"="coworking"]'],
  cinema: ['["amenity"="cinema"]'],
  music: ['["shop"="music"]'],
  community: ['["amenity"="community_centre"]'],
  plaza: ['["place"="square"]'],
  other: [],
};

function endpoints(): string[] {
  return (process.env.OVERPASS_URL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const overpassProvider: PlaceProvider = {
  id: "overpass",
  label: "OpenStreetMap (Overpass)",
  async searchNearby(q: NearbyQuery) {
    const cats = q.categories.length ? q.categories : (Object.keys(SELECTORS) as PlaceCategory[]);
    const sels = [...new Set(cats.flatMap((c) => SELECTORS[c]))];
    const around = `(around:${Math.round(q.radiusM)},${q.lat.toFixed(5)},${q.lon.toFixed(5)})`;
    const body = `[out:json][timeout:20];(${sels.map((s) => `nwr${around}${s}["name"];`).join("")});out center tags 400;`;

    let lastError = "no endpoints configured";
    for (const url of endpoints()) {
      try {
        const res = await fetchWithTimeout(url, {
          method: "POST",
          timeoutMs: 15000,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": process.env.HTTP_USER_AGENT ?? "Elsewhere/0.1",
            Accept: "application/json",
          },
          body: new URLSearchParams({ data: body }),
        });
        if (!res.ok) {
          lastError = `${url} → HTTP ${res.status}`;
          continue;
        }
        const json = (await res.json()) as { elements?: OsmElement[] };
        const fetchedAt = new Date().toISOString();
        return (json.elements ?? [])
          .map((el) => normalizeOsm(el, "osm", fetchedAt))
          .filter((p): p is Place => p !== null);
      } catch (e) {
        lastError = `${url} → ${(e as Error).name === "AbortError" ? "timeout" : (e as Error).message}`;
      }
    }
    throw new ProviderError(`overpass failed: ${lastError}`, "OpenStreetMap search is unavailable right now.", "unavailable");
  },
};
