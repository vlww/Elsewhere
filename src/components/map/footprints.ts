import type * as maplibregl from "maplibre-gl";

/** A real OSM building outline from the basemap's vector tiles. */
export interface Footprint {
  ring: [number, number][]; // [lon, lat], closed
  heightM: number;
}

type Ring = [number, number][];

function inRing(lon: number, lat: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Planar area in squared degrees (scaled for longitude): only used to compare candidates. */
function area(ring: Ring, cosLat: number) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * cosLat * (ring[j][1] + ring[i][1]);
  return Math.abs(a / 2);
}

function outerRings(g: GeoJSON.Geometry): Ring[] {
  if (g.type === "Polygon") return [g.coordinates[0] as Ring];
  if (g.type === "MultiPolygon") return g.coordinates.map((p) => p[0] as Ring);
  return [];
}

/**
 * Finds the building each point sits in, from tiles already loaded for the current view.
 * Picks the smallest containing outline (the specific building, not the block-sized complex around it),
 * else the nearest outline within ~18 m (POIs are often mapped on the pavement in front). Returns null
 * when the basemap has no building there, so callers can fall back to a clearly illustrative shape.
 */
export function findFootprints(map: maplibregl.Map, points: { placeId: string; lat: number; lon: number }[]): Map<string, Footprint | null> {
  const out = new Map<string, Footprint | null>();
  if (!points.length || map.getZoom() < 13) return out;
  let features: GeoJSON.Feature[];
  try {
    features = map.querySourceFeatures("openmaptiles", { sourceLayer: "building" });
  } catch {
    return out;
  }
  const lat0 = points[0].lat;
  const cosLat = Math.cos((lat0 * Math.PI) / 180);
  const near = 0.00017; // ≈ 18 m of latitude
  const cands = features.flatMap((f) =>
    outerRings(f.geometry).map((ring) => {
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      for (const [x, y] of ring) {
        if (x < w) w = x;
        if (x > e) e = x;
        if (y < s) s = y;
        if (y > n) n = y;
      }
      const h = Number(f.properties?.render_height);
      return { ring, w, s, e, n, area: area(ring, cosLat), heightM: Number.isFinite(h) && h > 0 ? h : 10 };
    }),
  );
  for (const p of points) {
    let best: (typeof cands)[number] | null = null;
    let nearest: (typeof cands)[number] | null = null;
    let nearestD = Infinity;
    for (const c of cands) {
      if (p.lon < c.w - near / cosLat || p.lon > c.e + near / cosLat || p.lat < c.s - near || p.lat > c.n + near) continue;
      if (inRing(p.lon, p.lat, c.ring)) {
        if (!best || c.area < best.area) best = c;
      } else {
        const d = Math.hypot((Math.max(c.w - p.lon, 0, p.lon - c.e)) * cosLat, Math.max(c.s - p.lat, 0, p.lat - c.n));
        if (d < nearestD) {
          nearestD = d;
          nearest = c;
        }
      }
    }
    const pick = best ?? (nearestD < near ? nearest : null);
    // Skip giant outlines (a whole campus) — tinting them would overstate the match.
    out.set(p.placeId, pick && pick.area < 2e-6 /* ≈ 25,000 m² */ ?{ ring: pick.ring, heightM: pick.heightM } : null);
  }
  return out;
}
