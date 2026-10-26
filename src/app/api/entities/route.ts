import { QlooError, resolveEntities, tasteMode } from "@/lib/qloo";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 120) return Response.json({ mode: tasteMode(), entities: [] });
  try {
    return Response.json({ mode: tasteMode(), entities: await resolveEntities(q) });
  } catch (e) {
    const kind = e instanceof QlooError ? e.kind : "http";
    return Response.json({ mode: tasteMode(), entities: [], error: `Qloo lookup failed (${kind}).` }, { status: 502 });
  }
}
