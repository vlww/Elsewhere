import { FACETS, type Facet } from "@/types";

/**
 * The shared vocabulary of the Elsewhere Taste Engine. Interests (a director, a band, "cozy") and places
 * (a bookstore, a tea house) are both described as weights over these facets, so "why does Murakami lead
 * to this jazz bar?" always has a readable answer: they share the facets named in the explanation.
 */
export { FACETS, FacetSchema, TasteProfileSchema } from "@/types";
export type { Facet, TasteProfile } from "@/types";

/** How each facet reads in an explanation ("shares a quiet, bookish side"). */
export const FACET_LABEL: Record<Facet, string> = {
  quiet: "quiet",
  cozy: "cozy",
  literary: "bookish",
  artsy: "artsy",
  design: "design-minded",
  nature: "green",
  cinematic: "cinematic",
  craft: "crafted",
  social: "social",
  lively: "lively",
  nostalgic: "nostalgic",
  music: "musical",
  romantic: "romantic",
  offbeat: "offbeat",
  heritage: "historic",
  foodie: "foodie",
};

/** What each facet means, for the model that profiles interests and listings. */
export const FACET_MEANING: Record<Facet, string> = {
  quiet: "calm, low noise, room to think",
  cozy: "warm, intimate, unhurried, soft light",
  literary: "books, writing, reading, ideas",
  artsy: "visual art, makers, murals, galleries",
  design: "considered design, minimalism, architecture, aesthetics",
  nature: "plants, parks, outdoors, fresh air",
  cinematic: "film, storytelling, striking scenes",
  craft: "artisanal, specialty, made with care (coffee, ceramics, bread)",
  social: "meeting people, groups, conversation",
  lively: "energy, buzz, nightlife, crowds",
  nostalgic: "vintage, retro, worn-in, old-fashioned",
  music: "music, records, live performance",
  romantic: "good for two, views, candlelight",
  offbeat: "eclectic, independent, hidden gem, bohemian",
  heritage: "history, landmarks, old buildings, tradition",
  foodie: "food-focused, cuisine, tasting, dining",
};

export type FacetVec = Partial<Record<Facet, number>>;

