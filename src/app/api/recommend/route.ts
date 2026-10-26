import { z } from "zod";
import { ProviderError } from "@/lib/places";
import { runSearch } from "@/lib/recommendations/pipeline";
import { AgentSessionSchema, CulturalEntitySchema, LocationSchema, SearchConstraintsSchema } from "@/types";

const Body = z.object({
  location: LocationSchema,
  constraints: SearchConstraintsSchema,
  tasteSignals: z.array(CulturalEntitySchema).max(12),
  feedback: AgentSessionSchema.shape.feedback,
  clientNow: z.string(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  try {
    return Response.json(await runSearch(parsed.data));
  } catch (e) {
    if (e instanceof ProviderError) return Response.json({ error: e.userMessage, kind: e.kind }, { status: 503 });
    console.error("[recommend]", e);
    return Response.json({ error: "Search failed unexpectedly." }, { status: 500 });
  }
}
