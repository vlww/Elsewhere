import { connection } from "next/server";
import { DEMO_AREA, placesProviderSummary } from "@/lib/places";
import { tasteMode } from "@/lib/taste/engine";
import { TASTE_MODEL } from "@/lib/taste/ai";
import { AGENT_MODEL } from "@/lib/agent/run";

export async function GET() {
  await connection();
  return Response.json({
    taste: tasteMode(),
    tasteModel: tasteMode() === "ai" ? TASTE_MODEL : undefined,
    places: placesProviderSummary(),
    agent: {
      model: AGENT_MODEL,
      configured: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    },
    demoArea: DEMO_AREA,
  });
}
