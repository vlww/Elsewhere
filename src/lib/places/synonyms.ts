/**
 * Common words that places list under another name ("boba" shops call themselves bubble tea).
 * Used when a trail stop asks for something more specific than a kind of place.
 */
const SYNONYMS: Record<string, string[]> = {
  boba: ["bubble tea"],
  "milk tea": ["bubble tea"],
  "pearl tea": ["bubble tea"],
  thrifting: ["thrift store", "vintage"],
  thrift: ["thrift store", "vintage"],
  "coffee shops": ["coffee shop"],
  vinyl: ["record store"],
  records: ["record store"],
  plants: ["plant nursery", "garden"],
  "dim sum": ["dim sum"],
  ramen: ["ramen"],
  pho: ["pho"],
  manga: ["manga", "comic book store"],
  anime: ["anime"],
  bouldering: ["climbing gym"],
  climbing: ["climbing gym"],
};

/** Other names a place might go by for these words ("boba" → "bubble tea"). */
export function synonymsFor(text: string): string[] {
  return SYNONYMS[text.trim().toLowerCase()] ?? [];
}
