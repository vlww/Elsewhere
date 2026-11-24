import { z } from "zod";

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

export const PLACE_CATEGORIES = [
  "cafe",
  "library",
  "bookstore",
  "park",
  "garden",
  "gallery",
  "museum",
  "arts_centre",
  "coworking",
  "tea",
  "cinema",
  "music",
  "community",
  "plaza",
  "food",
  "other",
] as const;
export const PlaceCategory = z.enum(PLACE_CATEGORIES);
export type PlaceCategory = z.infer<typeof PlaceCategory>;

export const PlaceSource = z.enum(["osm", "google", "demo-snapshot"]);
export type PlaceSource = z.infer<typeof PlaceSource>;

/** A tri-state for amenities: true/false only when a source states it. */
export const Verified = z.enum(["yes", "no", "unknown"]);
export type Verified = z.infer<typeof Verified>;

export const PlaceSchema = z.object({
  id: z.string(), // `${source}:${providerId}`
  providerId: z.string(),
  source: PlaceSource,
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  category: PlaceCategory,
  subcategory: z.string().optional(),
  address: z.string().optional(),
  neighborhood: z.string().optional(),
  url: z.string().optional(),
  providerUrl: z.string().optional(),
  phone: z.string().optional(),
  /** Raw opening hours in OSM syntax, when the provider uses it. */
  openingHoursRaw: z.string().optional(),
  /** Weekly hours as human-readable lines, when the provider supplies them. */
  openingHoursText: z.array(z.string()).optional(),
  /** Who listed the hours, when not the place's own provider. */
  hoursSource: z.string().optional(),
  /** Provider-reported open-now status at fetch time (Google). */
  openNowReported: z.boolean().optional(),
  /** 1 (inexpensive) – 4 (very expensive) */
  priceLevel: z.number().min(1).max(4).optional(),
  rating: z.number().optional(),
  ratingCount: z.number().optional(),
  wifi: Verified,
  outdoorSeating: Verified,
  wheelchair: Verified,
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  imageCredit: z.string().optional(),
  tags: z.array(z.string()).default([]),
  fetchedAt: z.string(),
  dataNote: z.string().optional(),
});
export type Place = z.infer<typeof PlaceSchema>;

// ---------------------------------------------------------------------------
// Taste: interests and their profiles (Elsewhere Taste Engine)
// ---------------------------------------------------------------------------

/** The facets interests and places are both described with. See lib/taste/facets.ts. */
export const FACETS = [
  "quiet",
  "cozy",
  "literary",
  "artsy",
  "design",
  "nature",
  "cinematic",
  "craft",
  "social",
  "lively",
  "nostalgic",
  "music",
  "romantic",
  "offbeat",
  "heritage",
  "foodie",
] as const;
export const FacetSchema = z.enum(FACETS);
export type Facet = z.infer<typeof FacetSchema>;

export const TasteProfileSchema = z.object({
  facets: z.partialRecord(FacetSchema, z.number().min(0).max(1)),
  /** Words a matching listing might contain ("jazz", "vinyl", "matcha"); matched against names, tags and descriptions. */
  keywords: z.array(z.string().max(40)).max(12).default([]),
  /** Kinds of place someone with this interest tends to enjoy. */
  categories: z.array(PlaceCategory).max(4).default([]),
});
export type TasteProfile = z.infer<typeof TasteProfileSchema>;

/** "ai" = profiled by Claude from what was typed; "built-in" = Elsewhere's hand-written lexicon or word rules. */
export const TasteProvenance = z.enum(["ai", "built-in"]);
export type TasteProvenance = z.infer<typeof TasteProvenance>;

export const CulturalEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** What kind of interest: person, artist, film, food, activity, vibe… */
  type: z.string(),
  disambiguation: z.string().optional(),
  imageUrl: z.string().optional(),
  // Interests saved before the taste engine said "live" or "demo"; they're re-profiled by name.
  provenance: z.preprocess((v) => (v === "ai" ? "ai" : "built-in"), TasteProvenance),
  /** Where it came from in this session. */
  origin: z.enum(["picked", "conversation", "saved"]).default("picked"),
  /** Absent only for built-in interests (resolved from the lexicon on the server) and ones saved before profiles existed. */
  profile: TasteProfileSchema.optional(),
});
export type CulturalEntity = z.infer<typeof CulturalEntitySchema>;

// ---------------------------------------------------------------------------
// Constraints and intent
// ---------------------------------------------------------------------------

export const ACTIVITIES = [
  "study",
  "work",
  "read",
  "think",
  "meet",
  "create",
  "break",
  "explore",
] as const;
export const Activity = z.enum(ACTIVITIES);
export type Activity = z.infer<typeof Activity>;

export const SearchConstraintsSchema = z.object({
  activity: Activity.default("explore"),
  radiusM: z.number().min(150).max(8000).default(1200),
  includeCategories: z.array(PlaceCategory).default([]),
  excludeCategories: z.array(PlaceCategory).default([]),
  maxPriceLevel: z.number().min(1).max(4).optional(),
  requireOpenNow: z.boolean().default(false),
  requireWifi: z.boolean().default(false),
  requireOutdoor: z.boolean().default(false),
  /** Free text the user cares about, e.g. "natural light", "quiet". Used for matching, never as a verified attribute. */
  keywords: z.array(z.string()).default([]),
  durationMin: z.number().optional(),
  excludePlaceIds: z.array(z.string()).default([]),
});
export type SearchConstraints = z.infer<typeof SearchConstraintsSchema>;

