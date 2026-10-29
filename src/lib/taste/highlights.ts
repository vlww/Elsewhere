import type { CulturalEntity, PlaceCategory, Recommendation } from "@/types";

/**
 * The Taste Layer's single source of truth. Both map renderers (Explore 2D, Immersive 3D) and the agent
 * read highlights from here, so a place lit up in one mode is the same place lit up in the other.
 *
 * A place is highlighted only when the recommendation pipeline attached cultural evidence to it (Qloo
 * Insights in live mode, the labeled fixture in demo mode). Nothing here invents a relationship: the
 * tier comes from the same rank-normalized affinity the Taste Lens scores with, and the colour is just a
 * key for which of the user's interests contributed most. It isn't a claim about what that artist "looks like".
 */

export type TasteTier = "strong" | "notable";

export interface TasteHighlight {
  placeId: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lon: number;
  tier: TasteTier;
  /** 0–1: the rank-normalized cultural factor (0.4–1 for matched places). */
  strength: number;
  color: string;
  deep: string;
  /** The interest that contributed most, when Qloo's explainability (or a single active interest) says so. */
  entityId?: string;
  entityName?: string;
  provenance: "live" | "demo";
  match: "qloo-place" | "name-proximity" | "simulated";
  /** One short, truthful line for hovers and labels. */
  why: string;
}

/** Sunset palette: [fill, deep] pairs. Deep variants keep text and strokes at readable contrast. */
export const TASTE_PALETTE: { fill: string; deep: string; name: string }[] = [
  { fill: "#F2A7BC", deep: "#B04F78", name: "blush" },
  { fill: "#B9A5E8", deep: "#6A52B8", name: "lavender" },
  { fill: "#F6B98F", deep: "#B5643A", name: "peach" },
  { fill: "#F2958A", deep: "#B24E45", name: "coral" },
  { fill: "#A9B6F0", deep: "#4E5FB0", name: "periwinkle" },
  { fill: "#F0D277", deep: "#8C7020", name: "butter" },
  { fill: "#F5B07A", deep: "#A85A26", name: "apricot" },
];
const BLEND = { fill: "#E9A5C9", deep: "#9A4C7E" };

/** A stable colour per active interest, in the order the user added them. */
export function interestColors(signals: CulturalEntity[]) {
  return new Map(signals.map((s, i) => [s.id, TASTE_PALETTE[i % TASTE_PALETTE.length]]));
}

/** The layer highlights the best matches, not every place with any signal: a few strong, a ring of notable. */
const MAX_STRONG = 5;
const MAX_HIGHLIGHTS = 14;

export function tasteHighlights(recs: Recommendation[], signals: CulturalEntity[]) {
  return rankedMatches(recs, signals).slice(0, MAX_HIGHLIGHTS);
}

/** Every place with cultural evidence, strongest first. Tiers are by rank so they stay meaningful however Qloo's affinities cluster. */
export function rankedMatches(recs: Recommendation[], signals: CulturalEntity[]): TasteHighlight[] {
  if (!signals.length) return [];
  const colors = interestColors(signals);
  const names = new Map(signals.map((s) => [s.id, s.name]));
  const out: TasteHighlight[] = [];
  for (const r of recs) {
    const ev = r.cultural;
    if (!ev) continue;
    const top = [...ev.contributions].sort((a, b) => b.score - a.score)[0];
    // With one active interest, Qloo's affinity can only have come from that interest.
    const entityId = top?.entityId ?? (signals.length === 1 ? signals[0].id : undefined);
    const entityName = top?.entityName ?? (entityId ? names.get(entityId) : undefined);
    const pal = (entityId && colors.get(entityId)) || BLEND;
    const strength = r.tasteScore.cultural;
    const source = ev.provenance === "demo" ? "Simulated" : "Qloo";
    out.push({
      placeId: r.place.id,
      name: r.place.name,
      category: r.place.category,
      lat: r.place.lat,
      lon: r.place.lon,
      tier: "notable",
      strength,
      color: pal.fill,
      deep: pal.deep,
      entityId,
      entityName,
      provenance: ev.provenance,
      match: ev.match,
      why: entityName ? `${source}: lines up with ${entityName}` : `${source}: affinity with your interests`,
    });
  }
  out.sort((a, b) => b.strength - a.strength);
  // Top quarter (1–5) are strong; ties with the last strong one count too.
  const nStrong = Math.max(1, Math.min(MAX_STRONG, Math.round(out.length / 4)));
  const cut = out[nStrong - 1]?.strength ?? 1;
  for (const h of out) if (h.strength >= cut) h.tier = "strong";
  return out;
}

const plural = (w: string, n: number) =>
  n === 1 ? w : w === "coworking" ? "coworking spaces" : w.endsWith("y") ? `${w.slice(0, -1)}ies` : `${w}s`;

/** "2 galleries, 1 bookstore", for change summaries. */
export function categoryTally(hs: { category: PlaceCategory }[], label: (c: PlaceCategory) => string) {
  const n = new Map<PlaceCategory, number>();
  for (const h of hs) n.set(h.category, (n.get(h.category) ?? 0) + 1);
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c, k]) => `${k} ${plural(label(c).toLowerCase(), k)}`)
    .join(", ");
}
