import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { runAgent } from "@/lib/agent/run";
import { looksLikeTrail } from "@/lib/trails/validate";
import { AgentSessionSchema, CulturalEntitySchema, type AgentEvent, type SearchResult } from "@/types";

export const maxDuration = 120;

const Body = z.object({
  message: z.string().trim().min(1).max(2000),
  // The client stores the transcript verbatim and resends it; we only bound its size.
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.unknown() })).max(160),
  session: AgentSessionSchema,
  result: z.unknown().nullable(),
  trail: z.unknown().nullable().default(null),
  knownEntities: z.array(CulturalEntitySchema).max(60),
});

function looksLikeResult(v: unknown): v is SearchResult {
  return !!v && typeof v === "object" && Array.isArray((v as SearchResult).recommendations);
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { message, history, session, result, trail, knownEntities } = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runAgent({
          history: history as Anthropic.Beta.BetaMessageParam[],
          userText: message,
          session,
          result: looksLikeResult(result) ? result : null,
          trail: looksLikeTrail(trail) ? trail : null,
          knownEntities,
          send,
          signal: req.signal,
        });
      } catch (e) {
        let msg = "The guide hit a problem. Your search and map are still here. Try again.";
        let recoverable = true;
        const noCredentials =
          !(e instanceof Anthropic.APIError) && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN;
        if (noCredentials || e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
          msg = "The guide isn't configured (no valid ANTHROPIC_API_KEY). You can still search with the quick filters.";
          recoverable = false;
        } else if (e instanceof Anthropic.RateLimitError) {
          msg = "The guide is busy right now. Give it a moment and try again.";
        } else if (e instanceof Anthropic.BadRequestError) {
          msg = "That conversation got into a state the guide couldn't continue. Start a new chat to keep going.";
        } else if (e instanceof Anthropic.APIConnectionError) {
          msg = "Couldn't reach the guide. Check your connection and try again.";
        } else if (e instanceof Anthropic.APIError) {
          msg = `The guide is having trouble (${e.status ?? "network"}). Try again in a moment.`;
        } else if ((e as Error)?.name === "AbortError") {
          controller.close();
          return;
        }
        console.error("[chat]", e);
        send({ type: "error", message: msg, recoverable });
      }
      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
