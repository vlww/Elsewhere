import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { geocode } from "@/lib/places/geocode";
import { ProviderError } from "@/lib/places";
import { entityTypeLabel, QlooError, resolveEntities, tasteMode } from "@/lib/qloo";
import { CATEGORY_LABEL } from "@/lib/recommendations/activities";
import { runSearch } from "@/lib/recommendations/pipeline";
import { planTrail, reviseTrail, TrailEditSchema, TrailError, type TrailContext } from "@/lib/trails/plan";
import { fmtDuration } from "@/lib/trails/narrative";
import { tasteHighlights } from "@/lib/taste/highlights";
import {
  ACTIVITIES,
  PLACE_CATEGORIES,
  SearchConstraintsSchema,
  type AgentSession,
  TRAIL_MODES,
  type ClientAction,
  type TasteTrail,
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
  set_taste_layer: z.object({ on: z.boolean() }),
  focus_place: z.object({ place_id: z.string() }),
  get_place_details: z.object({ place_id: z.string() }),
  save_place: z.object({ place_id: z.string() }),
  unsave_place: z.object({ place_id: z.string() }),
  compare_places: z.object({ place_ids: z.array(z.string()).min(2).max(3) }),
  plan_trail: z.object({
    stops: z
      .array(z.array(Cat).min(1).max(6))
      .min(2)
      .max(5)
      .optional()
      .describe("Ordered stops; each lists the kinds of place that would do for it. Omit to let Elsewhere choose an arc from the mood."),
    stop_count: z.number().int().min(2).max(5).optional(),
    keep_order: z.boolean().optional().describe("True when the user listed stops in a sequence they want kept."),
    mode: z.enum(TRAIL_MODES).optional(),
    time_budget_min: z.number().min(20).max(720).optional(),
    start_time: z.string().regex(/^\d{2}:\d{2}$/).optional().describe("Local HH:MM if the user gave one; omit for now."),
    max_price_level: z.number().int().min(1).max(4).optional(),
    max_leg_min: z.number().min(3).max(60).optional().describe("Longest hop between stops, e.g. 15 for 'within a 15-minute walk'."),
    end_near_start: z.boolean().optional(),
    exclude_categories: z.array(Cat).max(8).optional(),
    must_include_place_ids: z.array(z.string()).max(4).optional(),
    surprise: z.boolean().optional().describe("Reach past the obvious top matches."),
    mood: z.array(z.string().max(30)).max(6).optional().describe("The user's own mood words: creative, slow, date, dinner, film, cheap…"),
    outdoor: z.boolean().optional(),
    use_taste: z.boolean().optional(),
  }),
  revise_trail: z.object({
    edits: z
      .array(TrailEditSchema)
      .max(6)
      .default([])
      .describe("Stop numbers are 1-based in the current trail order. replace.because: not-my-vibe | too-expensive | less-touristy | outdoors | different."),
    mode: z.enum(TRAIL_MODES).optional(),
    time_budget_min: z.number().min(20).max(720).optional(),
    start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    max_price_level: z.number().int().min(1).max(4).optional(),
    max_leg_min: z.number().min(3).max(60).optional(),
    end_near_start: z.boolean().optional(),
    surprise: z.boolean().optional(),
  }),
  set_trail_story: z.object({
    title: z.string().min(3).max(60).optional(),
    summary: z.string().min(10).max(320).optional(),
    stop_notes: z
      .array(z.object({ place_id: z.string(), note: z.string().min(5).max(220) }))
      .max(5)
      .optional()
      .describe("One line per stop on why it belongs and how it connects to the last — grounded in the trail's evidence."),
  }),
} as const;
type ToolName = keyof typeof inputs;

