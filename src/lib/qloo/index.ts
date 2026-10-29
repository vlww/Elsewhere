import { distanceM } from "@/lib/geo";
import type { CulturalEntity, CulturalEvidence, Place, PlaceCategory } from "@/types";
import { insightsPlaces, QlooError, readExplainability, searchEntities, searchTags, type QlooPlace, type QlooTagHit } from "./client";
import { demoAffinity, demoSearch } from "./demo";

export { QlooError } from "./client";

export type TasteMode = "live" | "demo";
export const tasteMode = (): TasteMode =>
  process.env.QLOO_API_KEY && process.env.QLOO_MODE !== "demo" ? "live" : "demo";

const DEFAULT_TYPES = ["urn:entity:artist", "urn:entity:movie", "urn:entity:tv_show", "urn:entity:book", "urn:entity:brand", "urn:entity:person"];

const TYPE_LABEL: Record<string, string> = {
  "urn:entity:artist": "Artist",
  "urn:entity:movie": "Film",
  "urn:entity:tv_show": "TV show",
  "urn:entity:book": "Book",
  "urn:entity:brand": "Brand",
  "urn:entity:person": "Person",
  "urn:entity:place": "Place",
  "urn:entity:podcast": "Podcast",
  "urn:entity:videogame": "Video game",
  "urn:entity:destination": "Destination",
};
export const entityTypeLabel = (t: string) => TYPE_LABEL[t] ?? t.replace("urn:entity:", "");

/** Interests that are Qloo tags (a vibe, a cuisine, an activity) rather than one title or person. */
export const isTagInterest = (e: { id: string }) => e.id.startsWith("urn:tag:");

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const singular = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const words = (s: string) => norm(s).split(" ").filter(Boolean).map(singular);

function editDistance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Whether a title or name plausibly is what was typed: every typed word starts, or nearly spells, one of its words. */
function nameFits(name: string, query: string) {
  const nw = words(name);
  return words(query).every((q) =>
    // One typo is forgiven in longer words ("murakmi"); short words must match their start exactly.
    nw.some((w) => w.startsWith(q) || (q.length >= 6 && w.length >= q.length && editDistance(q, w.slice(0, q.length + 1)) <= 1)),
  );
}

// Tag families that name a venue's neighbour, a job, or a single dish are too narrow or unrelated to be an interest.
const NOISE_TAG = /:(nearby_attraction|occupation|wikidata|award|character)\b/;
const BROAD_TAG = /:(category|cuisine|genre|ambience|decor|atmosphere|activities|amenity|good_for|dietary_option|style)\b/;
const placeTag = (t: QlooTagHit) => (t.parents ?? []).some((p) => p.type === "urn:entity:place");

/**
 * Tags that really are the interest typed: an exact name (popular enough to be a real tag, not a one-off
 * menu line), or a broad place tag containing the words ("Vintage clothing store" for "vintage").
 * Exact matches first, then place tags, then popularity; one per name.
 */
