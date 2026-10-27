import { z } from "zod";
import { distanceM } from "@/lib/geo";
import { evaluateOpenState, wallClockDate } from "@/lib/places/hours";
import { runSearch } from "@/lib/recommendations/pipeline";
import { CATEGORY_LABEL } from "@/lib/recommendations/activities";
import { durationMatrix, routeLegs } from "@/lib/routing";
import {
  PlaceCategory,
  SearchConstraintsSchema,
  TrailSpecSchema,
  type CulturalEntity,
  type FeedbackEntry,
  type OpenState,
  type Recommendation,
  type SearchResult,
  type TasteTrail,
  type TrailLeg,
  type TrailSpec,
  type TrailStop,
  type UserLocation,
} from "@/types";
import { culturalLine, fmtClock, fmtDuration, MIN_STAY, roleLine, STAY_MIN, summaryLine, titleAndTheme, ACTIVITY } from "./narrative";

/**
 * Taste Trails: turn a spec (what the user asked for) into a routed, timed itinerary of real places.
 *
 *   1. candidates  — the shared recommendation pipeline (place provider + Qloo) for the slot categories
 *   2. selection   — the best-scoring set across slots, kept walkable (taste-aware score when interests exist)
 *   3. ordering    — the user's order if they gave one, else the fastest order by routed travel time,
 *                    nudged so the arc ends well (a meal last, not first)
 *   4. routing     — OSRM legs with street geometry; labelled estimates if unavailable
 *   5. timing      — stay estimates, arrival times, listed hours at arrival, then fit the time budget
 *
 * Revisions lock the stops the user didn't touch and redo only what changed.
 */

export interface TrailContext {
  location: UserLocation;
  tasteSignals: CulturalEntity[];
  feedback: FeedbackEntry[];
  clientNow: string;
  onStatus?: (label: string) => void;
}

export class TrailError extends Error {}

// --- Edits --------------------------------------------------------------------------

export const TrailEditSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("remove"), stop: z.number().int().min(1) }),
  z.object({
    op: z.literal("replace"),
    stop: z.number().int().min(1),
    categories: z.array(PlaceCategory).min(1).optional(),
    /** Why it's being replaced; steers the pick. */
    because: z.enum(["not-my-vibe", "too-expensive", "less-touristy", "outdoors", "different"]).optional(),
  }),
  z.object({ op: z.literal("add"), categories: z.array(PlaceCategory).min(1), position: z.number().int().min(1).optional() }),
  z.object({ op: z.literal("stay"), stop: z.number().int().min(1), minutes: z.number().min(5).max(300) }),
  z.object({ op: z.literal("more-like"), stop: z.number().int().min(1) }),
]);
export type TrailEdit = z.infer<typeof TrailEditSchema>;

export const TrailPatchSchema = TrailSpecSchema.pick({
  mode: true,
  timeBudgetMin: true,
  startTime: true,
  maxPriceLevel: true,
  maxLegMin: true,
  endNearStart: true,
  surprise: true,
  requireOutdoor: true,
}).partial();
export type TrailPatch = z.infer<typeof TrailPatchSchema>;

// --- Default arcs ------------------------------------------------------------------

const CULTURE: PlaceCategory[] = ["gallery", "museum", "arts_centre", "bookstore", "music"];
const PAUSE: PlaceCategory[] = ["cafe", "tea"];
const OUTSIDE: PlaceCategory[] = ["park", "garden", "plaza"];

