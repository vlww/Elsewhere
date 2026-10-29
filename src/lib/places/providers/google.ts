import { z } from "zod";
import { fetchWithTimeout } from "@/lib/cache";
import type { Place, PlaceCategory } from "@/types";
import { ProviderError, type NearbyQuery, type PlaceProvider } from "./types";

// Google Places API (New): Nearby Search. https://developers.google.com/maps/documentation/places/web-service/nearby-search
const TYPE_GROUPS: { types: string[]; categories: PlaceCategory[] }[] = [
  { types: ["cafe", "coffee_shop", "tea_house"], categories: ["cafe", "tea"] },
  { types: ["library", "book_store"], categories: ["library", "bookstore"] },
  { types: ["park", "art_gallery", "museum"], categories: ["park", "garden", "gallery", "museum", "plaza"] },
  { types: ["restaurant", "bakery"], categories: ["food"] },
];

const GOOGLE_TO_CATEGORY: Record<string, PlaceCategory> = {
  cafe: "cafe",
  coffee_shop: "cafe",
  tea_house: "tea",
  library: "library",
  book_store: "bookstore",
  park: "park",
  art_gallery: "gallery",
  museum: "museum",
  movie_theater: "cinema",
  community_center: "community",
  botanical_garden: "garden",
  garden: "garden",
  plaza: "plaza",
  restaurant: "food",
  bakery: "food",
  fast_food_restaurant: "food",
};

const PRICE: Record<string, number> = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const Point = z.object({ day: z.number(), hour: z.number().default(0), minute: z.number().default(0) });
const GPlace = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }).optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  primaryType: z.string().optional(),
  types: z.array(z.string()).optional(),
  shortFormattedAddress: z.string().optional(),
  formattedAddress: z.string().optional(),
  priceLevel: z.string().optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  websiteUri: z.string().optional(),
  googleMapsUri: z.string().optional(),
  outdoorSeating: z.boolean().optional(),
  editorialSummary: z.object({ text: z.string() }).optional(),
  regularOpeningHours: z
    .object({
      periods: z.array(z.object({ open: Point, close: Point.optional() })).optional(),
      weekdayDescriptions: z.array(z.string()).optional(),
    })
    .optional(),
  currentOpeningHours: z.object({ openNow: z.boolean().optional() }).optional(),
  photos: z.array(z.object({ name: z.string(), authorAttributions: z.array(z.object({ displayName: z.string().optional() })).optional() })).optional(),
});

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Converts Google periods into OSM opening_hours syntax so one evaluator handles every provider. */
function periodsToOsm(periods: z.infer<typeof GPlace>["regularOpeningHours"]): string | undefined {
  const ps = periods?.periods;
  if (!ps?.length) return undefined;
  if (ps.length === 1 && !ps[0].close) return "24/7";
  const rules = ps
    .filter((p) => p.close)
    .map((p) => `${DAYS[p.open.day]} ${pad(p.open.hour)}:${pad(p.open.minute)}-${pad(p.close!.hour)}:${pad(p.close!.minute)}`);
  return rules.length ? rules.join(", ") : undefined;
}

function categoryFor(p: z.infer<typeof GPlace>): PlaceCategory | null {
  for (const t of [p.primaryType, ...(p.types ?? [])]) if (t && GOOGLE_TO_CATEGORY[t]) return GOOGLE_TO_CATEGORY[t];
  return null;
}

const FIELDS = [
  "places.id", "places.displayName", "places.location", "places.primaryType", "places.types",
  "places.shortFormattedAddress", "places.formattedAddress", "places.priceLevel", "places.rating",
  "places.userRatingCount", "places.websiteUri", "places.googleMapsUri", "places.outdoorSeating",
  "places.editorialSummary", "places.regularOpeningHours", "places.currentOpeningHours.openNow", "places.photos",
].join(",");

export const googleProvider: PlaceProvider = {
  id: "google",
  label: "Google Places",
  async searchNearby(q: NearbyQuery) {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key) throw new ProviderError("missing key", "Google Places isn't configured.", "config");
    const groups = TYPE_GROUPS.filter((g) => !q.categories.length || g.categories.some((c) => q.categories.includes(c)));
    const fetchedAt = new Date().toISOString();

    const responses = await Promise.allSettled(
      groups.map(async (g) => {
        const res = await fetchWithTimeout("https://places.googleapis.com/v1/places:searchNearby", {
          method: "POST",
          timeoutMs: 10000,
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
          body: JSON.stringify({
            includedTypes: g.types,
            maxResultCount: 20,
            rankPreference: "DISTANCE",
            locationRestriction: { circle: { center: { latitude: q.lat, longitude: q.lon }, radius: Math.min(q.radiusM, 50000) } },
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return z.object({ places: z.array(z.unknown()).optional() }).parse(await res.json()).places ?? [];
      }),
    );
    if (responses.every((r) => r.status === "rejected")) {
      const reason = (responses[0] as PromiseRejectedResult | undefined)?.reason;
      throw new ProviderError(`google failed: ${reason}`, "Google Places search failed.", "unavailable");
    }

    const out = new Map<string, Place>();
    for (const r of responses) {
      if (r.status !== "fulfilled") continue;
      for (const raw of r.value) {
        const parsed = GPlace.safeParse(raw);
        if (!parsed.success) continue;
        const p = parsed.data;
        const category = categoryFor(p);
        if (!category || out.has(p.id)) continue;
        const photo = p.photos?.[0];
        out.set(p.id, {
          id: `google:${p.id}`,
          providerId: p.id,
          source: "google",
          name: p.displayName?.text ?? "Unnamed place",
          lat: p.location.latitude,
          lon: p.location.longitude,
          category,
          subcategory: p.primaryType,
          address: p.shortFormattedAddress ?? p.formattedAddress,
          url: p.websiteUri,
          providerUrl: p.googleMapsUri,
          openingHoursRaw: periodsToOsm(p.regularOpeningHours),
          openingHoursText: p.regularOpeningHours?.weekdayDescriptions,
          openNowReported: p.currentOpeningHours?.openNow,
          priceLevel: p.priceLevel ? PRICE[p.priceLevel] : undefined,
          rating: p.rating,
          ratingCount: p.userRatingCount,
          wifi: "unknown",
          outdoorSeating: p.outdoorSeating === undefined ? "unknown" : p.outdoorSeating ? "yes" : "no",
          wheelchair: "unknown",
          description: p.editorialSummary?.text,
          // Served through /api/photo so the API key never reaches the browser.
          imageUrl: photo ? `/api/photo?name=${encodeURIComponent(photo.name)}` : undefined,
          imageCredit: photo?.authorAttributions?.[0]?.displayName ? `Photo: ${photo.authorAttributions[0].displayName} via Google` : undefined,
          tags: p.priceLevel === "PRICE_LEVEL_FREE" ? ["free"] : [],
          fetchedAt,
        });
      }
    }
    return [...out.values()];
  },
};
