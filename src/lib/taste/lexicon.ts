import type { PlaceCategory } from "@/types";
import type { FacetVec } from "./facets";

/**
 * Built-in interests the engine knows without a model call: the vibe cards, common everyday interests,
 * and a few well-known names. Profiles are Elsewhere's own editorial judgement, written by hand, and are
 * labelled "built-in" wherever they surface. With Claude configured, anything outside this list is
 * profiled on demand; without it, this list (plus the listing word rules) is the whole vocabulary.
 */
export interface LexiconEntry {
  id: string;
  name: string;
  kind: string;
  about: string;
  aliases?: string[];
  facets: FacetVec;
  keywords?: string[];
  categories?: PlaceCategory[];
}

const vibe = (slug: string, name: string, about: string, facets: FacetVec, keywords: string[], categories: PlaceCategory[] = []): LexiconEntry => ({
  id: `lx:vibe:${slug}`,
  name,
  kind: "vibe",
  about,
  facets,
  keywords,
  categories,
});

/** The vibe cards in the Taste panel. Ids are stable: they're stored in people's browsers. */
export const VIBES: LexiconEntry[] = [
  vibe("cozy", "Cozy", "Warm, unhurried", { cozy: 1, quiet: 0.5, craft: 0.3 }, ["cozy", "cosy", "fireplace", "nook", "bakery"], ["cafe", "tea", "bookstore"]),
  vibe("quiet", "Quiet", "Room to think", { quiet: 1, literary: 0.4, nature: 0.3 }, ["quiet", "reading room", "study"], ["library", "garden", "tea"]),
  vibe("artsy", "Artsy", "Makers, murals", { artsy: 1, offbeat: 0.4, design: 0.4, craft: 0.3 }, ["gallery", "studio", "mural", "ceramics"], ["gallery", "arts_centre"]),
  vibe("vintage", "Vintage", "Worn-in, retro", { nostalgic: 1, offbeat: 0.5, music: 0.2 }, ["vintage", "antique", "retro", "thrift", "records"], ["music", "bookstore"]),
  vibe("minimalist", "Minimalist", "Calm design", { design: 1, quiet: 0.6, craft: 0.3 }, ["minimal", "design", "concept store"], ["tea", "gallery", "cafe"]),
  vibe("lively", "Lively", "A good buzz", { lively: 1, social: 0.8, music: 0.3, foodie: 0.3 }, ["bar", "live music", "food hall", "market"], ["food", "plaza", "music"]),
  vibe("hidden-gem", "Hidden gem", "Off the path", { offbeat: 1, craft: 0.4, cozy: 0.2 }, ["independent", "hidden gem", "indie"]),
  vibe("romantic", "Romantic", "Good for two", { romantic: 1, cozy: 0.5, nature: 0.3, foodie: 0.3 }, ["wine", "candlelit", "rooftop", "view", "garden"], ["garden", "food"]),
  vibe("bohemian", "Bohemian", "Eclectic", { offbeat: 0.9, artsy: 0.6, nostalgic: 0.4, music: 0.3 }, ["eclectic", "bohemian", "co-op", "zine"], ["arts_centre", "music"]),
];

