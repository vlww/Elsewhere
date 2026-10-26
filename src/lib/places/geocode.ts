import { z } from "zod";
import { fetchWithTimeout, TtlCache } from "@/lib/cache";
import type { UserLocation } from "@/types";
import { DEMO_AREA } from "./providers/demo";

const cache = new TtlCache<UserLocation[]>(24 * 60 * 60 * 1000, 500);
const Hit = z.object({ lat: z.string(), lon: z.string(), display_name: z.string(), name: z.string().optional() });

/** Forward geocoding via OSM Nominatim (usage policy: identify the app, ≤1 req/s, cache results). */
export async function geocode(query: string): Promise<UserLocation[]> {
  const q = query.trim();
  if (/^(demo|demo area|washington square( park)?|nyu)$/i.test(q)) {
    return [{ ...DEMO_AREA.center, label: "Washington Square, New York", source: "demo" }];
  }
  const hit = cache.get(q.toLowerCase());
  if (hit) return hit;
  const url = `${process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org"}/search?${new URLSearchParams({
    q,
    format: "jsonv2",
    limit: "5",
    addressdetails: "0",
  })}`;
  const res = await fetchWithTimeout(url, {
    timeoutMs: 8000,
    headers: { "User-Agent": process.env.HTTP_USER_AGENT ?? "Elsewhere/0.1 (local development)", "Accept-Language": "en" },
  });
  if (!res.ok) throw new Error(`Geocoding failed (HTTP ${res.status})`);
  const parsed = z.array(Hit).safeParse(await res.json());
  if (!parsed.success) throw new Error("Geocoding returned an unexpected response");
  const out = parsed.data.map((h) => ({
    lat: Number(h.lat),
    lon: Number(h.lon),
    label: h.display_name.split(",").slice(0, 3).join(",").trim(),
    source: "search" as const,
  }));
  cache.set(q.toLowerCase(), out);
  return out;
}
