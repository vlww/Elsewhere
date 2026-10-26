import { connection } from "next/server";
import { DEMO_AREA, placesProviderSummary } from "@/lib/places";
import { tasteMode } from "@/lib/qloo";
import { AGENT_MODEL } from "@/lib/agent/run";

export async function GET() {
  await connection();
  return Response.json({
    taste: tasteMode(),
    places: placesProviderSummary(),
    agent: {
      model: AGENT_MODEL,
      configured: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    },
    demoArea: DEMO_AREA,
  });
}
