import { wallClockDate } from "@/lib/places/hours";
import { searchInventory } from "@/lib/places";
import { distanceM } from "@/lib/geo";
import { culturalEvidence, namesMatch } from "@/lib/qloo";
import type { CulturalEntity, FeedbackEntry, Place, SearchConstraints, SearchResult, UserLocation } from "@/types";
import { relevantCategories } from "./activities";
import { rank } from "./rank";

/** OSM often maps one venue twice (a node and a building outline). Keep the record with more listed data. */
function dedupe(places: Place[]): Place[] {
  const richness = (p: Place) =>
    [p.openingHoursRaw, p.address, p.url, p.priceLevel, p.imageUrl].filter(Boolean).length +
    (p.wifi !== "unknown" ? 1 : 0) +
    (p.outdoorSeating !== "unknown" ? 1 : 0);
  const kept: Place[] = [];
  for (const p of [...places].sort((a, b) => richness(b) - richness(a))) {
    if (!kept.some((k) => distanceM(k, p) < 80 && namesMatch(k.name, p.name))) kept.push(p);
  }
  return kept;
}

export interface SearchInput {
  location: UserLocation;
  constraints: SearchConstraints;
  tasteSignals: CulturalEntity[];
  feedback: FeedbackEntry[];
  clientNow: string;
  onStatus?: (label: string) => void;
}

/**
 * The single recommendation pipeline shared by the agent, the quick-search UI and the Taste Lens:
 *   1. fetch the place inventory (provider chain)
 *   2. fetch cultural evidence for the same area (Qloo live or labeled demo)
 *   3. merge Qloo-only places into the shared candidate pool (so both lenses rank the same set)
 *   4. apply hard constraints and score deterministically in both modes
 */
export async function runSearch(input: SearchInput): Promise<SearchResult> {
  const { location, constraints } = input;
  input.onStatus?.("Looking around the area…");
  const categories = constraints.includeCategories.length ? constraints.includeCategories : relevantCategories(constraints.activity);
  const inventory = await searchInventory({ lat: location.lat, lon: location.lon, radiusM: constraints.radiusM, categories });

  if (input.tasteSignals.length) input.onStatus?.("Connecting your interests to nearby places…");
  const taste = await culturalEvidence({
    signals: input.tasteSignals,
    lat: location.lat,
    lon: location.lon,
    radiusM: constraints.radiusM,
    inventory: inventory.places,
    categories,
  });

  input.onStatus?.("Finding places that fit…");
  const places = inventory.places.map((p) => taste.enriched.get(p.id) ?? p);
  const candidates = dedupe([...places, ...taste.extraPlaces]).map((place) => ({ place, cultural: taste.evidence.get(place.id) }));
  const { recommendations, filteredOut } = rank({
    candidates,
    location,
    constraints,
    feedback: input.feedback,
    now: wallClockDate(input.clientNow),
  });

  return {
    id: `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    location,
    constraints,
    tasteSignals: input.tasteSignals,
    // Both lenses must be able to show their own top 40, so keep the union (still in practical order).
    recommendations: recommendations.filter((r) => r.practicalRank <= 40 || r.tasteRank <= 40),
    filteredOut: filteredOut.slice(0, 60),
    inventory: {
      provider: inventory.provider,
      count: inventory.places.length + taste.extraPlaces.length,
      note: inventory.note,
    },
    taste: {
      mode: input.tasteSignals.length ? taste.mode : "off",
      status: taste.status,
      message: taste.message,
      matched: recommendations.filter((r) => r.cultural).length,
    },
  };
}
