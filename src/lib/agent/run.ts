import Anthropic from "@anthropic-ai/sdk";
import type { AgentEvent, AgentSession, CulturalEntity, SearchResult } from "@/types";
import { CATEGORY_LABEL } from "@/lib/recommendations/activities";
import { tasteMode } from "@/lib/qloo";
import { placesProviderSummary } from "@/lib/places";
import { SYSTEM_PROMPT } from "./prompt";
import { executeTool, TOOL_STATUS, TOOLS, type ToolContext } from "./tools";

export const AGENT_MODEL = process.env.ELSEWHERE_MODEL ?? "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 8;

type Msg = Anthropic.Beta.BetaMessageParam;

/** Per-turn session snapshot. Appended to the user turn (never edits earlier history). */
function sessionBlock(session: AgentSession, result: SearchResult | null) {
  const lens = session.lensMode;
  const visible = result
    ? [...result.recommendations]
        .sort((a, b) => (lens === "taste" ? a.tasteRank - b.tasteRank : a.practicalRank - b.practicalRank))
        .slice(0, 8)
        .map((r, i) => `${i + 1}. ${r.place.name} [${r.place.id}] ${CATEGORY_LABEL[r.place.category]}, ${r.walkMin} min`)
    : [];
  return [
    "<session>",
    JSON.stringify({
      local_time: session.clientNow,
      location: session.location ? { label: session.location.label, source: session.location.source } : null,
      constraints: session.constraints,
      interests: session.tasteSignals.map((e) => ({ id: e.id, name: e.name, origin: e.origin })),
      taste_mode: tasteMode(),
      places_data: placesProviderSummary()[0],
      lens,
      selected_place_id: session.selectedPlaceId,
      saved_count: session.savedPlaceIds.length,
      recent_feedback: session.feedback.slice(-6).map((f) => `${f.placeName}: ${f.reason}`),
    }),
    visible.length ? `Cards in view (${lens} order):\n${visible.join("\n")}` : "No results on screen yet.",
    "</session>",
  ].join("\n");
}

export async function runAgent(args: {
  history: Msg[];
  userText: string;
  session: AgentSession;
  result: SearchResult | null;
  knownEntities: CulturalEntity[];
  send: (e: AgentEvent) => void;
  signal: AbortSignal;
}) {
  const client = new Anthropic();
  const messages: Msg[] = [
    ...args.history,
    { role: "user", content: `${args.userText}\n\n${sessionBlock(args.session, args.result)}` },
  ];
  const ctx: ToolContext = {
    session: args.session,
    result: args.result,
    knownEntities: [...args.knownEntities],
    emit: (action) => args.send({ type: "action", action }),
    status: (label) => args.send({ type: "status", label }),
  };

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const stream = client.beta.messages.stream(
      {
        model: AGENT_MODEL,
        max_tokens: 32000,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        // Last round: answer from what we have instead of calling more tools.
        ...(round === MAX_TOOL_ROUNDS && { tool_choice: { type: "none" as const } }),
        messages,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { signal: args.signal },
    );
    let wroteText = false;
    stream.on("text", (delta) => {
      wroteText = true;
      args.send({ type: "text", delta });
    });

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
    } catch (e) {
      if (e instanceof Anthropic.APIError) throw e;
      // Tool input JSON couldn't be parsed: re-issue the turn once.
      if (round < MAX_TOOL_ROUNDS) continue;
      throw e;
    }

    if (message.stop_reason === "refusal") {
      args.send({ type: "error", message: "I can't help with that one. Try asking about places nearby.", recoverable: true });
      break;
    }
    messages.push({ role: "assistant", content: message.content as Anthropic.Beta.BetaContentBlockParam[] });
    if (message.stop_reason === "pause_turn") continue;
    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (message.stop_reason !== "tool_use" || !toolUses.length) break;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const t of toolUses) {
      const label = TOOL_STATUS[t.name as keyof typeof TOOL_STATUS];
      if (label) args.send({ type: "status", label });
      const out = await executeTool(t.name, t.input, ctx);
      const isError = typeof out === "object" && out !== null && "error" in out;
      results.push({ type: "tool_result", tool_use_id: t.id, content: JSON.stringify(out), is_error: isError || undefined });
    }
    messages.push({ role: "user", content: results });
    if (wroteText) args.send({ type: "text", delta: "\n\n" });
  }

  // Return the full transcript (append-only) so the client can resend it next turn unchanged.
  args.send({ type: "history", messages });
}
