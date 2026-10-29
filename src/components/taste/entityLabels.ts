const LABELS: Record<string, string> = {
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
/** General interests are Qloo tags; their type names the facet (urn:tag:cuisine:qloo, urn:tag:ambience:place…). */
const TAG_KINDS: [RegExp, string][] = [
  [/:(cuisine|dietary_option|menu_highlight|specialty_dish)\b|:genre:place:restaurant/, "Food & drink"],
  [/:(ambience|decor|atmosphere|vibe)\b/, "Vibe"],
  [/:(activities|amenity|good_for)\b/, "Activity"],
  [/:genre:music\b/, "Music genre"],
  [/:genre:media\b|:keyword\b/, "Theme"],
  [/:category:place\b|:genre:place\b/, "Kind of place"],
  [/:genre:brand\b/, "Style"],
];

export const entityKindLabel = (t: string) =>
  LABELS[t] ?? (t.startsWith("urn:tag") ? TAG_KINDS.find(([re]) => re.test(t))?.[1] ?? "Interest" : "Interest");
