import { QlooError, resolveEntities, tasteMode } from "@/lib/qloo";
import { interpretInterest } from "@/lib/qloo/interpret";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 120) return Response.json({ mode: tasteMode(), entities: [] });
  try {
    // "Add it as typed": one interest built from the user's own words.
    if (params.get("interpret")) {
      const entity = await interpretInterest(q);
      return Response.json({ mode: tasteMode(), entity, ...(entity ? {} : { error: "Couldn't connect that to places yet. Try a related word." }) });
    }
    return Response.json({ mode: tasteMode(), entities: await resolveEntities(q) });
  } catch (e) {
    const kind = e instanceof QlooError ? e.kind : "http";
    return Response.json({ mode: tasteMode(), entities: [], error: `Qloo lookup failed (${kind}).` }, { status: 502 });
  }
}
