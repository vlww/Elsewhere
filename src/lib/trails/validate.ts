import { z } from "zod";
import { PlaceSchema, TrailSpecSchema, type TasteTrail } from "@/types";

/**
 * Trails round-trip through the client (it holds the live itinerary). Before revising one, check the
 * parts the planner relies on: a valid spec and stops with real, in-range coordinates.
 */
const Coord = { lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) };
const TrailShape = z.object({
  id: z.string(),
  spec: TrailSpecSchema,
  start: z.object({ name: z.string(), ...Coord }),
  stops: z
    .array(
      z.object({
        placeId: z.string(),
        slot: z.number().int().min(0),
        place: PlaceSchema,
        rec: z.object({ place: PlaceSchema, tasteRank: z.number(), practicalRank: z.number() }).passthrough(),
      }),
    )
    .min(1)
    .max(6),
});

export function looksLikeTrail(v: unknown): v is TasteTrail {
  return TrailShape.safeParse(v).success;
}
