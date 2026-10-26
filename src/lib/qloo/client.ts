import { z } from "zod";
import { fetchWithTimeout, TtlCache } from "@/lib/cache";

/**
 * Thin, typed client for the Qloo API. Server-only: reads QLOO_API_KEY from the environment.
 * Docs: https://github.com/qloo/docs-public (Insights: /v2/insights, entity search: /search, auth: X-Api-Key).
 */

export class QlooError extends Error {
  constructor(message: string, readonly kind: "auth" | "rate-limit" | "timeout" | "bad-response" | "http" | "config") {
    super(message);
  }
}

const baseUrl = () => (process.env.QLOO_API_URL ?? "https://api.qloo.com").replace(/\/$/, "");
const cache = new TtlCache<unknown>(30 * 60 * 1000, 300);

async function get(path: string, params: Record<string, string | number | boolean | undefined>): Promise<unknown> {
  const key = process.env.QLOO_API_KEY;
  if (!key) throw new QlooError("QLOO_API_KEY is not set", "config");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const url = `${baseUrl()}${path}?${qs}`;
  const hit = cache.get(url);
  if (hit) return hit;

  let res: Response;
  try {
    res = await fetchWithTimeout(url, { timeoutMs: 12000, headers: { "X-Api-Key": key, Accept: "application/json" } });
  } catch (e) {
    throw new QlooError(`Qloo request failed: ${(e as Error).message}`, (e as Error).name === "AbortError" ? "timeout" : "http");
  }
  if (res.status === 401 || res.status === 403) throw new QlooError("Qloo rejected the API key", "auth");
  if (res.status === 429) throw new QlooError("Qloo rate limit reached", "rate-limit");
  if (res.status === 404) return { results: [] }; // documented "No results"
  if (!res.ok) throw new QlooError(`Qloo HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, "http");
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new QlooError("Qloo returned non-JSON", "bad-response");
  }
  cache.set(url, json);
  return json;
}

// --- Entity search -----------------------------------------------------------

const SearchHit = z
  .object({
    entity_id: z.string(),
    name: z.string(),
    types: z.array(z.string()).optional(),
    subtype: z.string().optional(),
    disambiguation: z.string().optional(),
    popularity: z.number().optional(),
    properties: z
      .object({
        short_description: z.string().optional(),
        release_year: z.number().optional(),
        image: z.object({ url: z.string() }).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type QlooSearchHit = z.infer<typeof SearchHit>;

export async function searchEntities(query: string, types: string[], take = 8): Promise<QlooSearchHit[]> {
  const json = await get("/search", { query, types: types.join(","), take });
  const parsed = z.object({ results: z.array(z.unknown()) }).safeParse(json);
  if (!parsed.success) throw new QlooError("Unexpected /search response shape", "bad-response");
  return parsed.data.results.flatMap((r) => {
    const hit = SearchHit.safeParse(r);
    return hit.success ? [hit.data] : [];
  });
}

// --- Insights: places ---------------------------------------------------------

const Tag = z.object({ id: z.string().optional(), tag_id: z.string().optional(), name: z.string().optional(), type: z.string().optional() }).passthrough();

const QlooPlace = z
  .object({
    entity_id: z.string(),
    name: z.string(),
    location: z
      .object({ lat: z.number().optional(), lon: z.number().optional(), latitude: z.number().optional(), longitude: z.number().optional() })
      .passthrough()
      .optional(),
    properties: z
      .object({
        address: z.string().optional(),
        business_rating: z.number().optional(),
        price_level: z.number().optional(),
        website: z.string().optional(),
        phone: z.string().optional(),
        description: z.string().optional(),
        is_closed: z.boolean().optional(),
        image: z.object({ url: z.string() }).passthrough().optional(),
        images: z.array(z.object({ url: z.string() }).passthrough()).optional(),
        keywords: z.array(z.object({ name: z.string() }).passthrough()).optional(),
      })
      .passthrough()
      .optional(),
    tags: z.array(Tag).optional(),
    query: z
      .object({ affinity: z.number().optional(), distance: z.number().optional(), explainability: z.unknown().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type QlooPlace = z.infer<typeof QlooPlace>;

export async function insightsPlaces(args: {
  entityIds: string[];
  lat: number;
  lon: number;
  radiusM: number;
  take?: number;
}): Promise<{ places: QlooPlace[]; warning?: string }> {
  const json = await get("/v2/insights", {
    "filter.type": "urn:entity:place",
    "signal.interests.entities": args.entityIds.join(","),
    // WKT is longitude-first.
    "filter.location": `POINT(${args.lon.toFixed(6)} ${args.lat.toFixed(6)})`,
    "filter.location.radius": Math.round(args.radiusM),
    "feature.explainability": true,
    take: args.take ?? 50,
  });
  const parsed = z
    .object({ results: z.object({ entities: z.array(z.unknown()) }).passthrough() })
    .passthrough()
    .safeParse(json);
  if (!parsed.success) throw new QlooError("Unexpected /v2/insights response shape", "bad-response");
  const places = parsed.data.results.entities.flatMap((e) => {
    const p = QlooPlace.safeParse(e);
    return p.success ? [p.data] : [];
  });
  const warning = (json as { query?: { explainability?: { warning?: string } } })?.query?.explainability?.warning;
  return { places, warning };
}

/**
 * Extracts per-input-entity contribution scores from a result's `query.explainability`.
 * The docs describe normalized 0–1 scores per input entity but don't publish the exact shape,
 * so this walks the object for `{ entity_id, score }` pairs.
 */
export function readExplainability(raw: unknown): { entityId: string; score: number }[] {
  const out: { entityId: string; score: number }[] = [];
  const visit = (v: unknown, depth: number) => {
    if (depth > 4 || v == null || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    const o = v as Record<string, unknown>;
    const id = o.entity_id ?? o.id;
    if (typeof id === "string" && typeof o.score === "number") out.push({ entityId: id, score: o.score });
    else Object.values(o).forEach((x) => visit(x, depth + 1));
  };
  visit(raw, 0);
  return out;
}
