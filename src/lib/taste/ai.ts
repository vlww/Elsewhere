import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { TtlCache } from "@/lib/cache";
import { PLACE_CATEGORIES, type Place } from "@/types";
import { FACET_MEANING, FACETS, type FacetVec, type TasteProfile } from "./facets";
import { listingText } from "./placeProfile";

/**
 * The two places Claude works inside the Taste Engine:
 *
 *  1. `interpretWithClaude` reads what someone typed ("Murakami", "boba", "brutalism") into candidate
 *     interests, each with a taste profile over Elsewhere's facets plus listing keywords and kinds of place.
 *  2. `readListings` reads nearby place listings (name, kind, tags, description) into facets, as a second
 *     opinion beside the rule-based profile.
 *
 * Claude never invents places, hours or facts: it only translates text Elsewhere already has into the
 * shared facet vocabulary, and every score it feeds is shown with the facets that produced it.
 */

/** A small, fast model: these calls never talk to the user and run on every new interest. */
export const TASTE_MODEL = process.env.ELSEWHERE_TASTE_MODEL ?? "claude-haiku-5-5";

export const claudeConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ maxRetries: 1 }));

const FACET_GUIDE = FACETS.map((f) => `- ${f}: ${FACET_MEANING[f]}`).join("\n");

// Arrays of {facet, weight} keep the schema simple for structured outputs; weights are clamped after.
const FacetWeights = z.array(z.object({ facet: z.enum(FACETS), weight: z.number() }));

export const ENTITY_KINDS = ["person", "artist", "film", "tv_show", "book", "brand", "game", "podcast", "food", "activity", "style", "vibe", "interest"] as const;

const Candidate = z.object({
  name: z.string().describe("The canonical name, correctly spelled"),
  kind: z.enum(ENTITY_KINDS),
  about: z.string().describe("Under 8 words that tell it apart, e.g. 'Japanese novelist' or 'Film, 2003'"),
  facets: FacetWeights.describe("2-6 facets with weights 0-1 for the places a fan of this would love"),
  keywords: z.array(z.string()).describe("2-6 lowercase words a matching venue listing might contain"),
  categories: z.array(z.enum(PLACE_CATEGORIES)).describe("1-3 kinds of place a fan would enjoy"),
});

const Interpretation = z.object({
  candidates: z.array(Candidate).describe("0-4 real, well-known things the text most likely names, best first; empty if it names none"),
  as_typed: Candidate.describe("The text itself taken as a general interest, in the person's own words"),
});
export type Interpretation = z.infer<typeof Interpretation>;
export type InterpretedCandidate = z.infer<typeof Candidate>;

const INTERPRET_SYSTEM = `You help a map app understand people's taste so it can suggest places they'd enjoy.
Someone types something they love: a person, film, band, book, brand, food, hobby or mood.

Describe each interpretation with Elsewhere's taste facets (weights 0-1, only the ones that clearly apply):
${FACET_GUIDE}

Rules:
- Only list candidates you are confident exist. Never invent titles, people or details; when unsure, return no candidates and rely on as_typed.
- Facets describe the kind of places a fan would enjoy, not the thing itself.
- Keywords are plain words that could appear in a real venue's name or listing (e.g. "jazz", "matcha", "vintage"), never the entity's own name.
- Stay neutral: no assumptions about the person's gender, age, ethnicity or income.`;

const interpretCache = new TtlCache<Interpretation | null>(24 * 60 * 60 * 1000, 800);

export function toProfile(c: { facets: { facet: string; weight: number }[]; keywords: string[]; categories: string[] }): TasteProfile {
  const facets: FacetVec = {};
  for (const { facet, weight } of c.facets) {
    if (!(FACETS as readonly string[]).includes(facet)) continue;
    const w = Math.max(0, Math.min(1, weight));
    if (w > 0.05) facets[facet as keyof FacetVec] = Number(w.toFixed(2));
  }
  return {
    facets,
    keywords: [...new Set(c.keywords.map((k) => k.trim().toLowerCase()).filter((k) => k.length >= 3 && k.length <= 40))].slice(0, 8),
    categories: c.categories.filter((x): x is TasteProfile["categories"][number] => (PLACE_CATEGORIES as readonly string[]).includes(x)).slice(0, 3),
  };
}

/** Claude's reading of a typed interest, or null when Claude isn't configured or the call fails. */
export async function interpretWithClaude(text: string): Promise<Interpretation | null> {
  if (!claudeConfigured()) return null;
  const key = text.trim().toLowerCase();
  const hit = interpretCache.get(key);
  if (hit !== undefined) return hit;
  let out: Interpretation | null = null;
  try {
    const msg = await anthropic().messages.parse(
      {
        model: TASTE_MODEL,
        max_tokens: 2048,
        system: INTERPRET_SYSTEM,
        output_config: { effort: "low", format: zodOutputFormat(Interpretation) },
        messages: [{ role: "user", content: `They typed: ${JSON.stringify(text.slice(0, 120))}` }],
      },
      { timeout: 15_000 },
    );
    if (msg.stop_reason !== "refusal") out = msg.parsed_output ?? null;
  } catch (e) {
    console.warn("[taste:interpret]", (e as Error).message);
    // Don't cache failures: a retry a moment later may succeed.
    return null;
  }
  interpretCache.set(key, out);
  return out;
}

// --- Reading place listings -------------------------------------------------

const ListingReads = z.object({
  places: z.array(z.object({ id: z.string(), facets: FacetWeights })),
});

const READ_SYSTEM = `You read short venue listings for a map app and describe each venue's character with taste facets (weights 0-1):
${FACET_GUIDE}

Rules:
- Use only what the listing says, plus what is typical for that exact kind of venue and name. Do not guess at specific facts.
- 1-5 facets per venue. If a listing says little, give fewer, lower weights.
- Return every id you were given, unchanged.`;

const readCache = new TtlCache<FacetVec>(7 * 24 * 60 * 60 * 1000, 4000);

/**
 * Claude's facet reading for each listing, by place id. Cached per place for a week; places that
 * aren't cached are read in one batched call with a short timeout, so a slow model never holds up results.
 */
export async function readListings(places: Place[], timeoutMs = 9000): Promise<Map<string, FacetVec>> {
  const out = new Map<string, FacetVec>();
  if (!claudeConfigured() || process.env.ELSEWHERE_READ_LISTINGS === "off") return out;
  const todo: Place[] = [];
  for (const p of places) {
    const hit = readCache.get(p.id);
    if (hit) out.set(p.id, hit);
    else todo.push(p);
  }
  const batch = todo.slice(0, 60);
  if (!batch.length) return out;
  const lines = batch.map((p) => `${p.id} | ${p.category.replace("_", " ")} | ${listingText(p).slice(0, 220)}`);
  try {
    const msg = await anthropic().messages.parse(
      {
        model: TASTE_MODEL,
        max_tokens: 8000,
        system: READ_SYSTEM,
        output_config: { effort: "low", format: zodOutputFormat(ListingReads) },
        messages: [{ role: "user", content: `Listings (id | kind | listing):\n${lines.join("\n")}` }],
      },
      { timeout: timeoutMs },
    );
    const known = new Set(batch.map((p) => p.id));
    for (const r of msg.parsed_output?.places ?? []) {
      if (!known.has(r.id)) continue;
      const facets = toProfile({ facets: r.facets, keywords: [], categories: [] }).facets;
      readCache.set(r.id, facets);
      out.set(r.id, facets);
    }
  } catch (e) {
    console.warn("[taste:read]", (e as Error).message);
  }
  return out;
}