export const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  label: z.string(),
  source: z.enum(["device", "search", "demo", "map"]),
});
export type UserLocation = z.infer<typeof LocationSchema>;

// ---------------------------------------------------------------------------
// Evidence and recommendations
// ---------------------------------------------------------------------------

export type EvidenceStatus = "met" | "unmet" | "unknown" | "partial";

export interface PracticalEvidence {
  label: string; // e.g. "Open now"
  status: EvidenceStatus;
  detail: string;
  source: string; // "OpenStreetMap", "Google Places", "Elsewhere estimate"
}

export interface CulturalEvidence {
  /** "ai" when Claude profiled any contributing interest; "built-in" when only the lexicon and word rules did. */
  provenance: TasteProvenance;
  /** Taste Engine affinity (0–1): how closely this place's profile matches the interests. */
  affinity?: number;
  /** How much each interest contributed (shares that sum to 1). */
  contributions: { entityId: string; entityName: string; score: number }[];
  /** "listing" when the listing itself names something the interest is about (e.g. "jazz"); "profile" when only facets align. */
  match: "listing" | "profile";
  /** Facet labels the place and the leading interest share, strongest first ("bookish", "quiet"). */
  facets: string[];
  /** Interest keywords found in the listing. */
  keywords: string[];
  /** Who read the listing into facets: Claude (blended with the rules) or the rules alone. */
  listingRead: "claude" | "rules";
  /** One readable sentence explaining the match. */
  note?: string;
}

export interface ScoreBreakdown {
  activity: number;
  proximity: number;
  attributes: number;
  cultural: number;
  feedback: number;
  total: number;
  weights: Record<"activity" | "proximity" | "attributes" | "cultural" | "feedback", number>;
}

export interface Recommendation {
  place: Place;
  distanceM: number;
  walkMin: number;
  openState: OpenState;
  practical: PracticalEvidence[];
  cultural?: CulturalEvidence;
  practicalScore: ScoreBreakdown;
  tasteScore: ScoreBreakdown;
  practicalRank: number;
  tasteRank: number;
  /** One-line, evidence-derived note (deterministic). */
  summary: string;
  tradeoffs: string[];
}

export interface OpenState {
  status: "open" | "closed" | "unknown";
  detail: string;
  source?: string;
  closesInMin?: number;
}

export interface SearchResult {
  id: string;
  createdAt: string;
  location: UserLocation;
  constraints: SearchConstraints;
  tasteSignals: CulturalEntity[];
  /** All eligible candidates, ranked by practical score (Taste Lens re-sorts client-side). */
  recommendations: Recommendation[];
  /** Places considered but filtered out, with the reason. */
  filteredOut: { placeId: string; name: string; reason: string }[];
  inventory: { provider: string; count: number; note?: string };
  taste: {
    mode: TasteProvenance | "off";
    status: "ok" | "no-signals" | "error";
    message?: string;
    matched: number;
  };
}

// ---------------------------------------------------------------------------
// Trails
// ---------------------------------------------------------------------------

export const TRAIL_MODES = ["walking", "cycling", "driving", "transit"] as const;
export type TrailMode = (typeof TRAIL_MODES)[number];

/**
 * What the user asked for, kept with the trail so revisions change only what they touch.
 * Slots are ordered stops; each lists the kinds of place that would satisfy it.
 */
export const TrailSpecSchema = z.object({
  slots: z.array(z.array(PlaceCategory).min(1)).min(1).max(5).optional(),
  /** What the user literally asked for at each slot when it's more specific than a kind of place ("boba", "ramen"); null otherwise. */
  slotQueries: z.array(z.string().max(60).nullable()).max(5).optional(),
  /** Used when no slots are given. */
  stops: z.number().int().min(2).max(5).default(3),
  /** Visit the slots in the order given (the user listed them in sequence). */
  keepOrder: z.boolean().default(false),
  mode: z.enum(TRAIL_MODES).default("walking"),
  /** Total time available, travel and stops included. */
  timeBudgetMin: z.number().min(20).max(720).optional(),
  /** Local start time "HH:MM"; defaults to now. */
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  maxPriceLevel: z.number().int().min(1).max(4).optional(),
  /** Longest single hop between stops. */
  maxLegMin: z.number().min(3).max(60).optional(),
  endNearStart: z.boolean().default(false),
  excludeCategories: z.array(PlaceCategory).default([]),
  excludePlaceIds: z.array(z.string()).default([]),
  mustIncludePlaceIds: z.array(z.string()).max(5).default([]),
  /** Reach past the obvious top matches (still within constraints and cultural evidence). */
  surprise: z.boolean().default(false),
  /** Free-text mood words the user used ("creative", "slow"); steer theme and listing keyword matches only. */
  mood: z.array(z.string().max(30)).max(6).default([]),
  useTaste: z.boolean().default(true),
  requireOutdoor: z.boolean().default(false),
  /** Minutes the user asked to spend at particular stops, by place id. */
  stay: z.record(z.string(), z.number().min(5).max(300)).default({}),
});
export type TrailSpec = z.infer<typeof TrailSpecSchema>;

