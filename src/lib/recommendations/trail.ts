import { distanceM, walkMinutes } from "@/lib/geo";
import type { Recommendation, TasteTrail, TrailStop } from "@/types";
import { CATEGORY_LABEL } from "./activities";

/**
 * Builds a short walking route of distinct kinds of places, greedily by taste-aware score
 * with a per-leg walking limit. The sequence is Elsewhere's synthesis; cultural reasons per stop
 * come only from each stop's own evidence.
 */
export function buildTrail(recs: Recommendation[], opts: { stops: number; maxLegMin: number; maxTotalMin: number; useTaste: boolean }): TasteTrail | null {
  const score = (r: Recommendation) => (opts.useTaste ? r.tasteScore.total : r.practicalScore.total);
  const pool = recs.filter((r) => r.openState.status !== "closed").sort((a, b) => score(b) - score(a));
  if (!pool.length) return null;

  const route: Recommendation[] = [pool[0]];
  let total = 0;
  while (route.length < opts.stops) {
    const prev = route[route.length - 1];
    const used = new Set(route.map((r) => r.place.category));
    const next = pool
      .filter((r) => !route.includes(r) && !used.has(r.place.category))
      .map((r) => ({ r, walk: walkMinutes(distanceM(prev.place, r.place)) }))
      .filter((x) => x.walk <= opts.maxLegMin && total + x.walk <= opts.maxTotalMin)
      .sort((a, b) => score(b.r) - 0.015 * b.walk - (score(a.r) - 0.015 * a.walk))[0];
    if (!next) break;
    total += next.walk;
    route.push(next.r);
  }
  if (route.length < 2) return null;

  const stops: TrailStop[] = route.map((r, i) => ({
    placeId: r.place.id,
    name: r.place.name,
    lat: r.place.lat,
    lon: r.place.lon,
    category: r.place.category,
    walkFromPrevMin: i === 0 ? r.walkMin : walkMinutes(distanceM(route[i - 1].place, r.place)),
    why: stopReason(r, opts.useTaste),
  }));
  const signalled = route.filter((r) => r.cultural).length;
  return {
    id: `t_${Date.now().toString(36)}`,
    title: stops.map((s) => CATEGORY_LABEL[s.category]).join(" → "),
    stops,
    totalWalkMin: stops.reduce((s, x) => s + x.walkFromPrevMin, 0),
    synthesisNote:
      opts.useTaste && signalled
        ? `${signalled} of ${stops.length} stops carry cultural signals from your interests${route.some((r) => r.cultural?.provenance === "demo") ? " (simulated in demo mode)" : " via Qloo"}. The route itself — order, variety, walking limits — is Elsewhere's synthesis.`
        : "Route built from practical fit and walking distance. Add a few interests to bring cultural signals in.",
  };
}

function stopReason(r: Recommendation, useTaste: boolean) {
  const parts: string[] = [r.summary];
  if (useTaste && r.cultural) {
    const top = [...r.cultural.contributions].sort((a, b) => b.score - a.score)[0];
    if (top) parts.push(`signal strongest from ${top.entityName}`);
    else if (r.cultural.qlooTags.length) parts.push(`tagged ${r.cultural.qlooTags.slice(0, 2).join(", ")}`);
  }
  return parts.join(" — ");
}
