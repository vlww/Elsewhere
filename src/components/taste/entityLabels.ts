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
export const entityKindLabel = (t: string) => LABELS[t] ?? "Interest";
