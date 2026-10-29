import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { TtlCache } from "@/lib/cache";
import { PLACE_CATEGORIES, type CulturalEntity, type PlaceCategory } from "@/types";
import { searchTags } from "./client";
import { rankTags, qlooTagsFor, tasteMode } from "./index";

/**
 * "Add it as I typed it": turns any interest ("boba", "brutalism", "cozy rainy days") into something the
 * taste pipeline can use. The words are looked up as Qloo tags, then (when a guide model is configured)
 * rephrased into Qloo's vocabulary ("boba" is "bubble tea"), and as a last resort mapped to the kinds of
 * place it suggests. The interest keeps the user's own name; its disambiguation says what it matched.
 */

/** Common words Qloo files under another name; checked before asking a model. */
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

const Rephrase = z.object({
  phrases: z.array(z.string()).describe("2-4 short phrases in plain English for the same interest as a venue, menu item, cuisine, vibe or activity"),
  categories: z.array(z.enum(PLACE_CATEGORIES)).describe("1-3 kinds of place someone with this interest would enjoy"),
});

const rephraseCache = new TtlCache<z.infer<typeof Rephrase> | null>(24 * 60 * 60 * 1000, 500);

async function rephrase(text: string): Promise<z.infer<typeof Rephrase> | null> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  const key = text.toLowerCase();
  const hit = rephraseCache.get(key);
  if (hit !== undefined) return hit;
  let out: z.infer<typeof Rephrase> | null = null;
  try {
    const msg = await new Anthropic().messages.parse({
      // A tiny, cheap translation step; it never talks to the user.
      model: "claude-haiku-5-5",
      max_tokens: 1024,
      output_config: { effort: "low", format: zodOutputFormat(Rephrase) },
      messages: [
        {
          role: "user",
          content: `Someone says they love: "${text}". Rephrase it as short search phrases a place-and-menu tagging system would use (for "boba": "bubble tea", "bubble tea store"; for "brutalism": "architecture", "modern art"), and pick the kinds of place from the list that suit it.`,
        },
      ],
    });
    out = msg.parsed_output ?? null;
  } catch (e) {
    console.warn("[interpret]", (e as Error).message);
  }
  rephraseCache.set(key, out);
  return out;
}

const cap = (s: string) => s.trim().replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase());

/** The best place tag for one phrase, or null. */
async function tagFor(phrase: string) {
  const ranked = rankTags(await searchTags(phrase, 15), phrase);
  return ranked[0] ?? null;
}

export async function interpretInterest(text: string): Promise<CulturalEntity | null> {
  if (tasteMode() !== "live") return null;
  const name = cap(text);
  const base = { name, provenance: "live" as const, origin: "picked" as const };

  const direct = await tagFor(text);
  if (direct) return { ...base, id: direct.id, type: direct.type ?? "urn:tag", disambiguation: direct.name.toLowerCase() === text.trim().toLowerCase() ? undefined : `Matched to ${direct.name}` };

  const model = await rephrase(text);
  const phrases = [...(SYNONYMS[text.trim().toLowerCase()] ?? []), ...(model?.phrases ?? [])].slice(0, 5);
  for (const p of phrases) {
    const t = await tagFor(p);
    if (t) return { ...base, id: t.id, type: t.type ?? "urn:tag", disambiguation: `Matched to ${t.name}` };
  }

  // Nothing in Qloo's vocabulary: lean on the kinds of place it suggests.
  const cats = (model?.categories ?? []) as PlaceCategory[];
  const catTag = qlooTagsFor(cats.slice(0, 1))[0];
  if (catTag) return { ...base, id: catTag, type: "urn:tag:category:place", disambiguation: `Closest match: ${cats[0].replace("_", " ")} places` };
  return null;
}
