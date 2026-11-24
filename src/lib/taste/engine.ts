import { distanceM } from "@/lib/geo";
import type { CulturalEntity, CulturalEvidence, Place, TasteProvenance } from "@/types";
import { claudeConfigured, interpretWithClaude, readListings, toProfile, type InterpretedCandidate } from "./ai";
import { blend, cosine, FACET_LABEL, facetsFromText, mentions, sharedFacets, type FacetVec, type TasteProfile } from "./facets";
import { lexiconById, lexiconByName, searchLexicon, type LexiconEntry } from "./lexicon";
import { profilePlace } from "./placeProfile";

/**
 * The Elsewhere Taste Engine: connects what someone loves to real places nearby.
 *
 *   interests ──Claude / lexicon──▶ taste profiles (facets + keywords + kinds of place)
 *   listings  ──rules (+ Claude)──▶ place profiles (facets, from listed facts only)
 *   affinity  = facet similarity + listing keyword hits + kind-of-place fit, per interest
 *
 * Everything it returns is explainable: which interest led, which facets the place shares with it, and
 * which words in the listing matched. With Claude configured, any interest can be profiled; without it,
 * the built-in lexicon and word rules still run the same engine on real place data.
 */

export type TasteMode = TasteProvenance;
export const tasteMode = (): TasteMode => (claudeConfigured() ? "ai" : "built-in");

export { entityKindLabel as entityTypeLabel } from "@/components/taste/entityLabels";

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
const simple = (s: string) => slug(s).replace(/-/g, " ");
const cap = (s: string) => s.trim().replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase());

function lexiconProfile(e: LexiconEntry): TasteProfile {
  return { facets: e.facets, keywords: e.keywords ?? [], categories: e.categories ?? [] };
}

function fromLexicon(e: LexiconEntry): CulturalEntity {
  return { id: e.id, name: e.name, type: e.kind, disambiguation: e.about, provenance: "built-in", origin: "picked", profile: lexiconProfile(e) };
}

function fromCandidate(c: InterpretedCandidate, opts: { name?: string; kind?: string } = {}): CulturalEntity | null {
  const profile = toProfile(c);
  if (!Object.keys(profile.facets).length) return null;
  const name = opts.name ?? c.name.trim();
  const kind = opts.kind ?? c.kind;
  return { id: `ai:${kind}:${slug(name)}`, name, type: kind, disambiguation: c.about.trim().slice(0, 80) || undefined, provenance: "ai", origin: "picked", profile };
}

/** Candidates for what was typed: built-in matches straight away, plus Claude's reading when configured. */
export async function resolveEntities(query: string): Promise<CulturalEntity[]> {
  const local = searchLexicon(query).map(fromLexicon);
  const read = await interpretWithClaude(query);
  const out = [...local];
  const seen = new Set(local.map((e) => simple(e.name)));
  for (const c of read?.candidates ?? []) {
    const e = fromCandidate(c);
    if (!e || seen.has(simple(e.name))) continue;
    seen.add(simple(e.name));
    out.push(e);
  }
  // Names that are exactly what was typed come first.
  const q = simple(query);
  return out.sort((a, b) => Number(simple(b.name) === q) - Number(simple(a.name) === q)).slice(0, 8);
}

/**
 * "Add it as I typed it": one interest in the person's own words. Claude profiles it when configured;
 * otherwise the word rules read it ("vintage records" → nostalgic, musical). Null when nothing fits.
 */
export async function interpretInterest(text: string): Promise<CulturalEntity | null> {
  const known = lexiconByName(text);
  if (known) return fromLexicon(known);
  const name = cap(text);
  const read = await interpretWithClaude(text);
  if (read) {
    const e = fromCandidate(read.as_typed, { name, kind: read.as_typed.kind === "person" || read.as_typed.kind === "artist" ? read.as_typed.kind : "interest" });
    if (e) return e;
  }
  const words = facetsFromText(text);
  if (!Object.keys(words.facets).length) return null;
  return {
    id: `tx:${slug(text)}`,
    name,
    type: "interest",
    disambiguation: `Read from the words: ${words.words.slice(0, 3).join(", ")}`,
    provenance: "built-in",
    origin: "picked",
    profile: { facets: words.facets, keywords: [text.trim().toLowerCase()], categories: [] },
  };
}

/**
 * Every interest with a profile. Vibe cards and lexicon picks travel without one (the server knows them);
 * interests saved before profiles existed are looked up again by name. Ones that can't be profiled are dropped.
 */
export async function hydrateSignals(signals: CulturalEntity[]): Promise<CulturalEntity[]> {
  const out = await Promise.all(
    signals.map(async (s): Promise<CulturalEntity | null> => {
      if (s.profile && Object.keys(s.profile.facets).length) return s;
      const lx = lexiconById(s.id) ?? lexiconByName(s.name);
      if (lx) return { ...fromLexicon(lx), id: s.id, name: s.name, origin: s.origin };
      try {
        const exact = (await resolveEntities(s.name)).find((e) => simple(e.name) === simple(s.name));
        const e = exact ?? (await interpretInterest(s.name));
        return e ? { ...e, id: s.id, name: s.name, origin: s.origin } : null;
      } catch {
        return null;
      }
    }),
  );
  return out.filter((e): e is CulturalEntity => !!e);
}