const DESCRIPTIONS: Record<ToolName, string> = {
  set_location:
    "Geocode a neighborhood, campus, address or city the user mentions and move the search area there. Use when the user gives a place to search around or location is unknown.",
  search_places:
    "Search real places around the current location and rank them. Omitted fields keep the session's current constraints; set reset=true to start from defaults. Results appear on the map and in the results panel. Returns the top candidates with ids, practical facts, cultural evidence, and both practical and taste-aware ranks.",
  find_cultural_entities:
    "Look up taste signals by name: films, artists, authors, brands, shows, and general interests (cuisines, vibes, hobbies, music genres — returned as Qloo tags). Returns candidate entities with ids and disambiguation. The UI shows them as choices to the user.",
  add_taste_signal:
    "Add a cultural entity (id from find_cultural_entities) to the user's active interests for this session. Use only for an obvious single match or one the user picked.",
  remove_taste_signal: "Remove an interest from the active taste signals.",
  set_lens: "Switch the Taste Lens between practical ranking and taste-aware ranking.",
  set_taste_layer:
    "Turn the map's Taste Layer on or off. When on, places with cultural evidence for the user's interests are highlighted on the map (halos and tinted buildings in Explore, colourful lit buildings in Immersive) and ranking switches to taste-aware. Returns exactly which places are highlighted and why. Use for requests like 'make the map more colourful around places I'd love' or 'why are these highlighted?'.",
  focus_place: "Fly the map camera to a place from the current results and select it.",
  get_place_details: "Get the full evidence for one place in the current results: hours, listed amenities, score breakdown, cultural evidence, trade-offs.",
  save_place: "Save a place from the current results to the user's Saved list.",
  unsave_place: "Remove a place from the Saved list.",
  compare_places: "Open a side-by-side comparison of 2–3 places from the current results and return their differences.",
  plan_trail:
    "Plan a Taste Trail: a routed, timed outing through 2–5 real places, drawn on the map with a full itinerary panel. Translate the request into structure — ordered stops (kinds of place), time budget, mode, price cap, max hop, mood words. Uses active interests via Qloo, the place provider, OSRM routing and listed hours. Returns the itinerary with per-stop evidence, legs, timings and assumptions. Replaces any current trail.",
  revise_trail:
    "Change the current trail without rebuilding it: remove / replace / add stops, change the time at a stop, 'more like' a stop, or adjust time budget, mode, price cap, max hop, finishing near the start, or surprise. Kept stops stay put; affected legs, times and the map update together. Returns the revised itinerary and what changed.",
  set_trail_story:
    "Optionally give the current trail your own title, a one-paragraph summary and one line per stop, shown alongside Elsewhere's facts. Write only from the trail's evidence; don't add facts (hours, prices, atmosphere) that aren't in it.",
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
  plan_trail: "Sketching a trail…",
  revise_trail: "Reworking the trail…",
};

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export interface ToolContext {
  session: AgentSession;
  result: SearchResult | null;
  /** The trail currently on the map, if any. */
  trail: TasteTrail | null;
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

/** What the Taste Layer is drawing, from the same function the map uses. */
function highlightSummary(result: SearchResult, signals: CulturalEntity[]) {
  const hs = tasteHighlights(result.recommendations, signals);
  return {
    taste_status: result.taste.status,
    taste_message: result.taste.message,
    highlighted: hs.slice(0, 12).map((h) => ({
      id: h.placeId,
      name: h.name,
      category: CATEGORY_LABEL[h.category],
      tier: h.tier,
      top_contributor: h.entityName ?? "not broken down by Qloo",
      provenance: h.provenance,
      match: h.match,
    })),
    basis:
      "Highlighted = the strongest places carrying cultural evidence (Qloo Insights affinity in live mode, simulated in demo), at most 14. 'strong' = roughly the top quarter by affinity among these results. Colours only key which interest contributed most.",
  };
}

/** The itinerary as the guide sees it: facts, estimates and evidence, clearly separated. */
function compactTrail(t: TasteTrail) {
  return {
    title: t.story?.title ?? t.title,
    theme: t.theme,
    mode: t.mode,
    routed_for: t.routing.effectiveMode,
    routing: t.routing.live ? `live (${t.routing.provider})` : "estimated (routing unavailable)",
    starts: t.startAt,
    ends_estimate: t.endAt,
    total: fmtDuration(t.totalMin),
    travel: fmtDuration(t.travelMin),
    cultural: t.cultural,
    stops: t.stops.map((s) => ({
      n: s.order,
      id: s.placeId,
      name: s.place.name,
      category: CATEGORY_LABEL[s.place.category],
      arrive_estimate: s.arriveAt,
      stay_estimate_min: s.plannedMin,
      leg_in: { minutes: s.legIn.durationMin, meters: s.legIn.distanceM, routed: s.legIn.source === "osrm" },
      hours_at_arrival: s.openAtArrival.detail,
      price: s.place.priceLevel ? "$".repeat(s.place.priceLevel) : "not listed",
      address: s.place.address ?? "not listed",
      cultural: s.culturalRationale ?? null,
      qloo_tags: s.rec.cultural?.qlooTags.slice(0, 4) ?? [],
    })),
    back_to_start: t.legOut ? { minutes: t.legOut.durationMin } : undefined,
    assumptions: t.assumptions,
    change: t.changeNote,
  };
}

function trailContext(ctx: ToolContext): TrailContext | null {
  const s = ctx.session;
  if (!s.location) return null;
  return { location: s.location, tasteSignals: s.tasteSignals, feedback: s.feedback, clientNow: s.clientNow, onStatus: ctx.status };
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

    case "set_taste_layer": {
      const on = input.on as boolean;
      s.tasteLayer = on;
      if (on && s.tasteSignals.length) s.lensMode = "taste";
      ctx.emit({ type: "taste_layer", on });
      if (!on) return { taste_layer: false };
      if (!s.tasteSignals.length) return { taste_layer: true, highlighted: [], note: "No interests are active, so nothing is highlighted. Ask what they love." };
      if (!ctx.result) return { taste_layer: true, highlighted: [], note: "No results yet; search first." };
      return { taste_layer: true, ...highlightSummary(ctx.result, s.tasteSignals) };
    }

    case "plan_trail": {
      const tc = trailContext(ctx);
      if (!tc) {
        ctx.emit({ type: "need_location" });
        return err("No location yet. Ask where they're starting from, then call set_location.");
      }
      try {
        const trail = await planTrail(
          {
            slots: input.stops as never,
            stops: (input.stop_count as number | undefined) ?? ((input.stops as unknown[] | undefined)?.length || undefined),
            keepOrder: (input.keep_order as boolean) ?? false,
            mode: input.mode as never,
            timeBudgetMin: input.time_budget_min as number,
            startTime: input.start_time as string,
            maxPriceLevel: input.max_price_level as number,
            maxLegMin: input.max_leg_min as number,
            endNearStart: input.end_near_start as boolean,
            excludeCategories: input.exclude_categories as never,
            mustIncludePlaceIds: input.must_include_place_ids as string[],
            surprise: input.surprise as boolean,
            mood: input.mood as string[],
            requireOutdoor: input.outdoor as boolean,
            useTaste: (input.use_taste as boolean) ?? true,
          },
          tc,
        );
        ctx.trail = trail;
        ctx.emit({ type: "trail", trail });
        return compactTrail(trail);
      } catch (e) {
        if (e instanceof TrailError || e instanceof ProviderError) return err(e instanceof ProviderError ? e.userMessage : e.message);
        throw e;
      }
    }

    case "revise_trail": {
      const tc = trailContext(ctx);
      if (!ctx.trail) return err("There's no trail on the map to revise. Plan one first.");
      if (!tc) return err("No location for this trail.");
      try {
        const trail = await reviseTrail(
          ctx.trail,
          (input.edits as never) ?? [],
          Object.fromEntries(
            Object.entries({
              mode: input.mode,
              timeBudgetMin: input.time_budget_min,
              startTime: input.start_time,
              maxPriceLevel: input.max_price_level,
              maxLegMin: input.max_leg_min,
              endNearStart: input.end_near_start,
              surprise: input.surprise,
            }).filter(([, v]) => v !== undefined),
          ),
          tc,
        );
        ctx.trail = trail;
        ctx.emit({ type: "trail", trail });
        return compactTrail(trail);
      } catch (e) {
        if (e instanceof TrailError || e instanceof ProviderError) return err(e instanceof ProviderError ? e.userMessage : e.message);
        throw e;
      }
    }

    case "set_trail_story": {
      if (!ctx.trail) return err("There's no trail to write for.");
      const ids = new Set(ctx.trail.stops.map((s) => s.placeId));
      const notes = ((input.stop_notes as { place_id: string; note: string }[]) ?? []).filter((n) => ids.has(n.place_id));
      const story = {
        title: (input.title as string) ?? ctx.trail.story?.title,
        summary: (input.summary as string) ?? ctx.trail.story?.summary,
        notes: { ...(ctx.trail.story?.notes ?? {}), ...Object.fromEntries(notes.map((n) => [n.place_id, n.note])) },
      };
      ctx.trail = { ...ctx.trail, story };
      ctx.emit({ type: "trail_story", trailId: ctx.trail.id, story });
      return { ok: true, ignored_notes: ((input.stop_notes as unknown[]) ?? []).length - notes.length };
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

  }
}