export interface TrailLeg {
  distanceM: number;
  durationMin: number;
  /** Street geometry [lon, lat] from the routing provider; absent when only estimated. */
  geometry?: [number, number][];
  source: "osrm" | "estimate";
}

export interface TrailStop {
  placeId: string;
  order: number;
  /** The provider's record (facts only), so cards work even if the place isn't in the current results. */
  place: Place;
  /** The recommendation evidence this stop was chosen from. */
  rec: Recommendation;
  /** Which requested slot it fills. */
  slot: number;
  /** Elsewhere's estimate of time spent here (always labelled as an estimate). */
  plannedMin: number;
  /** Local "HH:MM" estimates. */
  arriveAt: string;
  leaveAt: string;
  /** Open state at the planned arrival, from listed hours (unknown when not listed). */
  openAtArrival: OpenState;
  /** Deterministic, evidence-derived reasons (Elsewhere's synthesis). */
  reason: string;
  activity: string;
  culturalRationale?: string;
  /** Leg from the previous stop (or the start). */
  legIn: TrailLeg;
}

export interface TasteTrail {
  id: string;
  createdAt: string;
  /** Deterministic title/theme/summary; the guide may layer `story` on top. */
  title: string;
  theme: string;
  summary: string;
  story?: { title?: string; summary?: string; notes: Record<string, string> };
  start: { name: string; lat: number; lon: number };
  spec: TrailSpec;
  mode: TrailMode;
  stops: TrailStop[];
  /** Back to the start, when the spec asks to finish near it. */
  legOut?: TrailLeg;
  startAt: string;
  endAt: string;
  totalMin: number;
  travelMin: number;
  stayMin: number;
  routing: { provider: string; live: boolean; effectiveMode: "walking" | "cycling" | "driving"; note?: string };
  cultural: { mode: TasteProvenance | "off"; status: "ok" | "no-signals" | "error"; matchedStops: number; message?: string };
  assumptions: string[];
  /** What the last plan or revision changed, in a sentence. */
  changeNote?: string;
}

// ---------------------------------------------------------------------------
// Agent ↔ client protocol
// ---------------------------------------------------------------------------

export type FeedbackReason =
  | "more-like-this"
  | "not-for-me"
  | "too-far"
  | "too-expensive"
  | "too-busy"
  | "already-been";

export interface FeedbackEntry {
  placeId: string;
  placeName: string;
  category: PlaceCategory;
  reason: FeedbackReason;
  at: string;
}

/** The compact view of session state the agent receives each turn. */
export const AgentSessionSchema = z.object({
  location: LocationSchema.nullable(),
  constraints: SearchConstraintsSchema,
  tasteSignals: z.array(CulturalEntitySchema).max(12),
  lensMode: z.enum(["practical", "taste"]),
  /** Map presentation only: which renderer is showing, and whether the Taste Layer is drawn. */
  mapMode: z.enum(["explore", "immersive"]).default("explore"),
  tasteLayer: z.boolean().default(false),
  selectedPlaceId: z.string().nullable(),
  visibleResultIds: z.array(z.string()).max(40),
  savedPlaceIds: z.array(z.string()).max(200),
  feedback: z
    .array(
      z.object({
        placeId: z.string(),
        placeName: z.string(),
        category: PlaceCategory,
        reason: z.enum(["more-like-this", "not-for-me", "too-far", "too-expensive", "too-busy", "already-been"]),
        at: z.string(),
      }),
    )
    .max(50),
  clientNow: z.string(), // local wall-clock "YYYY-MM-DDTHH:mm"
  lastSearchId: z.string().nullable(),
});
export type AgentSession = z.infer<typeof AgentSessionSchema>;

export type ClientAction =
  | { type: "set_location"; location: UserLocation }
  | { type: "set_constraints"; constraints: SearchConstraints }
  | { type: "results"; result: SearchResult }
  | { type: "focus"; placeId: string }
  | { type: "save"; placeId: string; place: Place }
  | { type: "unsave"; placeId: string }
  | { type: "add_taste"; entity: CulturalEntity }
  | { type: "remove_taste"; entityId: string }
  | { type: "set_lens"; mode: "practical" | "taste" }
  | { type: "taste_layer"; on: boolean }
  | { type: "compare"; placeIds: string[] }
  | { type: "trail"; trail: TasteTrail }
  | { type: "trail_story"; trailId: string; story: NonNullable<TasteTrail["story"]> }
  | { type: "entity_choices"; query: string; entities: CulturalEntity[] }
  | { type: "need_location" };

export type AgentEvent =
  | { type: "status"; label: string }
  | { type: "text"; delta: string }
  | { type: "action"; action: ClientAction }
  | { type: "history"; messages: unknown[] }
  | { type: "error"; message: string; recoverable: boolean }
  | { type: "done" };
