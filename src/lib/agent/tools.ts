import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { geocode } from "@/lib/places/geocode";
import { ProviderError } from "@/lib/places";
import { entityTypeLabel, QlooError, resolveEntities, tasteMode } from "@/lib/qloo";
import { CATEGORY_LABEL } from "@/lib/recommendations/activities";
import { runSearch } from "@/lib/recommendations/pipeline";
import { buildTrail } from "@/lib/recommendations/trail";
import {
  ACTIVITIES,
  PLACE_CATEGORIES,
  SearchConstraintsSchema,
  type AgentSession,
  type ClientAction,
  type CulturalEntity,
  type Recommendation,
  type SearchResult,
} from "@/types";

// ---------------------------------------------------------------------------
// Tool input schemas (validated before execution)
// ---------------------------------------------------------------------------

const Cat = z.enum(PLACE_CATEGORIES);
const inputs = {
  set_location: z.object({ query: z.string().min(2).max(200) }),
  search_places: z.object({
    activity: z.enum(ACTIVITIES).optional(),
    radius_m: z.number().min(150).max(8000).optional(),
    include_categories: z.array(Cat).max(8).optional(),
    exclude_categories: z.array(Cat).max(8).optional(),
    max_price_level: z.number().int().min(1).max(4).nullable().optional(),
    require_open_now: z.boolean().optional(),
    require_wifi: z.boolean().optional(),
    require_outdoor: z.boolean().optional(),
    keywords: z.array(z.string().max(40)).max(8).optional(),
    duration_min: z.number().min(5).max(720).nullable().optional(),
    use_taste: z.boolean().optional(),
    reset: z.boolean().optional(),
  }),
  find_cultural_entities: z.object({ query: z.string().min(2).max(120), types: z.array(z.string()).max(6).optional() }),
  add_taste_signal: z.object({ entity_id: z.string().min(1).max(120) }),
  remove_taste_signal: z.object({ entity_id: z.string().min(1).max(120) }),
  set_lens: z.object({ mode: z.enum(["practical", "taste"]) }),
  focus_place: z.object({ place_id: z.string() }),
  get_place_details: z.object({ place_id: z.string() }),
  save_place: z.object({ place_id: z.string() }),
  unsave_place: z.object({ place_id: z.string() }),
  compare_places: z.object({ place_ids: z.array(z.string()).min(2).max(3) }),
  build_taste_trail: z.object({
    stops: z.number().int().min(2).max(4).optional(),
    max_total_walk_min: z.number().min(5).max(90).optional(),
  }),
} as const;
type ToolName = keyof typeof inputs;

const DESCRIPTIONS: Record<ToolName, string> = {
  set_location:
    "Geocode a neighborhood, campus, address or city the user mentions and move the search area there. Use when the user gives a place to search around or location is unknown.",
  search_places:
    "Search real places around the current location and rank them. Omitted fields keep the session's current constraints; set reset=true to start from defaults. Results appear on the map and in the results panel. Returns the top candidates with ids, practical facts, cultural evidence, and both practical and taste-aware ranks.",
  find_cultural_entities:
    "Look up films, artists, authors, brands, shows etc. by name to use as taste signals. Returns candidate entities with ids and disambiguation. The UI shows them as choices to the user.",
  add_taste_signal:
    "Add a cultural entity (id from find_cultural_entities) to the user's active interests for this session. Use only for an obvious single match or one the user picked.",
  remove_taste_signal: "Remove an interest from the active taste signals.",
  set_lens: "Switch the Taste Lens between practical ranking and taste-aware ranking.",
  focus_place: "Fly the map camera to a place from the current results and select it.",
  get_place_details: "Get the full evidence for one place in the current results: hours, listed amenities, score breakdown, cultural evidence, trade-offs.",
  save_place: "Save a place from the current results to the user's Saved list.",
  unsave_place: "Remove a place from the Saved list.",
  compare_places: "Open a side-by-side comparison of 2–3 places from the current results and return their differences.",
  build_taste_trail:
    "Build a short walking route through 2–4 distinct kinds of places from the current results (taste-aware when interests are active). Shown on the map.",
};

const asJsonSchema = (s: z.ZodType) => {
  const schema = z.toJSONSchema(s) as Record<string, unknown>;
  delete schema.$schema;
  return schema as Anthropic.Beta.BetaTool.InputSchema;
};

export const TOOLS: Anthropic.Beta.BetaTool[] = (Object.keys(inputs) as ToolName[]).map((name) => ({
  name,
  description: DESCRIPTIONS[name],
  input_schema: asJsonSchema(inputs[name]),
  eager_input_streaming: true,
}));