/** A sensible arc when the user didn't name kinds of place; steered by their mood words. */
export function defaultSlots(spec: TrailSpec): PlaceCategory[][] {
  const mood = spec.mood.join(" ").toLowerCase();
  let arc: PlaceCategory[][];
  const says = (words: string) => new RegExp(`\\b(${words})`).test(mood);
  if (says("film|movie|cinema")) arc = [["bookstore", "music", "gallery"], PAUSE, ["cinema", "arts_centre"]];
  else if (says("music|record|vinyl")) arc = [["music"], PAUSE, OUTSIDE];
  else if (says("read|slow|quiet|calm|book")) arc = [["bookstore", "library"], OUTSIDE, [...PAUSE, "food"]];
  else if (says("date|romantic")) arc = [["gallery", "museum", "bookstore"], OUTSIDE, ["food"]];
  else if (says("dinner|eat\\b|food|hungry|lunch|meal")) arc = [CULTURE, OUTSIDE, ["food"]];
  else if (says("cheap|budget|free|broke") || spec.maxPriceLevel === 1) arc = [["park", "garden", "library"], ["bookstore", "gallery"], [...PAUSE, "food"]];
  else arc = [["gallery", "arts_centre", "museum", "bookstore"], PAUSE, OUTSIDE];
  const extra: PlaceCategory[][] = [["bookstore", "music", "gallery"], ["food"]];
  while (arc.length < spec.stops) arc.splice(arc.length - 1, 0, extra[(arc.length - 3) % extra.length]);
  return arc.slice(0, spec.stops);
}

// --- Helpers -----------------------------------------------------------------------

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60000);

function startDate(ctx: TrailContext, spec: TrailSpec) {
  const now = wallClockDate(ctx.clientNow);
  if (!spec.startTime) return now;
  const [h, m] = spec.startTime.split(":").map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d.getTime() < now.getTime() - 60 * 60000) d.setDate(d.getDate() + 1); // "at 9" said in the evening means tomorrow
  return d;
}

/** Search radius that keeps a trail realistic for the mode and time available. */
function radiusFor(spec: TrailSpec) {
  const base = { walking: 1300, transit: 1300, cycling: 3500, driving: 7000 }[spec.mode];
  if (!spec.timeBudgetMin) return base;
  const scale = Math.min(1.4, Math.max(0.5, spec.timeBudgetMin / 150));
  return Math.round(Math.min(8000, Math.max(450, base * scale)));
}

const KM_PENALTY = { walking: 0.09, transit: 0.09, cycling: 0.035, driving: 0.015 } as const;
const SPEED = { walking: 80, transit: 80, cycling: 230, driving: 330 } as const; // m/min, for selection-time estimates

