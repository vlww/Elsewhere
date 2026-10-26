import { distanceM } from "@/lib/geo";
import type { CulturalEntity, CulturalEvidence, Place, PlaceCategory } from "@/types";
import { insightsPlaces, QlooError, readExplainability, searchEntities, type QlooPlace } from "./client";
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

export async function resolveEntities(query: string, types?: string[]): Promise<CulturalEntity[]> {
  if (tasteMode() === "demo") return demoSearch(query);
  const hits = await searchEntities(query, types?.length ? types : DEFAULT_TYPES);
  return hits.map((h) => {
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

export function namesMatch(a: string, b: string) {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let hit = 0;
  for (const t of small) if (big.has(t)) hit++;
  return hit / small.size >= 0.75;
}

const QLOO_TAG_CATEGORY: [RegExp, PlaceCategory][] = [
  [/tea ?(house|room|shop)|bubble tea/i, "tea"],
  [/coffee|cafe|café|espresso/i, "cafe"],
  [/book ?store|bookshop|book shop/i, "bookstore"],
  [/library/i, "library"],
  [/art gallery|gallery/i, "gallery"],
  [/museum/i, "museum"],
  [/botanical|garden/i, "garden"],
  [/\bpark\b/i, "park"],
  [/cinema|movie theater|movie theatre/i, "cinema"],
  [/record store|music store/i, "music"],
  [/cowork/i, "coworking"],
];

function qlooCategory(p: QlooPlace): PlaceCategory | null {
  const names = (p.tags ?? []).map((t) => t.name ?? t.id ?? t.tag_id ?? "").join(" | ");
  for (const [re, cat] of QLOO_TAG_CATEGORY) if (re.test(names)) return cat;
  return null;
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
    address: props.address,
    url: props.website,
    phone: props.phone,
    priceLevel: props.price_level && props.price_level >= 1 && props.price_level <= 4 ? props.price_level : undefined,
    rating: props.business_rating,
    wifi: "unknown",
    outdoorSeating: "unknown",
    wheelchair: "unknown",
    description: props.description,
    imageUrl: props.images?.[0]?.url ?? props.image?.url,
    imageCredit: props.images?.[0]?.url || props.image?.url ? "Image via Qloo" : undefined,
    tags: (p.tags ?? []).map((t) => t.name).filter((n): n is string => !!n).slice(0, 8),
    fetchedAt: new Date().toISOString(),
    dataNote: "Place details from Qloo",
  };
}

export interface TasteResult {
  mode: TasteMode;
  status: "ok" | "no-signals" | "error";
  message?: string;
  evidence: Map<string, CulturalEvidence>;
  /** Qloo places not present in the inventory, added to the shared candidate pool. */
  extraPlaces: Place[];
}

export async function culturalEvidence(args: {
  signals: CulturalEntity[];
  lat: number;
  lon: number;
  radiusM: number;
  inventory: Place[];
}): Promise<TasteResult> {
  const mode = tasteMode();
  const usable = args.signals.filter((s) => s.provenance === mode);
  const evidence = new Map<string, CulturalEvidence>();
  if (!usable.length) {
    const skipped = args.signals.length - usable.length;
    return {
      mode,
      status: "no-signals",
      message: skipped
        ? `${skipped} interest(s) came from ${mode === "live" ? "demo" : "live"} mode and can't be used here.`
        : undefined,
      evidence,
      extraPlaces: [],
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
        note: "Simulated in demo mode from a hand-written fixture — not a Qloo result.",
      });
    }
    return { mode, status: "ok", evidence, extraPlaces: [] };
  }

  try {
    const { places, warning } = await insightsPlaces({
      entityIds: usable.map((s) => s.id),
      lat: args.lat,
      lon: args.lon,
      radiusM: args.radiusM,
    });
    const extraPlaces: Place[] = [];
    for (const qp of places) {
      const at = qlooLatLon(qp);
      const contributions = readExplainability(qp.query?.explainability)
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
        if (!evidence.has(match.id)) evidence.set(match.id, { ...base, match: "name-proximity" });
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
    };
  } catch (e) {
    const msg =
      e instanceof QlooError
        ? {
            auth: "Qloo rejected the API key.",
            "rate-limit": "Qloo's rate limit was reached — try again in a minute.",
            timeout: "Qloo took too long to respond.",
            "bad-response": "Qloo returned something unexpected.",
            http: "Qloo request failed.",
            config: "Qloo isn't configured.",
          }[e.kind]
        : "Cultural matching failed.";
    console.warn("[qloo]", (e as Error).message);
    return { mode, status: "error", message: msg, evidence, extraPlaces: [] };
  }
}
