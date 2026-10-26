import { geocode } from "@/lib/places/geocode";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 200) return Response.json({ results: [] });
  try {
    return Response.json({ results: await geocode(q) });
  } catch (e) {
    return Response.json({ results: [], error: (e as Error).message }, { status: 502 });
  }
}
