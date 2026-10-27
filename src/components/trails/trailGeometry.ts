import type { TasteTrail, TrailLeg } from "@/types";

/** Stop colours along the route, in order (blush, lavender, peach, periwinkle, butter). */
export const TRAIL_COLORS = ["#E58FA8", "#B9A5E8", "#F6B98F", "#A9B6F0", "#F0C46A"];

export interface TrailGeometry {
  /** The whole route [lon, lat]: routed street geometry where available, a straight hop where only estimated. */
  path: [number, number][];
  /** Colour per path vertex, blending from one stop's colour to the next. */
  colors: string[];
  /** Where each stop falls along the route (0–1), for gradients. */
  stopAt: number[];
  /** Legs that are straight-line estimates, drawn differently so they don't pass for real routes. */
  estimated: [number, number][][];
  bounds: [[number, number], [number, number]];
}

const mixHex = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
};

const segLen = (a: [number, number], b: [number, number]) => {
  const k = Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * k, b[1] - a[1]);
};

export function trailGeometry(trail: TasteTrail): TrailGeometry {
  const ends: [number, number][] = [[trail.start.lon, trail.start.lat], ...trail.stops.map((s) => [s.place.lon, s.place.lat] as [number, number])];
  const legs: TrailLeg[] = trail.stops.map((s) => s.legIn);
  if (trail.legOut) {
    legs.push(trail.legOut);
    ends.push([trail.start.lon, trail.start.lat]);
  }
  const path: [number, number][] = [];
  const legOf: number[] = [];
  const estimated: [number, number][][] = [];
  legs.forEach((leg, i) => {
    const pts = leg.geometry && leg.geometry.length > 1 ? leg.geometry : [ends[i], ends[i + 1]];
    if (!leg.geometry) estimated.push([ends[i], ends[i + 1]]);
    for (const p of pts) {
      const last = path[path.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) {
        path.push(p);
        legOf.push(i);
      }
    }
  });
  // Cumulative length → each vertex's position along its leg → colour between the leg's two stop colours.
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + segLen(path[i - 1], path[i]));
  const total = cum[cum.length - 1] || 1;
  const legStart: number[] = [], legEnd: number[] = [];
  legOf.forEach((l, i) => {
    legStart[l] ??= cum[i];
    legEnd[l] = cum[i];
  });
  const colorOfStop = (i: number) => (i < 0 ? TRAIL_COLORS[0] : TRAIL_COLORS[i % TRAIL_COLORS.length]);
  const colors = path.map((_, i) => {
    const l = legOf[i];
    const span = legEnd[l] - legStart[l] || 1;
    const f = (cum[i] - legStart[l]) / span;
    // Leg l runs from stop l-1 (or the start) to stop l (or back to the start).
    const to = l < trail.stops.length ? colorOfStop(l) : TRAIL_COLORS[0];
    return mixHex(colorOfStop(l - 1), to, f);
  });
  const stopAt = trail.stops.map((_, i) => Math.min(1, (legEnd[i] ?? total) / total));
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of path) {
    w = Math.min(w, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  }
  return { path, colors, stopAt, estimated, bounds: [[w, s], [e, n]] };
}