export const TOOL_STATUS: Partial<Record<ToolName, string>> = {
  set_location: "Finding that spot on the map…",
  find_cultural_entities: "Looking up that reference…",
  get_place_details: "Checking the details…",
  compare_places: "Lining them up…",
  build_taste_trail: "Sketching a route…",
};

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export interface ToolContext {
  session: AgentSession;
  result: SearchResult | null;
  knownEntities: CulturalEntity[];
  emit: (a: ClientAction) => void;
  status: (label: string) => void;
}

const lensOrder = (r: SearchResult, lens: "practical" | "taste") =>
  [...r.recommendations].sort((a, b) => (lens === "taste" ? a.tasteRank - b.tasteRank : a.practicalRank - b.practicalRank));

function compactRec(r: Recommendation, lens: "practical" | "taste") {
  return {
    id: r.place.id,
    name: r.place.name,
    category: CATEGORY_LABEL[r.place.category],
    walk_min: r.walkMin,
    open: r.openState.detail,
    price: r.place.priceLevel ? "$".repeat(r.place.priceLevel) : "not listed",
    wifi: r.place.wifi === "unknown" ? "not listed" : r.place.wifi,
    outdoor_seating: r.place.outdoorSeating === "unknown" ? "not listed" : r.place.outdoorSeating,
    practical_rank: r.practicalRank,
    taste_rank: r.tasteRank,
    cultural: r.cultural
      ? {
          provenance: r.cultural.provenance,
          affinity: r.cultural.affinity !== undefined ? Number(r.cultural.affinity.toFixed(3)) : undefined,
          contributors: r.cultural.contributions.map((c) => `${c.entityName} (${c.score.toFixed(2)})`),
          qloo_tags: r.cultural.qlooTags.slice(0, 4),
        }
      : null,
    tradeoffs: r.tradeoffs,
    score: Number((lens === "taste" ? r.tasteScore.total : r.practicalScore.total).toFixed(3)),
  };
}

function findRec(ctx: ToolContext, id: string) {
  return ctx.result?.recommendations.find((r) => r.place.id === id) ?? null;
}

const err = (message: string) => ({ error: message });

