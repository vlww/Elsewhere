import { z } from "zod";
import { fetchWithTimeout, TtlCache } from "@/lib/cache";
import { distanceM } from "@/lib/geo";

/**
 * Routing for Taste Trails: OSRM (by default the FOSSGIS community servers at routing.openstreetmap.de,
 * which publish separate foot, bike and car profiles). Provides a duration matrix for ordering stops and
 * per-leg distance, duration and street geometry for the chosen order.
 *
 * Transit isn't supported by OSRM; callers get walking legs and a note saying so. When routing is
 * unreachable, legs fall back to a labelled straight-line estimate with no geometry — never a fake route.
 */

export const TRAVEL_MODES = ["walking", "cycling", "driving", "transit"] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];
type Pt = { lat: number; lon: number };

export interface Leg {
  distanceM: number;
  durationMin: number;
  /** [lon, lat] along the streets; absent for estimates. */
  geometry?: [number, number][];
  source: "osrm" | "estimate";
}

export interface RoutingInfo {
  provider: string;
  /** The mode routes were actually computed for (transit → walking). */
  effectiveMode: Exclude<TravelMode, "transit">;
  live: boolean;
  note?: string;
}

const PROFILE: Record<Exclude<TravelMode, "transit">, string> = { walking: "foot", cycling: "bike", driving: "car" };
/** Straight-line fallback speeds (m/min) with a street-grid detour factor. */
const EST_SPEED: Record<Exclude<TravelMode, "transit">, number> = { walking: 80, cycling: 230, driving: 330 };
const DETOUR = 1.3;

function baseUrl(mode: Exclude<TravelMode, "transit">) {
  const custom = process.env.OSRM_URL; // e.g. your own OSRM with a single profile
  return custom ? custom.replace(/\/$/, "") : `https://routing.openstreetmap.de/routed-${PROFILE[mode]}`;
}
const providerLabel = () => (process.env.OSRM_URL ? "OSRM" : "OSRM (FOSSGIS, OpenStreetMap data)");

export function effectiveMode(mode: TravelMode): Exclude<TravelMode, "transit"> {
  return mode === "transit" ? "walking" : mode;
}

const coordStr = (pts: Pt[]) => pts.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
const headers = () => ({ "User-Agent": process.env.HTTP_USER_AGENT ?? "Elsewhere/0.1", Accept: "application/json" });

const tableCache = new TtlCache<number[][]>(30 * 60 * 1000, 300);
const routeCache = new TtlCache<Leg[]>(30 * 60 * 1000, 300);

const TableResponse = z.object({ code: z.literal("Ok"), durations: z.array(z.array(z.number().nullable())) });
const RouteResponse = z.object({
  code: z.literal("Ok"),
  routes: z
    .array(
      z.object({
        legs: z.array(
          z.object({
            distance: z.number(),
            duration: z.number(),
            steps: z.array(z.object({ geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])) }) })),
          }),
        ),
      }),
    )
    .min(1),
});

function estimateMin(a: Pt, b: Pt, mode: Exclude<TravelMode, "transit">) {
  return (distanceM(a, b) * DETOUR) / EST_SPEED[mode];
}

/** Travel minutes between every pair of points (rows = from). Falls back to estimates. */
export async function durationMatrix(pts: Pt[], mode: TravelMode): Promise<{ minutes: number[][]; live: boolean }> {
  const m = effectiveMode(mode);
  const estimate = () => pts.map((a) => pts.map((b) => estimateMin(a, b, m)));
  if (pts.length < 2) return { minutes: estimate(), live: false };
  const key = `${m}|${coordStr(pts)}`;
  const hit = tableCache.get(key);
  if (hit) return { minutes: hit, live: true };
  try {
    const res = await fetchWithTimeout(`${baseUrl(m)}/table/v1/driving/${coordStr(pts)}?annotations=duration`, { headers: headers(), timeoutMs: 8000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = TableResponse.safeParse(await res.json());
    if (!parsed.success) throw new Error("bad table response");
    const est = estimate();
    const minutes = parsed.data.durations.map((row, i) => row.map((s, j) => (s == null ? est[i][j] : s / 60)));
    tableCache.set(key, minutes);
    return { minutes, live: true };
  } catch (e) {
    console.warn("[routing] table", (e as Error).message);
    return { minutes: estimate(), live: false };
  }
}

/** Legs through the points in order, with street geometry. Falls back to straight-line estimates. */
export async function routeLegs(pts: Pt[], mode: TravelMode): Promise<{ legs: Leg[]; info: RoutingInfo }> {
  const m = effectiveMode(mode);
  const transitNote = mode === "transit" ? "Transit routing isn't available, so routes and times are for walking." : undefined;
  const estimate = (): Leg[] =>
    pts.slice(1).map((b, i) => ({
      distanceM: Math.round(distanceM(pts[i], b) * DETOUR),
      durationMin: Math.max(1, Math.round(estimateMin(pts[i], b, m))),
      source: "estimate" as const,
    }));
  if (pts.length < 2) return { legs: [], info: { provider: providerLabel(), effectiveMode: m, live: false, note: transitNote } };
  const key = `${m}|${coordStr(pts)}`;
  const hit = routeCache.get(key);
  if (hit) return { legs: hit, info: { provider: providerLabel(), effectiveMode: m, live: true, note: transitNote } };
  try {
    const res = await fetchWithTimeout(
      `${baseUrl(m)}/route/v1/driving/${coordStr(pts)}?overview=false&steps=true&geometries=geojson&continue_straight=false`,
      { headers: headers(), timeoutMs: 10000 },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = RouteResponse.safeParse(await res.json());
    if (!parsed.success) throw new Error("bad route response");
    const legs: Leg[] = parsed.data.routes[0].legs.map((l) => {
      const geometry: [number, number][] = [];
      for (const st of l.steps)
        for (const c of st.geometry.coordinates) {
          const last = geometry[geometry.length - 1];
          if (!last || last[0] !== c[0] || last[1] !== c[1]) geometry.push([c[0], c[1]]);
        }
      return { distanceM: Math.round(l.distance), durationMin: Math.max(1, Math.round(l.duration / 60)), geometry, source: "osrm" as const };
    });
    if (legs.length !== pts.length - 1) throw new Error("leg count mismatch");
    routeCache.set(key, legs);
    return { legs, info: { provider: providerLabel(), effectiveMode: m, live: true, note: transitNote } };
  } catch (e) {
    console.warn("[routing] route", (e as Error).message);
    return {
      legs: estimate(),
      info: {
        provider: providerLabel(),
        effectiveMode: m,
        live: false,
        note: [transitNote, "Routing was unavailable, so travel times are straight-line estimates and the map shows direct lines."]
          .filter(Boolean)
          .join(" "),
      },
    };
  }
}
