import type { CulturalEntity, Place } from "@/types";

/**
 * DEMO MODE ONLY. A small hand-written fixture used when QLOO_API_KEY is absent.
 * The facet weights below are Elsewhere's illustrative assumptions — not Qloo data —
 * and every result produced from them is labeled as simulated in the UI.
 */

const FACETS = ["quiet", "literary", "art", "design", "nature", "cinematic", "craft", "social", "nostalgic", "music"] as const;
type Facet = (typeof FACETS)[number];
type FacetVec = Partial<Record<Facet, number>>;

interface DemoEntity {
  id: string;
  name: string;
  type: string;
  disambiguation: string;
  aliases: string[];
  facets: FacetVec;
}

export const DEMO_ENTITIES: DemoEntity[] = [
  { id: "demo:sofia-coppola", name: "Sofia Coppola", type: "urn:entity:person", disambiguation: "Film director", aliases: ["coppola"], facets: { cinematic: 1, design: 0.7, quiet: 0.6, nostalgic: 0.4 } },
  { id: "demo:lost-in-translation", name: "Lost in Translation", type: "urn:entity:movie", disambiguation: "Film, 2003", aliases: [], facets: { cinematic: 1, quiet: 0.7, design: 0.5, music: 0.3 } },
  { id: "demo:wong-kar-wai", name: "Wong Kar-wai", type: "urn:entity:person", disambiguation: "Film director", aliases: ["wong kar wai", "wkw"], facets: { cinematic: 1, nostalgic: 0.8, design: 0.5, music: 0.4 } },
  { id: "demo:in-the-mood-for-love", name: "In the Mood for Love", type: "urn:entity:movie", disambiguation: "Film, 2000", aliases: [], facets: { cinematic: 1, nostalgic: 0.9, quiet: 0.4, design: 0.5 } },
  { id: "demo:wes-anderson", name: "Wes Anderson", type: "urn:entity:person", disambiguation: "Film director", aliases: [], facets: { cinematic: 0.9, design: 0.9, nostalgic: 0.7, literary: 0.4 } },
  { id: "demo:frances-ha", name: "Frances Ha", type: "urn:entity:movie", disambiguation: "Film, 2012", aliases: [], facets: { cinematic: 0.8, social: 0.6, literary: 0.4, nostalgic: 0.4 } },
  { id: "demo:spirited-away", name: "Spirited Away", type: "urn:entity:movie", disambiguation: "Animated film, 2001", aliases: ["ghibli"], facets: { nature: 0.8, cinematic: 0.7, nostalgic: 0.6, quiet: 0.4 } },
  { id: "demo:phoebe-bridgers", name: "Phoebe Bridgers", type: "urn:entity:artist", disambiguation: "Singer-songwriter", aliases: ["phoebe"], facets: { music: 1, quiet: 0.6, literary: 0.5, nostalgic: 0.5 } },
  { id: "demo:radiohead", name: "Radiohead", type: "urn:entity:artist", disambiguation: "Band", aliases: [], facets: { music: 1, art: 0.6, design: 0.4, quiet: 0.3 } },
  { id: "demo:mitski", name: "Mitski", type: "urn:entity:artist", disambiguation: "Singer-songwriter", aliases: [], facets: { music: 1, literary: 0.5, art: 0.4, nostalgic: 0.4 } },
  { id: "demo:frank-ocean", name: "Frank Ocean", type: "urn:entity:artist", disambiguation: "Singer-songwriter", aliases: [], facets: { music: 1, design: 0.5, nostalgic: 0.5, social: 0.3 } },
  { id: "demo:bon-iver", name: "Bon Iver", type: "urn:entity:artist", disambiguation: "Band", aliases: [], facets: { music: 0.9, nature: 0.8, quiet: 0.7 } },
  { id: "demo:beach-house", name: "Beach House", type: "urn:entity:artist", disambiguation: "Dream pop duo", aliases: [], facets: { music: 0.9, quiet: 0.6, nostalgic: 0.6, cinematic: 0.4 } },
  { id: "demo:ryuichi-sakamoto", name: "Ryuichi Sakamoto", type: "urn:entity:artist", disambiguation: "Composer", aliases: ["sakamoto"], facets: { music: 1, quiet: 0.8, design: 0.6, art: 0.5 } },
  { id: "demo:nujabes", name: "Nujabes", type: "urn:entity:artist", disambiguation: "Producer", aliases: ["lofi"], facets: { music: 0.9, quiet: 0.7, craft: 0.4, nostalgic: 0.5 } },
  { id: "demo:haruki-murakami", name: "Haruki Murakami", type: "urn:entity:person", disambiguation: "Author", aliases: ["murakami"], facets: { literary: 1, music: 0.5, quiet: 0.6, craft: 0.4 } },
  { id: "demo:sally-rooney", name: "Sally Rooney", type: "urn:entity:person", disambiguation: "Author", aliases: ["normal people"], facets: { literary: 1, social: 0.5, quiet: 0.4 } },
  { id: "demo:joan-didion", name: "Joan Didion", type: "urn:entity:person", disambiguation: "Author", aliases: ["didion"], facets: { literary: 1, quiet: 0.5, nostalgic: 0.5, design: 0.3 } },
  { id: "demo:muji", name: "MUJI", type: "urn:entity:brand", disambiguation: "Retail brand", aliases: [], facets: { design: 1, quiet: 0.7, craft: 0.4 } },
  { id: "demo:aesop", name: "Aesop", type: "urn:entity:brand", disambiguation: "Skincare brand", aliases: [], facets: { design: 0.9, craft: 0.6, quiet: 0.5, art: 0.3 } },
  { id: "demo:patagonia", name: "Patagonia", type: "urn:entity:brand", disambiguation: "Outdoor apparel brand", aliases: [], facets: { nature: 1, social: 0.3, craft: 0.3 } },
  { id: "demo:criterion", name: "The Criterion Collection", type: "urn:entity:brand", disambiguation: "Film distributor", aliases: ["criterion"], facets: { cinematic: 1, art: 0.6, nostalgic: 0.5, literary: 0.3 } },
];

