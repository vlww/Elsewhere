import { fetchWithTimeout } from "@/lib/cache";

/** Proxies Google Places photos so the API key stays on the server. */
export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name") ?? "";
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !/^places\/[\w-]+\/photos\/[\w-]+$/.test(name)) return new Response("Not found", { status: 404 });
  const res = await fetchWithTimeout(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=900&key=${key}`, { timeoutMs: 10000 });
  if (!res.ok || !res.body) return new Response("Not found", { status: 404 });
  return new Response(res.body, {
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg", "Cache-Control": "public, max-age=86400" },
  });
}