export function cosine(a: FacetVec, b: FacetVec) {
  let dot = 0, na = 0, nb = 0;
  for (const k of FACETS) {
    const x = a[k] ?? 0, y = b[k] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Facets both vectors lean on, strongest shared first. */
export function sharedFacets(a: FacetVec, b: FacetVec, min = 0.12): Facet[] {
  return FACETS.map((f) => [f, (a[f] ?? 0) * (b[f] ?? 0)] as const)
    .filter(([, v]) => v >= min)
    .sort((x, y) => y[1] - x[1])
    .map(([f]) => f);
}

/** Adds weight to a vector, keeping each facet in [0, 1]. */
export function bump(v: FacetVec, add: FacetVec, scale = 1) {
  for (const [k, w] of Object.entries(add) as [Facet, number][]) v[k] = Math.min(1, (v[k] ?? 0) + w * scale);
  return v;
}

/** The two vectors averaged facet by facet. */
export function blend(a: FacetVec, b: FacetVec, wb = 0.5): FacetVec {
  const out: FacetVec = {};
  for (const f of FACETS) {
    const v = (a[f] ?? 0) * (1 - wb) + (b[f] ?? 0) * wb;
    if (v > 0.01) out[f] = Number(v.toFixed(3));
  }
  return out;
}

/**
 * Words in listings (names, tags, descriptions) or typed interests that say something about character.
 * Each rule is a whole-word pattern and the facets it suggests. Shared by the place profiler and the
 * offline interest reader, so "vintage" means the same thing whether a user types it or a shop lists it.
 */
export const TEXT_RULES: { re: RegExp; facets: FacetVec; word: string }[] = [
  { word: "books", re: /\b(books?|bookshop|bookstore|librar\w*|poetry|zines?|literary|reading|novel\w*|author|writ\w+)\b/, facets: { literary: 0.9, quiet: 0.4 } },
  { word: "vintage", re: /\b(vintage|antiques?|retro|thrift\w*|second.?hand|used|consignment|flea)\b/, facets: { nostalgic: 0.9, offbeat: 0.4 } },
  { word: "records", re: /\b(records?|vinyl|jazz|blues|piano|music|live music|concerts?|gigs?|karaoke|bands?|songs?|hi.?fi)\b/, facets: { music: 0.9, nostalgic: 0.2 } },
  { word: "tea", re: /\b(tea ?house|teas?|matcha|chai|oolong|zen)\b/, facets: { quiet: 0.5, craft: 0.4, cozy: 0.3 } },
  { word: "specialty coffee", re: /\b(roast\w*|espresso|pour.?over|specialty|third wave|single origin|micro.?roaster)\b/, facets: { craft: 0.8, design: 0.2 } },
  { word: "bakery", re: /\b(bak\w+|pastr\w+|patisserie|croissants?|bread|boulangerie|desserts?|cakes?|donuts?|doughnuts?)\b/, facets: { cozy: 0.5, craft: 0.5, foodie: 0.4 } },
  { word: "plants", re: /\b(gardens?|botanic\w*|plants?|greenhouse|conservatory|nursery|flowers?|florist|trees?|woods?|forest|trails?|hik\w+)\b/, facets: { nature: 0.9, quiet: 0.3 } },
  { word: "waterfront", re: /\b(waterfront|river\w*|lake\w*|harbou?r|pier|beach|bay|views?|rooftop|lookout|sunset)\b/, facets: { romantic: 0.5, nature: 0.4 } },
  { word: "art", re: /\b(art|arts|gallery|galleries|murals?|studios?|ceramics?|pottery|sculpture|prints?|illustrat\w+|painting)\b/, facets: { artsy: 0.9, design: 0.3 } },
  { word: "design", re: /\b(design\w*|concept store|minimal\w*|architect\w*|modernis\w+|brutalis\w+|bauhaus|scandi\w*|japandi)\b/, facets: { design: 0.9, artsy: 0.2 } },
  { word: "film", re: /\b(cinemas?|films?|movies?|theat(er|re)s?|screenings?|arthouse|anime)\b/, facets: { cinematic: 0.9, nostalgic: 0.2 } },
  { word: "history", re: /\b(museums?|histor\w+|heritage|memorial|monument|cathedral|church|temple|castle|landmark|archive)\b/, facets: { heritage: 0.9, quiet: 0.2 } },
  { word: "wine", re: /\b(wine|natural wine|cocktails?|speakeasy|bar|pub|tavern|brew\w*|beer|taproom|lounge)\b/, facets: { social: 0.6, lively: 0.5 } },
  { word: "games", re: /\b(board games?|games?|arcade|puzzles?|trivia|chess)\b/, facets: { social: 0.8, offbeat: 0.3, nostalgic: 0.2 } },
  { word: "vegan", re: /\b(vegan|vegetarian|plant.?based|organic|natural|farm.?to.?table|health)\b/, facets: { nature: 0.4, craft: 0.4 } },
  { word: "cozy", re: /\b(cozy|cosy|nook|fireplace|candle\w*|hygge|snug|warm|homey)\b/, facets: { cozy: 0.9, quiet: 0.3 } },
  { word: "quiet", re: /\b(quiet|calm|peaceful|tranquil|silent|study|meditation|reading room)\b/, facets: { quiet: 0.9 } },
  { word: "lively", re: /\b(lively|buzz\w*|vibrant|party|nightlife|club|dance|dj)\b/, facets: { lively: 0.9, social: 0.5 } },
  { word: "romantic", re: /\b(romantic|date night|candlelit|intimate|for two)\b/, facets: { romantic: 0.9, cozy: 0.4 } },
  { word: "hidden gem", re: /\b(hidden gem|independent|indie|eclectic|bohemian|boho|quirky|underground|alternative|artist.?run|co.?op)\b/, facets: { offbeat: 0.9, artsy: 0.3 } },
  { word: "cuisine", re: /\b(ramen|sushi|dim sum|pho|tacos?|pizza|noodles?|dumplings?|bistro|tapas|izakaya|omakase|brunch|bubble tea|boba|ice cream|gelato|chocolate|cheese|food hall|market)\b/, facets: { foodie: 0.8, social: 0.2 } },
  { word: "games", re: /\b(comics?|manga|anime|video games?|nerd|geek)\b/, facets: { offbeat: 0.5, nostalgic: 0.4, cinematic: 0.3 } },
  { word: "craft", re: /\b(handmade|artisan\w*|craft\w*|workshop|makers?|maker.?space|letterpress|woodwork\w*|knit\w*)\b/, facets: { craft: 0.9, artsy: 0.3 } },
  { word: "outdoors", re: /\b(outdoors?|outdoor seating|patio|terrace|courtyard|beer garden|picnic|open.?air)\b/, facets: { nature: 0.5, social: 0.3 } },
];

const normText = (s: string) =>
  ` ${s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_/,;|]+/g, " ")} `;

/** Reads free text into facets with the shared rules; returns which rule words fired, for explanations. */
export function facetsFromText(text: string): { facets: FacetVec; words: string[] } {
  const t = normText(text);
  const facets: FacetVec = {};
  const words: string[] = [];
  for (const r of TEXT_RULES) {
    if (!r.re.test(t)) continue;
    bump(facets, r.facets);
    if (!words.includes(r.word)) words.push(r.word);
  }
  return { facets, words };
}

/** Whether a listing's text contains a keyword as a whole word or phrase. */
export function mentions(haystack: string, keyword: string) {
  const k = keyword.trim().toLowerCase();
  if (k.length < 3) return false;
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}(s|es)?([^a-z0-9]|$)`).test(normText(haystack));
}

/** The strongest facets of a vector, for compact descriptions. */
export function topFacets(v: FacetVec, n = 3): Facet[] {
  return FACETS.filter((f) => (v[f] ?? 0) > 0.05)
    .sort((a, b) => (v[b] ?? 0) - (v[a] ?? 0))
    .slice(0, n);
}
