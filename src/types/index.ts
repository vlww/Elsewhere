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
  "other",
] as const;
export const PlaceCategory = z.enum(PLACE_CATEGORIES);
export type PlaceCategory = z.infer<typeof PlaceCategory>;

export const PlaceSource = z.enum(["osm", "google", "qloo", "demo-snapshot"]);
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
  /** Who listed the hours, when not the place's own provider (e.g. "Qloo"). */
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
// Cultural entities (Qloo)
// ---------------------------------------------------------------------------

export const ENTITY_TYPES = [
  "urn:entity:artist",
  "urn:entity:movie",
  "urn:entity:tv_show",
  "urn:entity:book",
  "urn:entity:brand",
  "urn:entity:person",
  "urn:entity:place",
  "urn:entity:podcast",
  "urn:entity:videogame",
  "urn:entity:destination",
] as const;

export const CulturalEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(), // urn:entity:*
  disambiguation: z.string().optional(),
  imageUrl: z.string().optional(),
  /** "live" = resolved via the Qloo API; "demo" = simulated fixture. */
  provenance: z.enum(["live", "demo"]),
  /** Where it came from in this session. */
  origin: z.enum(["picked", "conversation", "saved"]).default("picked"),
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
  provenance: "live" | "demo";
  /** Qloo affinity (0–1), as returned by the API. Never rescaled. */
  affinity?: number;
  /** Per-signal contributions from Qloo explainability (0–1) when returned. */
  contributions: { entityId: string; entityName: string; score: number }[];
  /** How the Qloo result was tied to this place. */
  match: "qloo-place" | "name-proximity" | "simulated";
  qlooEntityId?: string;
  qlooName?: string;
  qlooTags: string[];
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
    mode: "live" | "demo" | "off";
    status: "ok" | "no-signals" | "error";
    message?: string;
    matched: number;
  };
}

// ---------------------------------------------------------------------------
// Trails
// ---------------------------------------------------------------------------

export interface TrailStop {
  placeId: string;
  name: string;
  lat: number;
  lon: number;
  category: PlaceCategory;
  walkFromPrevMin: number;
  why: string;
}

export interface TasteTrail {
  id: string;
  title: string;
  stops: TrailStop[];
  totalWalkMin: number;
  synthesisNote: string;
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
  | { type: "compare"; placeIds: string[] }
  | { type: "trail"; trail: TasteTrail }
  | { type: "entity_choices"; query: string; entities: CulturalEntity[] }
  | { type: "need_location" };

export type AgentEvent =
  | { type: "status"; label: string }
  | { type: "text"; delta: string }
  | { type: "action"; action: ClientAction }
  | { type: "history"; messages: unknown[] }
  | { type: "error"; message: string; recoverable: boolean }
  | { type: "done" };