// --- Matching interests to places ----------------------------------------------

/** A place counts as a taste match from this affinity up. Below it, the overlap is too generic to claim. */
export const MATCH_THRESHOLD = 0.5;
/** A listing that names the interest (e.g. "jazz") counts from here, as long as the profiles aren't far apart. */
export const KEYWORD_FLOOR = 0.4;

interface InterestFit {
  entity: CulturalEntity;
  score: number;
  shared: string[];
  keywords: string[];
}

function fitOne(entity: CulturalEntity, facets: FacetVec, text: string, place: Place): InterestFit {
  const p = entity.profile!;
  const sim = cosine(p.facets, facets);
  const keywords = p.keywords.filter((k) => mentions(text, k)).slice(0, 3);
  const kind = p.categories.includes(place.category) ? 0.08 : 0;
  const score = Math.min(1, 0.78 * sim + Math.min(0.3, 0.15 * keywords.length) + kind);
  return { entity, score, shared: sharedFacets(p.facets, facets).slice(0, 3).map((f) => FACET_LABEL[f]), keywords };
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** "Shares Haruki Murakami's bookish and quiet side; the listing mentions "jazz"." */
export function explainFit(lead: { name: string; kind?: string; shared: string[]; keywords: string[] }) {
  const parts: string[] = [];
  if (lead.shared.length)
    parts.push(lead.kind === "vibe" ? `Fits your ${lead.name.toLowerCase()} pick: ${list(lead.shared.slice(0, 2))}` : `Shares ${lead.name}'s ${list(lead.shared.slice(0, 2))} side`);
  if (lead.keywords.length) parts.push(`${parts.length ? "the" : "The"} listing mentions ${list(lead.keywords.map((k) => `"${k}"`))}`);
  return parts.length ? `${parts.join("; ")}.` : `Lines up with ${lead.name}.`;
}

export interface TasteResult {
  mode: TasteMode;
  status: "ok" | "no-signals" | "error";
  message?: string;
  evidence: Map<string, CulturalEvidence>;
  /** The interests with profiles, as used. */
  signals: CulturalEntity[];
}

export async function culturalEvidence(args: {
  signals: CulturalEntity[];
  inventory: Place[];
  /** Read listings with Claude when configured (default true). */
  readWithClaude?: boolean;
  /** Where the user is; Claude reads the nearest listings first. */
  near?: { lat: number; lon: number };
}): Promise<TasteResult> {
  const mode = tasteMode();
  const evidence = new Map<string, CulturalEvidence>();
  const useClaude = args.readWithClaude !== false;
  const order = args.near ? [...args.inventory].sort((a, b) => distanceM(args.near!, a) - distanceM(args.near!, b)) : args.inventory;
  if (!args.signals.length) {
    // Nothing to match yet: start reading nearby listings so they're ready when an interest is added.
    if (useClaude) void readListings(order, { budgetMs: 0 });
    return { mode, status: "no-signals", evidence, signals: [] };
  }
  const signals = await hydrateSignals(args.signals);
  if (!signals.length) {
    return { mode, status: "no-signals", message: "Those interests couldn't be profiled. Try adding them again.", evidence, signals };
  }
  try {
    const reads = useClaude ? await readListings(order, { budgetMs: 1500 }) : new Map<string, FacetVec>();
    for (const place of args.inventory) {
      const rules = profilePlace(place);
      const claude = reads.get(place.id);
      const facets = claude ? blend(rules.facets, claude, 0.5) : rules.facets;
      const fits = signals.map((s) => fitOne(s, facets, rules.text, place)).sort((a, b) => b.score - a.score);
      const top = fits[0].score;
      const mean = fits.reduce((s, f) => s + f.score, 0) / fits.length;
      // One interest matching strongly is enough; others shouldn't dilute it much.
      const affinity = Number((0.7 * top + 0.3 * mean).toFixed(3));
      if (affinity < (fits[0].keywords.length ? KEYWORD_FLOOR : MATCH_THRESHOLD)) continue;
      const contributing = fits.filter((f) => f.score >= 0.3);
      const total = contributing.reduce((s, f) => s + f.score, 0) || 1;
      const lead = fits[0];
      evidence.set(place.id, {
        provenance: contributing.some((f) => f.entity.provenance === "ai") ? "ai" : "built-in",
        affinity,
        contributions: contributing.map((f) => ({ entityId: f.entity.id, entityName: f.entity.name, score: Number((f.score / total).toFixed(3)) })),
        match: lead.keywords.length ? "listing" : "profile",
        facets: lead.shared,
        keywords: lead.keywords,
        listingRead: claude ? "claude" : "rules",
        note: explainFit({ name: lead.entity.name, kind: lead.entity.type, shared: lead.shared, keywords: lead.keywords }),
      });
    }
    return { mode, status: "ok", evidence, signals };
  } catch (e) {
    console.warn("[taste]", (e as Error).message);
    return { mode, status: "error", message: "Taste matching failed, so places are ranked on practical fit.", evidence, signals };
  }
}
