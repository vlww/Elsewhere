import sharp from "sharp";
import { z } from "zod";
import { fetchWithTimeout, TtlCache } from "@/lib/cache";
import { dominantHue, pastelFromHue, type PlaceColor } from "@/lib/taste/placeColor";

/**
 * Dominant photo colours for Taste Layer highlights. Only fetches from the image sources the app itself
 * uses (Google Places photos via our proxy, Qloo's image CDN, Wikimedia Commons), never arbitrary URLs.
 */

const Body = z.object({
  items: z.array(z.object({ id: z.string().max(200), imageUrl: z.string().max(2000) })).max(24),
});

const cache = new TtlCache<PlaceColor | null>(6 * 60 * 60 * 1000, 2000);

function sourceUrl(imageUrl: string): string | null {
  if (imageUrl.startsWith("/api/photo?")) {
    const name = new URLSearchParams(imageUrl.slice("/api/photo?".length)).get("name") ?? "";
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key || !/^places\/[\w-]+\/photos\/[\w-]+$/.test(name)) return null;
    return `https://places.googleapis.com/v1/${name}/media?maxWidthPx=200&key=${key}`;
  }
  try {
    const u = new URL(imageUrl);
    if (u.protocol !== "https:") return null;
    return ["images.qloo.com", "upload.wikimedia.org", "commons.wikimedia.org"].includes(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

async function colorOf(imageUrl: string): Promise<PlaceColor | null> {
  const hit = cache.get(imageUrl);
  if (hit !== undefined) return hit;
  const url = sourceUrl(imageUrl);
  if (!url) return null;
  let color: PlaceColor | null = null;
  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs: 6000,
      headers: { "User-Agent": process.env.HTTP_USER_AGENT ?? "Elsewhere/0.1" },
    });
    if (res.ok) {
      const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
        .resize(48, 48, { fit: "cover" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const d = dominantHue(data, info.channels);
      if (d) color = pastelFromHue(d.hue, d.sat);
    }
  } catch (e) {
    console.warn("[place-colors]", (e as Error).message);
  }
  cache.set(imageUrl, color);
  return color;
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const pairs = await Promise.all(parsed.data.items.map(async (it) => [it.id, await colorOf(it.imageUrl)] as const));
  return Response.json({ colors: Object.fromEntries(pairs.filter(([, c]) => c)) });
}