function seededRandom(seed: number) {
  let s = (seed % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

interface Slot {
  cats: PlaceCategory[];
  /** Keep this exact place (revisions). */
  locked?: Recommendation;
  avoid: Set<string>;
  maxPrice?: number;
  surprise?: boolean;
  outdoor?: boolean;
  /** Prefer places sharing cultural signal with this one ("more like this"). */
  likeOf?: Recommendation;
  stay?: number;
}

function slotScore(r: Recommendation, slot: Slot, useTaste: boolean, rank: number, jitter: number) {
  let s = useTaste ? r.tasteScore.total : r.practicalScore.total;
  if (slot.surprise) {
    // Past the obvious: lift places with cultural signal that aren't the slot's top picks, lower chains.
    if (rank < 2) s -= 0.12;
    if (r.cultural) s += 0.1;
    if (r.place.tags.includes("chain")) s -= 0.15;
    if ((r.place.ratingCount ?? 0) > 2000) s -= 0.06;
    s += jitter * 0.12;
  }
  if (slot.outdoor) s += ["park", "garden", "plaza"].includes(r.place.category) || r.place.outdoorSeating === "yes" ? 0.15 : -0.2;
  if (slot.likeOf?.cultural && r.cultural) {
    const top = (ev: NonNullable<Recommendation["cultural"]>) => [...ev.contributions].sort((a, b) => b.score - a.score)[0]?.entityId;
    if (top(slot.likeOf.cultural) && top(slot.likeOf.cultural) === top(r.cultural)) s += 0.08;
    s += 0.03 * r.cultural.qlooTags.filter((t) => slot.likeOf!.cultural!.qlooTags.includes(t)).length;
  }
  return s;
}

function eligible(r: Recommendation, slot: Slot, spec: TrailSpec) {
  if (!slot.cats.includes(r.place.category)) return false;
  if (slot.avoid.has(r.place.id) || spec.excludePlaceIds.includes(r.place.id)) return false;
  if (spec.excludeCategories.includes(r.place.category)) return false;
  const cap = slot.maxPrice ?? spec.maxPriceLevel;
  if (cap && r.place.priceLevel && r.place.priceLevel > cap) return false;
  return true;
}

/** Best combination across slots: score minus a walkability penalty, within the max hop. Small beam search. */
function selectStops(slots: Slot[], pool: Recommendation[], spec: TrailSpec, ctx: TrailContext, useTaste: boolean, seed: number): (Recommendation | null)[] {
  const rnd = seededRandom(seed);
  const options = slots.map((slot) => {
    if (slot.locked) return [{ r: slot.locked, s: 1 }];
    return pool
      .filter((r) => eligible(r, slot, spec))
      .map((r, i) => ({ r, i }))
      .sort((a, b) => (useTaste ? a.r.tasteRank - b.r.tasteRank : a.r.practicalRank - b.r.practicalRank))
      .map(({ r }, rank) => ({ r, s: slotScore(r, slot, useTaste, rank, rnd()) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 7);
  });
  const maxHop = spec.maxLegMin ? (spec.maxLegMin * SPEED[spec.mode]) / 1.25 : Infinity;
  const pen = KM_PENALTY[spec.mode];
  let beams: { picks: (Recommendation | null)[]; score: number }[] = [{ picks: [], score: 0 }];
  for (const opts of options) {
    const next: typeof beams = [];
    for (const b of beams) {
      if (!opts.length) next.push({ picks: [...b.picks, null], score: b.score - 0.5 });
      for (const o of opts) {
        if (b.picks.some((p) => p?.place.id === o.r.place.id)) continue;
        const prev = [...b.picks].reverse().find(Boolean) ?? null;
        const from = prev ? prev.place : ctx.location;
        const d = distanceM(from, o.r.place);
        if (prev && d > maxHop) continue;
        next.push({ picks: [...b.picks, o.r], score: b.score + o.s - (pen * d) / 1000 });
      }
    }
    beams = next.sort((a, b) => b.score - a.score).slice(0, 60);
    if (!beams.length) beams = [{ picks: [...Array(options.indexOf(opts) + 1)].map(() => null), score: -9 }];
  }
  return beams[0].picks;
}

/** Order that minimises routed travel, with gentle preferences for a good arc. */
async function bestOrder(start: { lat: number; lon: number }, recs: Recommendation[], spec: TrailSpec, fixedOrder: boolean) {
  if (fixedOrder || recs.length < 3) return { order: recs.map((_, i) => i), live: false };
  const pts = [start, ...recs.map((r) => r.place)];
  const { minutes, live } = await durationMatrix(pts, spec.mode);
  const arcPenalty = (seq: number[]) => {
    let p = 0;
    const cats = seq.map((i) => recs[i].place.category);
    const foodAt = cats.indexOf("food");
    if (foodAt >= 0 && foodAt !== cats.length - 1) p += 8; // a meal belongs at the end
    if (["park", "garden", "plaza"].includes(cats[0]) && cats.length > 2) p += 3;
    if (cats[cats.length - 1] === "museum" && cats.length > 2) p += 2;
    return p;
  };
  let best: number[] = [];
  let bestCost = Infinity;
  const permute = (rest: number[], seq: number[]) => {
    if (!rest.length) {
      let cost = 0, prev = 0;
      for (const i of seq) {
        cost += minutes[prev][i + 1];
        prev = i + 1;
      }
      if (spec.endNearStart) cost += minutes[prev][0];
      cost += arcPenalty(seq);
      if (cost < bestCost) {
        bestCost = cost;
        best = seq;
      }
      return;
    }
    rest.forEach((x, k) => permute([...rest.slice(0, k), ...rest.slice(k + 1)], [...seq, x]));
  };
  permute(recs.map((_, i) => i), []);
  return { order: best, live };
}

// --- Assembly ------------------------------------------------------------------------

async function candidates(spec: TrailSpec, slots: Slot[], ctx: TrailContext): Promise<SearchResult> {
  const cats = [...new Set(slots.flatMap((s) => s.cats))].filter((c) => !spec.excludeCategories.includes(c));
  return runSearch({
    location: ctx.location,
    constraints: SearchConstraintsSchema.parse({
      activity: "explore",
      radiusM: radiusFor(spec),
      includeCategories: cats,
      maxPriceLevel: spec.maxPriceLevel,
      keywords: spec.mood,
    }),
    tasteSignals: spec.useTaste ? ctx.tasteSignals : [],
    feedback: ctx.feedback,
    clientNow: ctx.clientNow,
    onStatus: ctx.onStatus,
  });
}

function openAt(r: Recommendation, at: Date, offsetMin: number): OpenState {
  if (!r.place.openingHoursRaw && r.place.openNowReported !== undefined && offsetMin > 30)
    return { status: "unknown", detail: "Hours for that time aren't listed — check before going" };
  return evaluateOpenState(r.place, at);
}

interface Built {
  recs: Recommendation[];
  slotIdx: number[];
}

/** Routes, times and validates; swaps closed stops; fits the time budget. */
async function assemble(args: {
  built: Built;
  spec: TrailSpec;
  slots: Slot[];
  pool: Recommendation[];
  ctx: TrailContext;
  result: SearchResult;
  useTaste: boolean;
  fixedOrder: boolean;
  /** Requested slots nothing suitable was found for. */
  unfilled: Slot[];
  id?: string;
  story?: TasteTrail["story"];
}): Promise<TasteTrail> {
  const { spec, ctx, result } = args;
  let { recs, slotIdx } = args.built;
  const assumptions: string[] = [];
  const t0 = startDate(ctx, spec);
  const start = { name: ctx.location.label.split(",")[0], lat: ctx.location.lat, lon: ctx.location.lon };

  ctx.onStatus?.("Working out the route…");
  const ordered = await bestOrder(start, recs, spec, args.fixedOrder);
  recs = ordered.order.map((i) => recs[i]);
  slotIdx = ordered.order.map((i) => slotIdx[i]);

  // Swap stops that are listed closed at their planned arrival (up to two passes).
  let legs: TrailLeg[] = [];
  let routing = await routeLegs([start, ...recs.map((r) => r.place), ...(spec.endNearStart ? [start] : [])], spec.mode);
  for (let pass = 0; pass < 3; pass++) {
    legs = routing.legs;
    let clock = t0;
    let swapped = false;
    for (let i = 0; i < recs.length; i++) {
      clock = addMin(clock, legs[i]?.durationMin ?? 0);
      const st = openAt(recs[i], clock, (clock.getTime() - t0.getTime()) / 60000);
      const slot = args.slots[slotIdx[i]];
      if (st.status === "closed" && !slot.locked && pass < 2) {
        // The best-ranked of the nearest few open alternatives for the same slot.
        const rank = (r: Recommendation) => (args.useTaste ? r.tasteRank : r.practicalRank);
        const alt = args.pool
          .filter((r) => eligible(r, slot, spec) && !recs.some((x) => x.place.id === r.place.id))
          .filter((r) => openAt(r, clock, 0).status !== "closed")
          .sort((a, b) => distanceM(a.place, recs[i].place) - distanceM(b.place, recs[i].place))
          .slice(0, 4)
          .sort((a, b) => rank(a) - rank(b))[0];
        if (alt) {
          assumptions.push(`${recs[i].place.name} is listed closed when you'd arrive, so ${alt.place.name} takes its place.`);
          recs[i] = alt;
          swapped = true;
        }
      }
      clock = addMin(clock, stayFor(recs[i], slot, spec));
    }
    if (!swapped) break;
    routing = await routeLegs([start, ...recs.map((r) => r.place), ...(spec.endNearStart ? [start] : [])], spec.mode);
  }

  // Fit the time budget: first trim stays (not below a minimum), then drop the weakest unlocked stop.
  const stays = recs.map((r, i) => stayFor(r, args.slots[slotIdx[i]], spec));
  const travel = () => routing.legs.reduce((s, l) => s + l.durationMin, 0);
  const total = () => travel() + stays.reduce((s, x) => s + x, 0);
  if (spec.timeBudgetMin && total() > spec.timeBudgetMin) {
    const scale = Math.max(0.6, (spec.timeBudgetMin - travel()) / stays.reduce((s, x) => s + x, 0));
    for (let i = 0; i < stays.length; i++) if (!spec.stay[recs[i].place.id]) stays[i] = Math.max(MIN_STAY, Math.round(stays[i] * scale));
    if (scale < 1) assumptions.push(`Shortened the time at each stop to fit your ${fmtDuration(spec.timeBudgetMin)}.`);
    while (total() > spec.timeBudgetMin && recs.length > 2) {
      const score = (r: Recommendation) => (args.useTaste ? r.tasteScore.total : r.practicalScore.total);
      const candidatesToDrop = recs.map((r, i) => ({ r, i })).filter(({ i }) => !args.slots[slotIdx[i]].locked || recs.length > 3);
      const drop = candidatesToDrop.sort((a, b) => score(a.r) - score(b.r))[0];
      if (!drop) break;
      assumptions.push(`Dropped ${drop.r.place.name} so the trail fits in ${fmtDuration(spec.timeBudgetMin)}.`);
      recs.splice(drop.i, 1);
      slotIdx.splice(drop.i, 1);
      stays.splice(drop.i, 1);
      routing = await routeLegs([start, ...recs.map((r) => r.place), ...(spec.endNearStart ? [start] : [])], spec.mode);
    }
    if (total() > spec.timeBudgetMin)
      assumptions.push(`Even at two stops this runs about ${Math.round(total() - spec.timeBudgetMin)} min over your ${fmtDuration(spec.timeBudgetMin)} — consider fewer stops or a closer area.`);
  }
  legs = routing.legs;

  // Final timing.
  let clock = t0;
  const interestNames = result.tasteSignals.map((e) => e.name);
  const stops: TrailStop[] = recs.map((r, i) => {
    const legIn = legs[i];
    clock = addMin(clock, legIn.durationMin);
    const arrive = clock;
    const open = openAt(r, arrive, (arrive.getTime() - t0.getTime()) / 60000);
    let planned = stays[i];
    if (open.status === "open" && open.closesInMin !== undefined && open.closesInMin < planned) {
      planned = Math.max(MIN_STAY, open.closesInMin - 5);
      assumptions.push(`${r.place.name} is listed as closing soon after you'd arrive; the stay there is shortened.`);
    }
    clock = addMin(arrive, planned);
    return {
      placeId: r.place.id,
      order: i + 1,
      place: r.place,
      rec: r,
      slot: slotIdx[i],
      plannedMin: planned,
      arriveAt: hhmm(arrive),
      leaveAt: hhmm(clock),
      openAtArrival: open,
      reason: roleLine(i, recs.length, r.place.category),
      activity: ACTIVITY[r.place.category],
      culturalRationale: args.useTaste ? culturalLine(r.cultural, interestNames) : undefined,
      legIn,
    };
  });
  const legOut = spec.endNearStart ? legs[recs.length] : undefined;
  if (legOut) clock = addMin(clock, legOut.durationMin);

  // Honest notes about what's estimated or missing.
  assumptions.push("Time at each stop is Elsewhere's estimate for that kind of place.");
  if (!spec.startTime) assumptions.push(`Starts now (${hhmm(t0)}) from ${start.name}.`);
  const unknownHours = stops.filter((s) => s.openAtArrival.status === "unknown").map((s) => s.place.name);
  if (unknownHours.length) assumptions.push(`Hours aren't listed for ${unknownHours.join(", ")} — check before you go.`);
  if (spec.maxPriceLevel) {
    const unpriced = stops.filter((s) => !s.place.priceLevel).map((s) => s.place.name);
    if (unpriced.length) assumptions.push(`Prices aren't listed for ${unpriced.join(", ")}, so the budget can't be confirmed there.`);
  }
  for (const slot of args.unfilled)
    assumptions.push(`Couldn't find a ${slot.cats.map((c) => CATEGORY_LABEL[c].toLowerCase()).join(" or ")} that fits; the trail goes without it.`);
  if (args.useTaste && ctx.tasteSignals.length) {
    const without = stops.filter((s) => !s.rec.cultural).map((s) => s.place.name);
    if (without.length && without.length < stops.length) assumptions.push(`${without.join(", ")} ${without.length === 1 ? "was" : "were"} chosen on practical fit; there's no cultural signal for ${without.length === 1 ? "it" : "them"}.`);
    if (result.taste.status === "error") assumptions.push(`Cultural matching failed (${result.taste.message ?? "Qloo error"}), so stops are chosen on practical fit.`);
  }
  if (routing.info.note) assumptions.push(routing.info.note);

  const travelMin = legs.reduce((s, l) => s + l.durationMin, 0);
  const stayMin = stops.reduce((s, x) => s + x.plannedMin, 0);
  const cats = stops.map((s) => s.place.category);
  const { title, theme } = titleAndTheme(cats, spec, hhmm(t0), stops.some((s) => s.rec.cultural) ? interestNames : []);
  const story = args.story
    ? { ...args.story, notes: Object.fromEntries(Object.entries(args.story.notes).filter(([id]) => stops.some((s) => s.placeId === id))) }
    : undefined;

  return {
    id: args.id ?? `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    createdAt: new Date().toISOString(),
    title,
    theme,
    summary: summaryLine(stops.map((s) => s.place.name), cats, travelMin + stayMin, routing.info.effectiveMode),
    story,
    start,
    spec,
    mode: spec.mode,
    stops,
    legOut,
    startAt: hhmm(t0),
    endAt: hhmm(clock),
    totalMin: travelMin + stayMin,
    travelMin,
    stayMin,
    routing: routing.info,
    cultural: {
      mode: result.taste.mode,
      status: result.taste.status,
      matchedStops: stops.filter((s) => s.rec.cultural).length,
      message: result.taste.message,
    },
    assumptions: [...new Set(assumptions)],
  };
}

function stayFor(r: Recommendation, slot: Slot | undefined, spec: TrailSpec) {
  return spec.stay[r.place.id] ?? slot?.stay ?? STAY_MIN[r.place.category];
}

// --- Public API ------------------------------------------------------------------------

export async function planTrail(rawSpec: Partial<TrailSpec>, ctx: TrailContext): Promise<TasteTrail> {
  const spec = TrailSpecSchema.parse(rawSpec);
  const slotCats = spec.slots ?? defaultSlots(spec);
  const slotsList: Slot[] = slotCats.map((cats) => ({
    cats: cats.filter((c) => !spec.excludeCategories.includes(c)),
    avoid: new Set(),
    surprise: spec.surprise,
    outdoor: spec.requireOutdoor && cats.some((c) => ["park", "garden", "plaza"].includes(c)),
  }));
  if (slotsList.some((s) => !s.cats.length)) throw new TrailError("Every requested kind of place was excluded.");

  ctx.onStatus?.("Looking for places along the way…");
  const result = await candidates(spec, slotsList, ctx);
  const pool = result.recommendations;
  const useTaste = spec.useTaste && ctx.tasteSignals.length > 0 && result.taste.status === "ok";

  // Places the user insisted on fill the slot that fits them, or join as extra stops.
  for (const id of spec.mustIncludePlaceIds) {
    const r = pool.find((x) => x.place.id === id);
    if (!r) continue;
    const slot = slotsList.find((s) => !s.locked && s.cats.includes(r.place.category));
    if (slot) slot.locked = r;
    else slotsList.push({ cats: [r.place.category], locked: r, avoid: new Set() });
  }

  ctx.onStatus?.(useTaste ? "Weighing your interests against the options…" : "Picking the stops…");
  const picks = selectStops(slotsList, pool, spec, ctx, useTaste, Date.now());
  const built: Built = { recs: [], slotIdx: [] };
  picks.forEach((r, i) => {
    if (r) {
      built.recs.push(r);
      built.slotIdx.push(i);
    }
  });
  if (built.recs.length < 2) {
    const missing = slotsList.filter((_, i) => !picks[i]).map((s) => s.cats.map((c) => CATEGORY_LABEL[c].toLowerCase()).join("/"));
    throw new TrailError(
      `Couldn't find enough places that fit${missing.length ? ` (nothing suitable for: ${missing.join("; ")})` : ""}. Try a wider area, more time, or fewer constraints.`,
    );
  }
  const unfilled = slotsList.filter((_, i) => !picks[i]);
  const trail = await assemble({ built, spec, slots: slotsList, pool, ctx, result, useTaste, fixedOrder: spec.keepOrder, unfilled });
  trail.changeNote = `Planned ${trail.stops.length} stops: ${trail.stops.map((s) => s.place.name).join(" → ")}.`;
  return trail;
}

export async function reviseTrail(trail: TasteTrail, edits: TrailEdit[], patch: TrailPatch, ctx: TrailContext): Promise<TasteTrail> {
  const spec: TrailSpec = TrailSpecSchema.parse({ ...trail.spec, ...patch, stay: { ...trail.spec.stay } });
  // Every current stop starts locked; edits unlock or remove only what they touch.
  type Entry = { slot: Slot; removed?: boolean };
  const entries: Entry[] = trail.stops.map((s) => ({
    slot: { cats: trail.spec.slots?.[s.slot] ?? [s.place.category], locked: s.rec, avoid: new Set([s.placeId]), surprise: spec.surprise },
  }));
  let reorder = patch.endNearStart !== undefined && patch.endNearStart !== trail.spec.endNearStart;
  const at = (n: number) => {
    const e = entries[n - 1];
    if (!e || e.removed) throw new TrailError(`There's no stop ${n} on this trail.`);
    return e;
  };
  const notes: string[] = [];
  for (const ed of edits) {
    switch (ed.op) {
      case "remove":
        at(ed.stop).removed = true;
        spec.excludePlaceIds = [...spec.excludePlaceIds, trail.stops[ed.stop - 1].placeId];
        break;
      case "replace": {
        const e = at(ed.stop);
        const old = e.slot.locked!;
        e.slot.locked = undefined;
        if (ed.categories) e.slot.cats = ed.categories;
        if (ed.because === "outdoors") {
          e.slot.cats = ed.categories ?? ["park", "garden", "plaza"];
          e.slot.outdoor = true;
        }
        if (ed.because === "too-expensive") e.slot.maxPrice = Math.max(1, (old.place.priceLevel ?? 2) - 1);
        if (ed.because === "less-touristy") e.slot.surprise = true;
        if (ed.because === "not-my-vibe" && !ed.categories && e.slot.cats.length > 1) e.slot.cats = e.slot.cats.filter((c) => c !== old.place.category);
        spec.excludePlaceIds = [...spec.excludePlaceIds, old.place.id];
        break;
      }
      case "add":
        entries.splice(Math.min(entries.length, (ed.position ?? entries.length + 1) - 1), 0, { slot: { cats: ed.categories, avoid: new Set(), surprise: spec.surprise } });
        reorder = !ed.position;
        break;
      case "stay":
        spec.stay = { ...spec.stay, [trail.stops[ed.stop - 1].placeId]: ed.minutes };
        at(ed.stop);
        break;
      case "more-like": {
        const liked = at(ed.stop).slot.locked!;
        entries.forEach((e, k) => {
          if (k !== ed.stop - 1 && !e.removed && e.slot.locked) {
            spec.excludePlaceIds = [...spec.excludePlaceIds, e.slot.locked.place.id];
            e.slot.locked = undefined;
            e.slot.likeOf = liked;
          }
        });
        notes.push(`Kept ${liked.place.name} and looked for more with the same cultural signal.`);
        break;
      }
    }
  }
  // Constraint changes can invalidate kept stops (a price cap, a shorter hop).
  for (const e of entries) {
    const r = e.slot.locked;
    if (!r) continue;
    if (spec.maxPriceLevel && r.place.priceLevel && r.place.priceLevel > spec.maxPriceLevel) {
      e.slot.locked = undefined;
      notes.push(`${r.place.name} is listed above your budget, so it's replaced.`);
    }
  }
  if (patch.mode && patch.mode !== trail.spec.mode) reorder = true;
  // "Surprise me": re-pick every stop the user didn't insist on, past the obvious choices.
  if (patch.surprise && !trail.spec.surprise) {
    for (const e of entries) {
      const r = e.slot.locked;
      if (!r || e.removed || spec.mustIncludePlaceIds.includes(r.place.id)) continue;
      e.slot.locked = undefined;
      e.slot.surprise = true;
      e.slot.avoid.add(r.place.id);
    }
    reorder = true;
    notes.push("Looked past the most obvious matches.");
  }
  const live = entries.filter((e) => !e.removed);
  if (live.length < 2 && !live.some((e) => !e.slot.locked)) throw new TrailError("A trail needs at least two stops.");
  spec.slots = live.map((e) => e.slot.cats);

  ctx.onStatus?.("Reworking the trail…");
  const needsSearch = live.some((e) => !e.slot.locked);
  const result = needsSearch ? await candidates(spec, live.map((e) => e.slot), ctx) : resultFromTrail(trail, ctx);
  const pool = result.recommendations;
  const useTaste = spec.useTaste && ctx.tasteSignals.length > 0 && result.taste.status === "ok";
  // Kept stops keep their evidence; refresh it from the new search when the same place is there.
  for (const e of live) if (e.slot.locked) e.slot.locked = pool.find((r) => r.place.id === e.slot.locked!.place.id) ?? e.slot.locked;

  const picks = selectStops(live.map((e) => e.slot), pool, spec, ctx, useTaste, Date.now());
  const built: Built = { recs: [], slotIdx: [] };
  picks.forEach((r, i) => {
    if (r) {
      built.recs.push(r);
      built.slotIdx.push(i);
    }
  });
  if (built.recs.length < 2) throw new TrailError("That change leaves fewer than two stops that fit. Try loosening a constraint.");
  const next = await assemble({
    built,
    spec,
    slots: live.map((e) => e.slot),
    pool,
    ctx,
    result,
    useTaste,
    fixedOrder: !reorder,
    unfilled: live.map((e) => e.slot).filter((_, i) => !picks[i]),
    id: trail.id,
    story: trail.story,
  });
  next.changeNote = describeChange(trail, next, notes);
  return next;
}

/** Minimal SearchResult wrapper for revisions that keep every stop (only timing or mode changes). */
function resultFromTrail(trail: TasteTrail, ctx: TrailContext): SearchResult {
  return {
    id: `s_trail_${trail.id}`,
    createdAt: new Date().toISOString(),
    location: ctx.location,
    constraints: SearchConstraintsSchema.parse({}),
    tasteSignals: ctx.tasteSignals,
    recommendations: trail.stops.map((s) => s.rec),
    filteredOut: [],
    inventory: { provider: "trail", count: trail.stops.length },
    taste: { mode: trail.cultural.mode, status: trail.cultural.status, matched: trail.cultural.matchedStops, message: trail.cultural.message },
  };
}

function describeChange(before: TasteTrail, after: TasteTrail, notes: string[]) {
  const was = new Set(before.stops.map((s) => s.placeId));
  const now = new Set(after.stops.map((s) => s.placeId));
  const added = after.stops.filter((s) => !was.has(s.placeId)).map((s) => s.place.name);
  const removed = before.stops.filter((s) => !now.has(s.placeId)).map((s) => s.place.name);
  const bits = [...notes];
  if (removed.length && added.length) bits.push(`Swapped ${removed.join(", ")} for ${added.join(", ")}.`);
  else if (added.length) bits.push(`Added ${added.join(", ")}.`);
  else if (removed.length) bits.push(`Removed ${removed.join(", ")}.`);
  const dt = after.totalMin - before.totalMin;
  if (Math.abs(dt) >= 3) bits.push(`Now about ${fmtDuration(after.totalMin)} (${dt > 0 ? "+" : "−"}${fmtDuration(Math.abs(dt))}), ending around ${fmtClock(after.endAt)}.`);
  if (after.mode !== before.mode) bits.push(`Routes are now for ${after.routing.effectiveMode}.`);
  return bits.join(" ") || "Recalculated the route and timings.";
}