export function rankTags(hits: QlooTagHit[], query: string): QlooTagHit[] {
  const q = words(query).join(" ");
  const kept = hits.filter((t) => {
    const type = t.type ?? t.id;
    if (NOISE_TAG.test(type) || NOISE_TAG.test(t.id)) return false;
    const pop = t.popularity ?? 0;
    const exact = words(t.name).join(" ") === q;
    if (exact) return pop >= (placeTag(t) ? 0.7 : 0.97);
    const all = words(t.name);
    return placeTag(t) && BROAD_TAG.test(type) && pop >= 0.85 && words(query).every((w) => all.includes(w));
  });
  const exact = (t: QlooTagHit) => Number(words(t.name).join(" ") === q);
  const ranked = kept.sort((a, b) => exact(b) - exact(a) || Number(placeTag(b)) - Number(placeTag(a)) || (b.popularity ?? 0) - (a.popularity ?? 0));
  const seen = new Set<string>();
  return ranked.filter((t) => {
    const k = words(t.name).join(" ");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function tagInterests(hits: QlooTagHit[], query: string): CulturalEntity[] {
  return rankTags(hits, query)
    .slice(0, 3)
    .map((t) => ({ id: t.id, name: t.name, type: t.type ?? "urn:tag", provenance: "live" as const, origin: "picked" as const }));
}

export async function resolveEntities(query: string, types?: string[]): Promise<CulturalEntity[]> {
  if (tasteMode() === "demo") return demoSearch(query);
  const [hits, tags] = await Promise.all([
    searchEntities(query, types?.length ? types : DEFAULT_TYPES),
    // Tag lookup is a bonus; a failure here shouldn't hide title matches.
    types?.length ? Promise.resolve([]) : searchTags(query).catch(() => []),
  ]);
  const entities = hits.map((h) => {
    const type = h.subtype ?? h.types?.find((t) => t.startsWith("urn:entity:")) ?? "urn:entity";
    const bits = [entityTypeLabel(type), h.disambiguation, h.properties?.release_year, h.properties?.short_description]
      .filter(Boolean)
      .map(String);
    return {
      id: h.entity_id,
      name: h.name,
      type,
      disambiguation: [...new Set(bits)].slice(0, 3).join(" · "),
      imageUrl: h.properties?.image?.url,
      provenance: "live" as const,
      origin: "picked" as const,
    };
  });
  const general = tagInterests(tags, query);
  // Qloo's search is generous ("boba" brings back a sculptor); keep the titles whose names fit what was typed.
  const fitting = entities.filter((e) => nameFits(e.name, query));
  // A general word ("vintage", "jazz") means the interest itself, even when some band shares the name.
  const exact = general.length > 0 && general[0].name.toLowerCase() === query.trim().toLowerCase();
  return exact ? [...general, ...fitting] : [...fitting, ...general];
}

/**
 * Interests saved under the other taste mode (e.g. picked in demo mode, now running live) are looked up
 * again by name, so they keep working instead of being dropped.
 */
async function adoptSignals(signals: CulturalEntity[], mode: TasteMode): Promise<CulturalEntity[]> {
  return Promise.all(
    signals.map(async (s) => {
      if (s.provenance === mode) return s;
      try {
        const hit = (await resolveEntities(s.name)).find((e) => e.name.toLowerCase() === s.name.toLowerCase());
        return hit ? { ...hit, origin: s.origin } : s;
      } catch {
        return s;
      }
    }),
  );
}

// --- Matching Qloo places to the place inventory ---------------------------------

const STOP = new Set(["the", "co", "company", "inc", "llc", "nyc", "and", "&", "of", "a", "cafe", "café"]);
const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t && !STOP.has(t)),
  );

const GENERIC = new Set(["books", "bookstore", "coffee", "tea", "library", "park", "garden", "gallery", "museum", "records", "bakery", "bar", "shop", "store", "studio"]);

export function namesMatch(a: string, b: string) {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  // A generic one-word name ("Books", "Coffee") says nothing about which venue it is.
  if (small.size === 1 && big.size > 1 && GENERIC.has([...small][0])) return false;
  let hit = 0;
  for (const t of small) if (big.has(t)) hit++;
  return hit / small.size >= 0.75;
}

/**
 * Elsewhere category ↔ Qloo place-category tags (`urn:tag:category:place:*`), verified against the API.
 * Order matters when a place carries several: the first listed Elsewhere category wins.
 */
const QLOO_CATEGORY_TAGS: [PlaceCategory, string[]][] = [
  ["library", ["library"]],
  ["bookstore", ["book_store", "used_book_store"]],
  ["tea", ["tea_house"]],
  ["coworking", ["coworking_space"]],
  ["cafe", ["cafe", "coffee_shop"]],
  ["gallery", ["art_gallery"]],
  ["museum", ["museum"]],
  ["garden", ["garden", "botanical_garden", "community_garden"]],
  ["park", ["park"]],
  ["music", ["record_store"]],
  ["cinema", ["movie_theater"]],
  ["arts_centre", ["art_center", "cultural_center", "arts_organization"]],
  ["community", ["community_center"]],
  ["plaza", ["plaza"]],
  ["food", ["restaurant", "bakery", "fast_food_restaurant"]],
];
const TAG_PREFIX = "urn:tag:category:place:";

export function qlooTagsFor(categories: PlaceCategory[]): string[] {
  return QLOO_CATEGORY_TAGS.filter(([c]) => categories.includes(c)).flatMap(([, ids]) => ids.map((id) => TAG_PREFIX + id));
}

/** Category from Qloo's category tags only: other tag types (e.g. nearby attractions) would mislead. */
function qlooCategory(p: QlooPlace): PlaceCategory | null {
  const ids = new Set(
    (p.tags ?? [])
      .map((t) => t.tag_id ?? t.id ?? "")
      .filter((id) => id.startsWith(TAG_PREFIX))
      .map((id) => id.slice(TAG_PREFIX.length)),
  );
  for (const [cat, tagIds] of QLOO_CATEGORY_TAGS) if (tagIds.some((id) => ids.has(id))) return cat;
  return null;
}

const DAY: Record<string, string> = { monday: "Mo", tuesday: "Tu", wednesday: "We", thursday: "Th", friday: "Fr", saturday: "Sa", sunday: "Su" };

/** Qloo `properties.hours` → OSM opening_hours syntax, so one evaluator handles every source. */
export function qlooHoursToOsm(hours: NonNullable<NonNullable<QlooPlace["properties"]>["hours"]> | null | undefined): string | undefined {
  if (!hours) return undefined;
  const hhmm = (t?: string | null) => /T?(\d{2}:\d{2})/.exec(t ?? "")?.[1];
  const rules: string[] = [];
  let any = false;
  for (const [day, spans] of Object.entries(hours)) {
    const d = DAY[day.toLowerCase()];
    if (!d || !spans?.length) continue;
    any = true;
    const ranges = spans
      .filter((s) => !s.closed)
      .map((s) => {
        const o = hhmm(s.opens), c = hhmm(s.closes);
        return o && c ? `${o}-${c === "00:00" ? "24:00" : c}` : null;
      })
      .filter(Boolean);
    rules.push(ranges.length ? `${d} ${ranges.join(",")}` : `${d} off`);
  }
  return any && rules.length ? rules.join("; ") : undefined;
}

function qlooLatLon(p: QlooPlace) {
  const lat = p.location?.lat ?? p.location?.latitude;
  const lon = p.location?.lon ?? p.location?.longitude;
  return lat != null && lon != null ? { lat, lon } : null;
}

function qlooToPlace(p: QlooPlace, category: PlaceCategory, at: { lat: number; lon: number }): Place {
  const props = p.properties ?? {};
  return {
    id: `qloo:${p.entity_id}`,
    providerId: p.entity_id,
    source: "qloo",
    name: p.name,
    lat: at.lat,
    lon: at.lon,
    category,
    address: props.address ?? undefined,
    url: props.website ?? undefined,
    phone: props.phone ?? undefined,
    openingHoursRaw: qlooHoursToOsm(props.hours),
    priceLevel: props.price_level && props.price_level >= 1 && props.price_level <= 4 ? props.price_level : undefined,
    rating: props.business_rating ?? undefined,
    wifi: "unknown",
    outdoorSeating: "unknown",
    wheelchair: "unknown",
    description: props.description ?? undefined,
    imageUrl: props.images?.[0]?.url ?? props.image?.url,
    imageCredit: props.images?.[0]?.url || props.image?.url ? "Image via Qloo" : undefined,
    tags: (p.tags ?? []).map((t) => t.name).filter((n): n is string => !!n).slice(0, 8),
    fetchedAt: new Date().toISOString(),
    dataNote: "Place details from Qloo",
  };
}

/** Fills only fields the inventory record lacks, and labels where they came from. */
function enrichFromQloo(p: Place, qp: QlooPlace): Place | null {
  const props = qp.properties ?? {};
  const hours = p.openingHoursRaw ? undefined : qlooHoursToOsm(props.hours);
  const price = !p.priceLevel && props.price_level && props.price_level >= 1 && props.price_level <= 4 ? props.price_level : undefined;
  const rating = p.rating === undefined && props.business_rating ? props.business_rating : undefined;
  const image = p.imageUrl ? undefined : props.images?.[0]?.url ?? props.image?.url;
  if (!hours && !price && !rating && !image) return null;
  const filled = [hours && "hours", price && "price", rating && "rating", image && "photo"].filter(Boolean).join(", ");
  return {
    ...p,
    ...(hours && { openingHoursRaw: hours, hoursSource: "Qloo" }),
    ...(price && { priceLevel: price }),
    ...(rating && { rating }),
    ...(image && { imageUrl: image, imageCredit: "Image via Qloo" }),
    address: p.address ?? props.address ?? undefined,
    dataNote: [p.dataNote, `${filled[0].toUpperCase()}${filled.slice(1)} from Qloo`].filter(Boolean).join(" · "),
  };
}

/** Which interest tags a place carries itself; with a single tag signal, that tag is the reason. */
function tagContributions(qp: QlooPlace, tagSignals: CulturalEntity[]) {
  if (tagSignals.length === 1) return [{ entityId: tagSignals[0].id, entityName: tagSignals[0].name, score: 1 }];
  const own = new Set((qp.tags ?? []).flatMap((t) => [t.id, t.tag_id, t.name?.toLowerCase()]).filter(Boolean));
  return tagSignals
    .filter((s) => own.has(s.id) || own.has(s.name.toLowerCase()))
    .map((s) => ({ entityId: s.id, entityName: s.name, score: 1 }));
}

export interface TasteResult {
  mode: TasteMode;
  status: "ok" | "no-signals" | "error";
  message?: string;
  evidence: Map<string, CulturalEvidence>;
  /** Qloo places not present in the inventory, added to the shared candidate pool. */
  extraPlaces: Place[];
  /** Inventory places with gaps filled from their matched Qloo record (hours, price, rating, image). */
  enriched: Map<string, Place>;
}

export async function culturalEvidence(args: {
  signals: CulturalEntity[];
  lat: number;
  lon: number;
  radiusM: number;
  inventory: Place[];
  /** Categories in play for this search; used to filter Qloo by its place-category tags. */
  categories: PlaceCategory[];
}): Promise<TasteResult> {
  const mode = tasteMode();
  const adopted = await adoptSignals(args.signals, mode);
  const usable = adopted.filter((s) => s.provenance === mode);
  const evidence = new Map<string, CulturalEvidence>();
  if (!usable.length) {
    const skipped = args.signals.length - usable.length;
    return {
      mode,
      status: "no-signals",
      message: skipped
        ? `${skipped === 1 ? "That interest isn't" : "Those interests aren't"} available ${mode === "live" ? "in live taste data" : "in demo mode"}. Try adding ${skipped === 1 ? "it" : "them"} again.`
        : undefined,
      evidence,
      extraPlaces: [],
      enriched: new Map(),
    };
  }
  const names = new Map(usable.map((s) => [s.id, s.name]));

  if (mode === "demo") {
    for (const p of args.inventory) {
      const a = demoAffinity(p, usable.map((s) => s.id));
      if (!a) continue;
      evidence.set(p.id, {
        provenance: "demo",
        affinity: a.affinity,
        contributions: a.contributions,
        match: "simulated",
        qlooTags: [],
        note: "Simulated in demo mode from a hand-written fixture, not a Qloo result.",
      });
    }
    return { mode, status: "ok", evidence, extraPlaces: [], enriched: new Map() };
  }

  try {
    // Titles and general interests are asked separately: in one request the titles drown out the tags.
    const tagSignals = usable.filter(isTagInterest);
    const entitySignals = usable.filter((s) => !isTagInterest(s));
    const common = { lat: args.lat, lon: args.lon, radiusM: args.radiusM, tags: qlooTagsFor(args.categories) };
    const runs = await Promise.all([
      entitySignals.length ? insightsPlaces({ ...common, entityIds: entitySignals.map((s) => s.id) }) : null,
      tagSignals.length ? insightsPlaces({ ...common, entityIds: [], signalTags: tagSignals.map((s) => s.id) }) : null,
    ]);
    const warning = runs.find((r) => r?.warning)?.warning;
    // One list, strongest affinity first, each Qloo place once (keeping its stronger appearance).
    const byId = new Map<string, { qp: QlooPlace; viaTags: boolean }>();
    runs.forEach((r, i) => {
      for (const qp of r?.places ?? []) {
        const prev = byId.get(qp.entity_id);
        if (!prev || (qp.query?.affinity ?? 0) > (prev.qp.query?.affinity ?? 0)) byId.set(qp.entity_id, { qp, viaTags: i === 1 });
      }
    });
    const places = [...byId.values()].sort((a, b) => (b.qp.query?.affinity ?? 0) - (a.qp.query?.affinity ?? 0));
    const extraPlaces: Place[] = [];
    const enriched = new Map<string, Place>();
    for (const { qp, viaTags } of places) {
      const at = qlooLatLon(qp);
      const contributions = viaTags
        ? tagContributions(qp, tagSignals)
        : readExplainability(qp.query?.explainability)
            .filter((c) => names.has(c.entityId))
            .map((c) => ({ entityId: c.entityId, entityName: names.get(c.entityId)!, score: c.score }));
      const base: Omit<CulturalEvidence, "match"> = {
        provenance: "live",
        affinity: qp.query?.affinity,
        contributions,
        qlooEntityId: qp.entity_id,
        qlooName: qp.name,
        qlooTags: (qp.tags ?? []).map((t) => t.name).filter((n): n is string => !!n).slice(0, 6),
      };
      const match = at ? args.inventory.find((p) => distanceM(p, at) < 150 && namesMatch(p.name, qp.name)) : undefined;
      if (match) {
        if (!evidence.has(match.id)) {
          evidence.set(match.id, { ...base, match: "name-proximity" });
          const filled = enrichFromQloo(match, qp);
          if (filled) enriched.set(match.id, filled);
        }
        continue;
      }
      const category = qlooCategory(qp);
      if (!at || !category || qp.properties?.is_closed) continue;
      if (distanceM(args, at) > args.radiusM * 1.1) continue;
      const place = qlooToPlace(qp, category, at);
      extraPlaces.push(place);
      evidence.set(place.id, { ...base, match: "qloo-place" });
    }
    return {
      mode,
      status: "ok",
      message: warning ? `Qloo: ${warning}` : undefined,
      evidence,
      extraPlaces,
      enriched,
    };
  } catch (e) {
    const msg =
      e instanceof QlooError
        ? {
            auth: "Qloo rejected the API key.",
            "rate-limit": "Qloo's rate limit was reached. Try again in a minute.",
            timeout: "Qloo took too long to respond.",
            "bad-response": "Qloo returned something unexpected.",
            http: "Qloo request failed.",
            config: "Qloo isn't configured.",
          }[e.kind]
        : "Cultural matching failed.";
    console.warn("[qloo]", (e as Error).message);
    return { mode, status: "error", message: msg, evidence, extraPlaces: [], enriched: new Map() };
  }
}