export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<unknown> {
  if (!(name in inputs)) return err(`Unknown tool ${name}`);
  const schema = inputs[name as ToolName];
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) return err(`Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const input = parsed.data as Record<string, unknown>;
  const s = ctx.session;

  switch (name as ToolName) {
    case "set_location": {
      try {
        const hits = await geocode(input.query as string);
        if (!hits.length) return err(`Couldn't find "${input.query}". Ask for a more specific place.`);
        s.location = hits[0];
        ctx.emit({ type: "set_location", location: hits[0] });
        return { location: hits[0], other_matches: hits.slice(1, 3).map((h) => h.label) };
      } catch (e) {
        return err(`Geocoding unavailable: ${(e as Error).message}`);
      }
    }

    case "search_places": {
      if (!s.location) {
        ctx.emit({ type: "need_location" });
        return err("No location yet. The UI is offering location access; also ask the user for a neighborhood or campus.");
      }
      const i = input as z.infer<typeof inputs.search_places>;
      const base = i.reset ? SearchConstraintsSchema.parse({}) : s.constraints;
      const constraints = SearchConstraintsSchema.parse({
        ...base,
        ...(i.activity && { activity: i.activity }),
        ...(i.radius_m && { radiusM: i.radius_m }),
        ...(i.include_categories && { includeCategories: i.include_categories }),
        ...(i.exclude_categories && { excludeCategories: i.exclude_categories }),
        ...(i.max_price_level !== undefined && { maxPriceLevel: i.max_price_level ?? undefined }),
        ...(i.require_open_now !== undefined && { requireOpenNow: i.require_open_now }),
        ...(i.require_wifi !== undefined && { requireWifi: i.require_wifi }),
        ...(i.require_outdoor !== undefined && { requireOutdoor: i.require_outdoor }),
        ...(i.keywords && { keywords: i.keywords }),
        ...(i.duration_min !== undefined && { durationMin: i.duration_min ?? undefined }),
      });
      s.constraints = constraints;
      ctx.emit({ type: "set_constraints", constraints });
      const useTaste = i.use_taste ?? (s.tasteSignals.length > 0 && s.lensMode === "taste");
      try {
        const result = await runSearch({
          location: s.location,
          constraints,
          tasteSignals: s.tasteSignals,
          feedback: s.feedback,
          clientNow: s.clientNow,
          onStatus: ctx.status,
        });
        ctx.result = result;
        const lens = useTaste && s.tasteSignals.length ? "taste" : "practical";
        if (lens !== s.lensMode) {
          s.lensMode = lens;
          ctx.emit({ type: "set_lens", mode: lens });
        }
        ctx.emit({ type: "results", result });
        const ordered = lensOrder(result, lens);
        const top = ordered.slice(0, 6);
        const practicalTop = lensOrder(result, "practical").slice(0, 6).map((r) => r.place.id);
        return {
          result_count: result.recommendations.length,
          lens,
          inventory: result.inventory,
          taste: result.taste,
          constraints,
          top: top.map((r) => compactRec(r, lens)),
          top_changes_vs_practical: lens === "taste" ? top.filter((r, idx) => practicalTop[idx] !== r.place.id).length : undefined,
          filtered_out_examples: result.filteredOut.slice(0, 5).map((f) => `${f.name}: ${f.reason}`),
        };
      } catch (e) {
        if (e instanceof ProviderError) return err(e.userMessage);
        console.error("[search_places]", e);
        return err("Place search failed unexpectedly.");
      }
    }

    case "find_cultural_entities": {
      try {
        const entities = await resolveEntities(input.query as string, input.types as string[] | undefined);
        ctx.knownEntities.push(...entities);
        ctx.emit({ type: "entity_choices", query: input.query as string, entities });
        return {
          mode: tasteMode(),
          candidates: entities.map((e) => ({ id: e.id, name: e.name, kind: entityTypeLabel(e.type), about: e.disambiguation })),
          note: entities.length ? undefined : "No matches. Tell the user and suggest a different spelling or a related reference.",
        };
      } catch (e) {
        return err(e instanceof QlooError ? `Qloo lookup failed (${e.kind}).` : "Lookup failed.");
      }
    }

    case "add_taste_signal": {
      const ent = ctx.knownEntities.find((e) => e.id === input.entity_id);
      if (!ent) return err("That id didn't come from find_cultural_entities in this conversation. Look it up first.");
      if (!s.tasteSignals.some((e) => e.id === ent.id)) {
        const added = { ...ent, origin: "conversation" as const };
        s.tasteSignals.push(added);
        ctx.emit({ type: "add_taste", entity: added });
      }
      return { active_interests: s.tasteSignals.map((e) => e.name) };
    }

    case "remove_taste_signal": {
      s.tasteSignals = s.tasteSignals.filter((e) => e.id !== input.entity_id);
      ctx.emit({ type: "remove_taste", entityId: input.entity_id as string });
      return { active_interests: s.tasteSignals.map((e) => e.name) };
    }

    case "set_lens": {
      s.lensMode = input.mode as "practical" | "taste";
      ctx.emit({ type: "set_lens", mode: s.lensMode });
      if (!ctx.result) return { lens: s.lensMode, note: "No results yet." };
      return { lens: s.lensMode, top: lensOrder(ctx.result, s.lensMode).slice(0, 5).map((r) => compactRec(r, s.lensMode)) };
    }

    case "focus_place": {
      const r = findRec(ctx, input.place_id as string);
      if (!r) return err("That place isn't in the current results.");
      ctx.emit({ type: "focus", placeId: r.place.id });
      return { focused: r.place.name };
    }

    case "get_place_details": {
      const r = findRec(ctx, input.place_id as string);
      if (!r) return err("That place isn't in the current results.");
      const p = r.place;
      return {
        ...compactRec(r, s.lensMode),
        address: p.address ?? "not listed",
        hours_listed: p.openingHoursText ?? p.openingHoursRaw ?? "not listed",
        data_source: p.source,
        description_from_listing: p.description ? `<<listing>>${p.description.slice(0, 400)}<</listing>>` : undefined,
        practical_evidence: r.practical,
        cultural_evidence: r.cultural ?? "No cultural signal for this place",
        score_breakdown: { practical: r.practicalScore, taste: r.tasteScore },
        rating: p.rating ? `${p.rating}${p.ratingCount ? ` (${p.ratingCount})` : ""}` : "not listed",
      };
    }

    case "save_place": {
      const r = findRec(ctx, input.place_id as string);
      if (!r) return err("That place isn't in the current results.");
      ctx.emit({ type: "save", placeId: r.place.id, place: r.place });
      return { saved: r.place.name };
    }

    case "unsave_place": {
      ctx.emit({ type: "unsave", placeId: input.place_id as string });
      return { removed: input.place_id };
    }

    case "compare_places": {
      const recs = (input.place_ids as string[]).map((id) => findRec(ctx, id)).filter((r): r is Recommendation => !!r);
      if (recs.length < 2) return err("Need at least two places from the current results.");
      ctx.emit({ type: "compare", placeIds: recs.map((r) => r.place.id) });
      return { compared: recs.map((r) => compactRec(r, s.lensMode)) };
    }

    case "build_taste_trail": {
      if (!ctx.result?.recommendations.length) return err("Search first, then build a trail from the results.");
      const trail = buildTrail(ctx.result.recommendations, {
        stops: (input.stops as number) ?? 3,
        maxLegMin: 15,
        maxTotalMin: (input.max_total_walk_min as number) ?? 35,
        useTaste: s.tasteSignals.length > 0,
      });
      if (!trail) return err("Couldn't find enough distinct, open places within walking distance of each other. Try a wider radius.");
      ctx.emit({ type: "trail", trail });
      return trail;
    }
  }
}
