import { distanceM, formatDistance, walkMinutes } from "@/lib/geo";
import { evaluateOpenState } from "@/lib/places/hours";
import type {
  CulturalEvidence,
  FeedbackEntry,
  OpenState,
  Place,
  PracticalEvidence,
  Recommendation,
  ScoreBreakdown,
  SearchConstraints,
  UserLocation,
} from "@/types";
import { ACTIVITY_VERB, activityFit, CATEGORY_LABEL, OUTDOOR_CATEGORIES } from "./activities";

/**
 * Ranking weights. Both modes share the same candidates and the same practical factors;
 * taste-aware mode moves weight onto cultural relevance. Weights sum to 1 per mode.
 *
 *  activity   – fit between place type and the requested activity (Elsewhere estimate)
 *  proximity  – exp(−distance / (0.6 × radius))
 *  attributes – verified amenities and hours relative to the request
 *  cultural   – Qloo affinity, rank-normalized within this result set (0 when Qloo returned nothing for the place)
 *  feedback   – in-session "more like this" / "not for me" signals
 */
export const WEIGHTS = {
  practical: { activity: 0.45, proximity: 0.3, attributes: 0.2, cultural: 0, feedback: 0.05 },
  taste: { activity: 0.3, proximity: 0.2, attributes: 0.14, cultural: 0.32, feedback: 0.04 },
} as const;

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

export interface Candidate {
  place: Place;
  cultural?: CulturalEvidence;
}

export interface RankInput {
  candidates: Candidate[];
  location: UserLocation;
  constraints: SearchConstraints;
  feedback: FeedbackEntry[];
  now: Date;
  /** Places asked for by name (a text search for "record store"); worth a walk past the usual radius. */
  farOk?: Set<string>;
}

function isOutdoor(p: Place) {
  return OUTDOOR_CATEGORIES.includes(p.category) || p.outdoorSeating === "yes";
}

function hardFilter(p: Place, d: number, open: OpenState, c: SearchConstraints, excluded: Set<string>, farOk?: Set<string>): string | null {
  if (excluded.has(p.id)) return "Dismissed earlier";
  if (d > c.radiusM && !farOk?.has(p.id)) return `Outside ${formatDistance(c.radiusM)} range`;
  if (c.includeCategories.length && !c.includeCategories.includes(p.category)) return "Different kind of place than requested";
  if (c.excludeCategories.includes(p.category)) return `${CATEGORY_LABEL[p.category]}s excluded`;
  if (activityFit(c.activity, p.category) < 0.1 && !c.includeCategories.includes(p.category)) return `Not suited to ${ACTIVITY_VERB[c.activity]}`;
  if (c.maxPriceLevel && p.priceLevel && p.priceLevel > c.maxPriceLevel) return "Above budget (listed price)";
  if (c.requireOpenNow && open.status === "closed") return "Closed now (listed hours)";
  if (c.requireWifi && p.wifi === "no") return "Listed without Wi-Fi";
  if (c.requireOutdoor && !isOutdoor(p) && p.outdoorSeating === "no") return "Listed without outdoor seating";
  return null;
}

function keywordHit(p: Place, keywords: string[]) {
  if (!keywords.length) return 0;
  const hay = [p.name, p.description, ...p.tags, CATEGORY_LABEL[p.category]].join(" ").toLowerCase();
  return keywords.filter((k) => k.length > 2 && hay.includes(k.toLowerCase())).length;
}