export const LEXICON: LexiconEntry[] = [
  ...VIBES,
  // Everyday interests
  { id: "lx:specialty-coffee", name: "Specialty coffee", kind: "food", about: "Food & drink", aliases: ["coffee", "espresso", "latte", "pour over"], facets: { craft: 1, social: 0.4, design: 0.3 }, keywords: ["roaster", "espresso", "coffee", "pour over"], categories: ["cafe"] },
  { id: "lx:bubble-tea", name: "Bubble tea", kind: "food", about: "Food & drink", aliases: ["boba", "milk tea", "pearl tea"], facets: { foodie: 0.7, social: 0.6, lively: 0.3 }, keywords: ["boba", "bubble tea", "milk tea", "tea"], categories: ["tea", "cafe"] },
  { id: "lx:matcha", name: "Matcha", kind: "food", about: "Food & drink", aliases: ["green tea", "japanese tea"], facets: { quiet: 0.6, craft: 0.7, design: 0.5 }, keywords: ["matcha", "tea", "japanese"], categories: ["tea", "cafe"] },
  { id: "lx:pastries", name: "Pastries", kind: "food", about: "Food & drink", aliases: ["croissants", "baking", "bakery", "desserts"], facets: { cozy: 0.7, craft: 0.7, foodie: 0.6 }, keywords: ["bakery", "pastry", "croissant", "patisserie"], categories: ["food", "cafe"] },
  { id: "lx:ramen", name: "Ramen", kind: "food", about: "Food & drink", aliases: ["noodles"], facets: { foodie: 1, cozy: 0.4, social: 0.3 }, keywords: ["ramen", "noodle", "japanese"], categories: ["food"] },
  { id: "lx:natural-wine", name: "Natural wine", kind: "food", about: "Food & drink", aliases: ["wine"], facets: { social: 0.7, craft: 0.7, romantic: 0.4, design: 0.3 }, keywords: ["wine", "natural wine", "bistro"], categories: ["food"] },
  { id: "lx:vegan", name: "Vegan food", kind: "food", about: "Food & drink", aliases: ["vegan", "plant based", "vegetarian"], facets: { nature: 0.5, craft: 0.6, foodie: 0.6 }, keywords: ["vegan", "vegetarian", "plant based"], categories: ["food", "cafe"] },
  { id: "lx:live-music", name: "Live music", kind: "activity", about: "Activity", aliases: ["gigs", "concerts", "jazz"], facets: { music: 1, lively: 0.7, social: 0.6 }, keywords: ["live music", "jazz", "concert", "venue"], categories: ["music", "arts_centre"] },
  { id: "lx:vinyl", name: "Vinyl records", kind: "activity", about: "Activity", aliases: ["vinyl", "records", "record shopping", "crate digging"], facets: { music: 1, nostalgic: 0.7, offbeat: 0.4 }, keywords: ["records", "vinyl", "music"], categories: ["music"] },
  { id: "lx:thrifting", name: "Thrifting", kind: "activity", about: "Activity", aliases: ["thrift", "secondhand", "thrift shopping"], facets: { nostalgic: 0.9, offbeat: 0.8 }, keywords: ["thrift", "vintage", "second hand", "consignment"] },
  { id: "lx:reading", name: "Reading", kind: "activity", about: "Activity", aliases: ["books", "novels", "book club"], facets: { literary: 1, quiet: 0.7, cozy: 0.4 }, keywords: ["books", "bookstore", "library", "reading"], categories: ["bookstore", "library"] },
  { id: "lx:hiking", name: "Hiking", kind: "activity", about: "Activity", aliases: ["outdoors", "walking", "trails", "nature walks"], facets: { nature: 1, quiet: 0.4 }, keywords: ["trail", "park", "woods", "garden"], categories: ["park", "garden"] },
  { id: "lx:photography", name: "Photography", kind: "activity", about: "Activity", aliases: ["photos", "film photography", "street photography"], facets: { artsy: 0.7, nature: 0.4, heritage: 0.4, design: 0.4, cinematic: 0.4 }, keywords: ["view", "garden", "gallery", "architecture"], categories: ["park", "garden", "gallery", "plaza"] },
  { id: "lx:board-games", name: "Board games", kind: "activity", about: "Activity", aliases: ["games", "tabletop", "dnd"], facets: { social: 1, offbeat: 0.3, nostalgic: 0.3 }, keywords: ["board games", "games", "game cafe"], categories: ["cafe", "community"] },
  { id: "lx:architecture", name: "Architecture", kind: "style", about: "Theme", aliases: ["buildings", "brutalism", "modernism"], facets: { design: 1, heritage: 0.6, artsy: 0.5 }, keywords: ["architecture", "historic", "design"], categories: ["museum", "plaza", "library"] },
  { id: "lx:history", name: "History", kind: "style", about: "Theme", aliases: ["museums", "heritage"], facets: { heritage: 1, literary: 0.4, quiet: 0.3 }, keywords: ["museum", "historic", "heritage"], categories: ["museum", "library"] },
  { id: "lx:anime", name: "Anime", kind: "style", about: "Theme", aliases: ["manga", "japanese animation"], facets: { cinematic: 0.8, offbeat: 0.6, nostalgic: 0.4, artsy: 0.3 }, keywords: ["anime", "manga", "comics", "japanese"], categories: ["bookstore", "cinema"] },
  { id: "lx:plants", name: "Houseplants", kind: "activity", about: "Activity", aliases: ["plants", "gardening", "plant shopping"], facets: { nature: 1, cozy: 0.4, craft: 0.3 }, keywords: ["plants", "nursery", "garden", "greenhouse"], categories: ["garden", "park"] },
  // Well-known names
  { id: "lx:sofia-coppola", name: "Sofia Coppola", kind: "person", about: "Film director", aliases: ["coppola"], facets: { cinematic: 1, design: 0.7, quiet: 0.6, nostalgic: 0.4, romantic: 0.3 } },
  { id: "lx:lost-in-translation", name: "Lost in Translation", kind: "film", about: "Film, 2003", facets: { cinematic: 1, quiet: 0.7, design: 0.5, music: 0.3 } },
  { id: "lx:wong-kar-wai", name: "Wong Kar-wai", kind: "person", about: "Film director", aliases: ["wong kar wai", "wkw"], facets: { cinematic: 1, nostalgic: 0.8, romantic: 0.7, design: 0.5, music: 0.4 } },
  { id: "lx:in-the-mood-for-love", name: "In the Mood for Love", kind: "film", about: "Film, 2000", facets: { cinematic: 1, nostalgic: 0.9, romantic: 0.8, design: 0.5 } },
  { id: "lx:wes-anderson", name: "Wes Anderson", kind: "person", about: "Film director", facets: { cinematic: 0.9, design: 0.9, nostalgic: 0.7, offbeat: 0.5, literary: 0.4 }, keywords: ["vintage", "pastel", "hotel"] },
  { id: "lx:frances-ha", name: "Frances Ha", kind: "film", about: "Film, 2012", facets: { cinematic: 0.8, social: 0.6, literary: 0.4, nostalgic: 0.4 } },
  { id: "lx:studio-ghibli", name: "Studio Ghibli", kind: "brand", about: "Animation studio", aliases: ["ghibli", "miyazaki", "spirited away", "totoro"], facets: { nature: 0.9, cinematic: 0.7, cozy: 0.6, nostalgic: 0.6, craft: 0.3 }, keywords: ["garden", "bakery", "tea"] },
  { id: "lx:phoebe-bridgers", name: "Phoebe Bridgers", kind: "artist", about: "Singer-songwriter", aliases: ["phoebe"], facets: { music: 1, quiet: 0.6, literary: 0.5, nostalgic: 0.5 } },
  { id: "lx:radiohead", name: "Radiohead", kind: "artist", about: "Band", facets: { music: 1, artsy: 0.6, design: 0.4, quiet: 0.3 } },
  { id: "lx:mitski", name: "Mitski", kind: "artist", about: "Singer-songwriter", facets: { music: 1, literary: 0.5, artsy: 0.4, nostalgic: 0.4 } },
  { id: "lx:frank-ocean", name: "Frank Ocean", kind: "artist", about: "Singer-songwriter", facets: { music: 1, design: 0.5, nostalgic: 0.5, romantic: 0.4 } },
  { id: "lx:bon-iver", name: "Bon Iver", kind: "artist", about: "Band", facets: { music: 0.9, nature: 0.8, quiet: 0.7, cozy: 0.3 } },
  { id: "lx:ryuichi-sakamoto", name: "Ryuichi Sakamoto", kind: "artist", about: "Composer", aliases: ["sakamoto"], facets: { music: 1, quiet: 0.8, design: 0.6, artsy: 0.5 } },
  { id: "lx:nujabes", name: "Nujabes", kind: "artist", about: "Producer", aliases: ["lofi", "lo-fi"], facets: { music: 0.9, quiet: 0.7, cozy: 0.5, nostalgic: 0.5 } },
  { id: "lx:taylor-swift", name: "Taylor Swift", kind: "artist", about: "Singer-songwriter", aliases: ["swift", "swiftie"], facets: { music: 1, cozy: 0.5, romantic: 0.5, literary: 0.3, social: 0.4 } },
  { id: "lx:haruki-murakami", name: "Haruki Murakami", kind: "person", about: "Author", aliases: ["murakami"], facets: { literary: 1, music: 0.6, quiet: 0.6, offbeat: 0.4 }, keywords: ["jazz", "records", "books"] },
  { id: "lx:sally-rooney", name: "Sally Rooney", kind: "person", about: "Author", aliases: ["normal people"], facets: { literary: 1, social: 0.5, quiet: 0.4 } },
  { id: "lx:joan-didion", name: "Joan Didion", kind: "person", about: "Author", aliases: ["didion"], facets: { literary: 1, quiet: 0.5, nostalgic: 0.5, design: 0.3 } },
  { id: "lx:muji", name: "MUJI", kind: "brand", about: "Retail brand", facets: { design: 1, quiet: 0.7, craft: 0.4 } },
  { id: "lx:aesop", name: "Aesop", kind: "brand", about: "Skincare brand", facets: { design: 0.9, craft: 0.6, quiet: 0.5, artsy: 0.3 } },
  { id: "lx:patagonia", name: "Patagonia", kind: "brand", about: "Outdoor apparel brand", facets: { nature: 1, social: 0.3, craft: 0.3 } },
  { id: "lx:criterion", name: "The Criterion Collection", kind: "brand", about: "Film distributor", aliases: ["criterion"], facets: { cinematic: 1, artsy: 0.6, nostalgic: 0.5, literary: 0.3 } },
];

const simple = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function lexiconById(id: string) {
  return LEXICON.find((e) => e.id === id);
}

export function lexiconByName(name: string) {
  const n = simple(name);
  return LEXICON.find((e) => simple(e.name) === n || e.aliases?.some((a) => simple(a) === n));
}

/** Entries whose name or alias starts with, or contains, what was typed. Exact names first. */
export function searchLexicon(query: string, take = 6): LexiconEntry[] {
  const q = simple(query);
  if (q.length < 2) return [];
  const score = (e: LexiconEntry) => {
    const names = [e.name, ...(e.aliases ?? [])].map(simple);
    if (names.some((n) => n === q)) return 3;
    if (names.some((n) => n.startsWith(q) || n.split(" ").some((w) => w.startsWith(q)))) return 2;
    if (names.some((n) => n.includes(q) || (q.length >= 4 && q.includes(n)))) return 1;
    return 0;
  };
  return LEXICON.map((e) => [e, score(e)] as const)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, take)
    .map(([e]) => e);
}
