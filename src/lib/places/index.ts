import { TtlCache, } from "@/lib/cache";
import { roundCoord } from "@/lib/geo";
import type { Place } from "@/types";
import { demoProvider, inDemoArea } from "./providers/demo";
import { googleProvider } from "./providers/google";
import { overpassProvider } from "./providers/overpass";
import { ProviderError, type NearbyQuery, type PlaceProvider, type TextQuery } from "./providers/types";

export { ProviderError } from "./providers/types";
export { DEMO_AREA, inDemoArea } from "./providers/demo";

const cache = new TtlCache<{ places: Place[]; provider: string; note?: string }>(10 * 60 * 1000);

/** Provider order: explicit PLACES_PROVIDER, else Google (if keyed) → Overpass (if configured) → demo snapshot. */
function chain(): PlaceProvider[] {
  const explicit = process.env.PLACES_PROVIDER;
  if (explicit === "google") return [googleProvider];
  if (explicit === "overpass") return [overpassProvider];
  if (explicit === "demo") return [demoProvider];
  const out: PlaceProvider[] = [];
  if (process.env.GOOGLE_PLACES_API_KEY) out.push(googleProvider);
  if (process.env.OVERPASS_URL) out.push(overpassProvider);
  out.push(demoProvider);
  return out;
}

export function placesProviderSummary() {
  return chain().map((p) => p.label);
}

export async function searchInventory(q: NearbyQuery): Promise<{ places: Place[]; provider: string; note?: string }> {
  const key = `${roundCoord(q.lat)}:${roundCoord(q.lon)}:${Math.round(q.radiusM / 100)}:${[...q.categories].sort().join(",")}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const failures: string[] = [];
  let lastError: ProviderError | null = null;
  for (const provider of chain()) {
    // The demo snapshot only ever stands in for live data inside its own area.
    if (provider.id === "demo" && failures.length && !inDemoArea(q.lat, q.lon)) break;
    try {
      const places = await provider.searchNearby(q);
      const result = {
        places,
        provider: provider.label,
        note: failures.length ? `${failures.join("; ")}. Showing ${provider.label} instead.` : undefined,
      };
      cache.set(key, result);
      return result;
    } catch (e) {
      if (e instanceof ProviderError) {
        lastError = e;
        failures.push(e.userMessage);
        console.warn(`[places] ${provider.id}: ${e.message}`);
      } else throw e;
    }
  }
  throw lastError ?? new ProviderError("no providers", "No places provider is available.", "config");
}

const textCache = new TtlCache<Place[]>(10 * 60 * 1000);

/** Free-text search from the first provider that supports it; [] when none does or it fails. */
export async function searchByText(q: TextQuery): Promise<Place[]> {
  const provider = chain().find((p) => p.searchText);
  if (!provider?.searchText) return [];
  const key = `${provider.id}:${q.text.toLowerCase()}:${roundCoord(q.lat)}:${roundCoord(q.lon)}:${Math.round(q.radiusM / 100)}`;
  const hit = textCache.get(key);
  if (hit) return hit;
  try {
    const places = await provider.searchText(q);
    textCache.set(key, places);
    return places;
  } catch (e) {
    console.warn(`[places] text ${provider.id}: ${(e as Error).message}`);
    return [];
  }
}