function practicalEvidence(p: Place, d: number, open: OpenState, c: SearchConstraints, srcLabel: string): PracticalEvidence[] {
  const ev: PracticalEvidence[] = [];
  ev.push({ label: "Distance", status: "met", detail: `${formatDistance(d)} · about ${walkMinutes(d)} min walk`, source: "Elsewhere estimate" });
  ev.push({
    label: "Hours",
    status: open.status === "open" ? "met" : open.status === "closed" ? "unmet" : "unknown",
    detail: open.detail,
    source: open.source ?? srcLabel,
  });
  if (c.maxPriceLevel || p.priceLevel) {
    ev.push({
      label: "Price",
      status: !p.priceLevel ? "unknown" : c.maxPriceLevel && p.priceLevel > c.maxPriceLevel ? "unmet" : "met",
      detail: p.priceLevel ? `${"$".repeat(p.priceLevel)} listed` : "Price not listed",
      source: srcLabel,
    });
  }
  if (c.requireWifi || c.activity === "study" || c.activity === "work") {
    ev.push({
      label: "Wi-Fi",
      status: p.wifi === "yes" ? "met" : p.wifi === "no" ? "unmet" : "unknown",
      detail: p.wifi === "yes" ? "Wi-Fi listed" : p.wifi === "no" ? "Listed as no Wi-Fi" : "Wi-Fi not listed",
      source: srcLabel,
    });
  }
  if (c.requireOutdoor || OUTDOOR_CATEGORIES.includes(p.category)) {
    const byType = OUTDOOR_CATEGORIES.includes(p.category);
    ev.push({
      label: "Outdoors",
      status: byType || p.outdoorSeating === "yes" ? "met" : p.outdoorSeating === "no" ? "unmet" : "unknown",
      detail: byType ? "Open-air space" : p.outdoorSeating === "yes" ? "Outdoor seating listed" : p.outdoorSeating === "no" ? "No outdoor seating listed" : "Outdoor seating not listed",
      source: byType ? "Place type" : srcLabel,
    });
  }
  const fit = activityFit(c.activity, p.category);
  ev.push({
    label: "Fit for the plan",
    status: fit >= 0.7 ? "met" : fit >= 0.4 ? "partial" : "unmet",
    detail: `${CATEGORY_LABEL[p.category]}s are ${fit >= 0.7 ? "usually good" : fit >= 0.4 ? "sometimes fine" : "rarely ideal"} for ${ACTIVITY_VERB[c.activity]}`,
    source: "Elsewhere estimate",
  });
  return ev;
}

function sourceLabel(p: Place) {
  return { osm: "OpenStreetMap", google: "Google Places", qloo: "Qloo", "demo-snapshot": "OpenStreetMap (snapshot)" }[p.source];
}

