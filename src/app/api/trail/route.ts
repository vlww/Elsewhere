import { z } from "zod";
import { ProviderError } from "@/lib/places";
import { planTrail, reviseTrail, TrailEditSchema, TrailError, TrailPatchSchema } from "@/lib/trails/plan";
import { looksLikeTrail } from "@/lib/trails/validate";
import { AgentSessionSchema, CulturalEntitySchema, LocationSchema, TrailSpecSchema } from "@/types";

export const maxDuration = 60;

const Common = {
  location: LocationSchema,
  tasteSignals: z.array(CulturalEntitySchema).max(12),
  feedback: AgentSessionSchema.shape.feedback,
  clientNow: z.string(),
};
const Body = z.discriminatedUnion("op", [
  z.object({ op: z.literal("plan"), spec: TrailSpecSchema.partial(), ...Common }),
  z.object({
    op: z.literal("revise"),
    trail: z.unknown(),
    edits: z.array(TrailEditSchema).max(6).default([]),
    patch: TrailPatchSchema.default({}),
    ...Common,
  }),
]);

/** Plans or revises a Taste Trail (used by the trail panel's quick actions; the guide calls the same functions). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const b = parsed.data;
  const ctx = { location: b.location, tasteSignals: b.tasteSignals, feedback: b.feedback, clientNow: b.clientNow };
  try {
    if (b.op === "plan") return Response.json({ trail: await planTrail(b.spec, ctx) });
    if (!looksLikeTrail(b.trail)) return Response.json({ error: "That trail couldn't be read. Start a new one." }, { status: 400 });
    return Response.json({ trail: await reviseTrail(b.trail, b.edits, b.patch, ctx) });
  } catch (e) {
    if (e instanceof TrailError) return Response.json({ error: e.message }, { status: 422 });
    if (e instanceof ProviderError) return Response.json({ error: e.userMessage }, { status: 503 });
    console.error("[trail]", e);
    return Response.json({ error: "Planning the trail failed unexpectedly." }, { status: 500 });
  }
}
