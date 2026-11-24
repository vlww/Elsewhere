/** Readable names for the kinds of interest the Taste Engine knows (mirrors ENTITY_KINDS in lib/taste/ai.ts). */
const LABELS: Record<string, string> = {
  person: "Person",
  artist: "Artist",
  film: "Film",
  tv_show: "TV show",
  book: "Book",
  brand: "Brand",
  game: "Game",
  podcast: "Podcast",
  food: "Food & drink",
  activity: "Activity",
  style: "Theme",
  vibe: "Vibe",
  interest: "Interest",
};

export const entityKindLabel = (t: string) => LABELS[t] ?? "Interest";