export function rank(input: RankInput) {
  const { location, constraints: c, feedback, now } = input;
  const excluded = new Set([
    ...c.excludePlaceIds,
    ...feedback.filter((f) => ["not-for-me", "already-been", "too-busy"].includes(f.reason)).map((f) => f.placeId),
  ]);
  const likedCats = new Set(feedback.filter((f) => f.reason === "more-like-this").map((f) => f.category));
  const dislikedCats = feedback.filter((f) => f.reason === "not-for-me").map((f) => f.category);
  const busyChainPenalty = feedback.some((f) => f.reason === "too-busy");

  const kept: (Candidate & { d: number; open: OpenState })[] = [];
  const filteredOut: { placeId: string; name: string; reason: string }[] = [];
  for (const cand of input.candidates) {
    const d = distanceM(location, cand.place);
    const open = evaluateOpenState(cand.place, now);
    const reason = hardFilter(cand.place, d, open, c, excluded, input.farOk);
    if (reason) filteredOut.push({ placeId: cand.place.id, name: cand.place.name, reason });
    else kept.push({ ...cand, d, open });
  }

  // Rank-normalize Qloo affinities among kept candidates so raw API values are never reinterpreted as percentages.
  const affs = kept.map((k) => k.cultural?.affinity).filter((a): a is number => a !== undefined);
  const lo = Math.min(...affs), hi = Math.max(...affs);
  const culturalScore = (a?: number) => (a === undefined ? 0 : hi > lo ? 0.4 + (0.6 * (a - lo)) / (hi - lo) : 0.7);

  const recs: Recommendation[] = kept.map(({ place: p, cultural, d, open }) => {
    let attr = 0.5;
    if (open.status === "open") attr += 0.15;
    if (open.status === "closed") attr -= 0.25;
    if (open.status === "unknown" && c.requireOpenNow) attr -= 0.1;
    if (c.activity === "study" || c.activity === "work" || c.requireWifi) attr += p.wifi === "yes" ? 0.2 : p.wifi === "no" ? -0.2 : c.requireWifi ? -0.1 : 0;
    if (c.requireOutdoor) attr += isOutdoor(p) ? 0.2 : -0.15;
    if (c.maxPriceLevel && !p.priceLevel) attr -= 0.05;
    if (p.tags.includes("free") || OUTDOOR_CATEGORIES.includes(p.category) || p.category === "library") attr += c.maxPriceLevel ? 0.1 : 0;
    attr += Math.min(2, keywordHit(p, c.keywords)) * 0.1;
    if (busyChainPenalty && p.tags.includes("chain")) attr -= 0.1;

    let fb = 0.5;
    if (likedCats.has(p.category)) fb += 0.4;
    fb -= dislikedCats.filter((x) => x === p.category).length * 0.2;

    const parts = {
      activity: activityFit(c.activity, p.category),
      proximity: Math.exp(-d / (0.6 * c.radiusM)),
      attributes: clamp(attr),
      cultural: culturalScore(cultural?.affinity),
      feedback: clamp(fb),
    };
    const score = (w: (typeof WEIGHTS)["practical" | "taste"]): ScoreBreakdown => ({
      ...parts,
      total: (Object.keys(w) as (keyof typeof w)[]).reduce((s, k) => s + w[k] * parts[k], 0),
      weights: { ...w },
    });

    const src = sourceLabel(p);
    const tradeoffs: string[] = [];
    if (open.status === "unknown") tradeoffs.push("Hours aren't listed, worth checking first");
    if (open.status === "closed") tradeoffs.push(open.detail);
    if (open.status === "open" && c.durationMin && open.closesInMin !== undefined && open.closesInMin < c.durationMin) {
      tradeoffs.push(`Closes in ${open.closesInMin} min, shorter than your ${c.durationMin}-min plan`);
    }
    if ((c.activity === "study" || c.activity === "work" || c.requireWifi) && p.wifi === "unknown") tradeoffs.push("Wi-Fi isn't listed");
    if (c.maxPriceLevel && !p.priceLevel) tradeoffs.push("Price isn't listed");
    if (d > c.radiusM * 0.7) tradeoffs.push("Toward the edge of your range");
    if (p.tags.includes("chain")) tradeoffs.push("Part of a chain");

    return {
      place: p,
      distanceM: Math.round(d),
      walkMin: walkMinutes(d),
      openState: open,
      practical: practicalEvidence(p, d, open, c, src),
      cultural,
      practicalScore: score(WEIGHTS.practical),
      tasteScore: score(WEIGHTS.taste),
      practicalRank: 0,
      tasteRank: 0,
      summary: summarize(p, d, open),
      tradeoffs,
    };
  });

  const byP = [...recs].sort((a, b) => b.practicalScore.total - a.practicalScore.total);
  byP.forEach((r, i) => (r.practicalRank = i + 1));
  [...recs].sort((a, b) => b.tasteScore.total - a.tasteScore.total).forEach((r, i) => (r.tasteRank = i + 1));
  return { recommendations: byP, filteredOut };
}

function summarize(p: Place, d: number, open: OpenState) {
  const bits = [`${CATEGORY_LABEL[p.category]} · ${walkMinutes(d)} min walk`];
  if (open.status !== "unknown") bits.push(open.detail);
  if (p.wifi === "yes") bits.push("Wi-Fi listed");
  if (p.outdoorSeating === "yes" && !OUTDOOR_CATEGORIES.includes(p.category)) bits.push("outdoor seats");
  if (p.priceLevel) bits.push("$".repeat(p.priceLevel));
  return bits.join(" · ");
}