function placeFacets(p: Place): FacetVec {
  const base: Record<Place["category"], FacetVec> = {
    cafe: { craft: 0.5, social: 0.6 },
    tea: { quiet: 0.8, design: 0.6, craft: 0.6 },
    library: { quiet: 1, literary: 0.9 },
    bookstore: { literary: 1, quiet: 0.5, nostalgic: 0.4 },
    park: { nature: 1, social: 0.5, quiet: 0.3 },
    garden: { nature: 1, quiet: 0.9, design: 0.3 },
    gallery: { art: 1, design: 0.7, quiet: 0.5 },
    museum: { art: 0.8, nostalgic: 0.6, quiet: 0.5 },
    arts_centre: { art: 0.8, social: 0.5, music: 0.3 },
    cinema: { cinematic: 1, nostalgic: 0.5 },
    music: { music: 1, nostalgic: 0.6 },
    coworking: { design: 0.4, social: 0.3, craft: 0.2 },
    plaza: { social: 0.7, cinematic: 0.3 },
    community: { social: 0.8, art: 0.2 },
    food: { social: 0.8, craft: 0.5, nostalgic: 0.2 },
    other: { craft: 0.3 },
  };
  const f: FacetVec = { ...base[p.category] };
  if (p.category === "cafe" && /roast|espresso|coffee co/i.test(p.name)) f.craft = 0.9;
  if (p.tags.includes("chain")) {
    f.craft = (f.craft ?? 0) * 0.3;
    f.design = (f.design ?? 0) * 0.5;
  }
  return f;
}

function cosine(a: FacetVec, b: FacetVec) {
  let dot = 0, na = 0, nb = 0;
  for (const k of FACETS) {
    const x = a[k] ?? 0, y = b[k] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Deterministic tie-breaker in [0, 1) so equal-category places don't all score identically. */
function hash01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export function demoSearch(query: string): CulturalEntity[] {
  const q = query.toLowerCase().trim();
  if (q.length < 2) return [];
  return DEMO_ENTITIES.filter((e) => e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.includes(q) || q.includes(a)))
    .slice(0, 8)
    .map((e) => ({ id: e.id, name: e.name, type: e.type, disambiguation: e.disambiguation, provenance: "demo", origin: "picked" }));
}

export function demoAffinity(place: Place, signalIds: string[]) {
  const ents = signalIds.map((id) => DEMO_ENTITIES.find((e) => e.id === id)).filter((e): e is DemoEntity => !!e);
  if (!ents.length) return null;
  const pf = placeFacets(place);
  const per = ents.map((e) => ({ entityId: e.id, entityName: e.name, raw: cosine(e.facets, pf) }));
  const mean = per.reduce((s, x) => s + x.raw, 0) / per.length;
  const affinity = Math.min(1, mean * 0.9 + hash01(place.id + signalIds.join()) * 0.1);
  const sum = per.reduce((s, x) => s + x.raw, 0) || 1;
  return {
    affinity,
    contributions: per.map((x) => ({ entityId: x.entityId, entityName: x.entityName, score: x.raw / sum })),
  };
}
