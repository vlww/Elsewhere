import { describe, expect, it } from "vitest";
import { namesMatch } from "@/lib/places/match";
import { synonymsFor } from "@/lib/places/synonyms";
import { SearchConstraintsSchema, type CulturalEvidence, type Place } from "@/types";
import { rank } from "./rank";

const at = { lat: 40.73, lon: -73.99, label: "Test", source: "demo" as const };
const place = (id: string, over: Partial<Place> = {}): Place => ({
  id,
  providerId: id,
  source: "osm",
  name: id,
  lat: at.lat,
  lon: at.lon,
  category: "cafe",
  wifi: "unknown",
  outdoorSeating: "unknown",
  wheelchair: "unknown",
  tags: [],
  fetchedAt: "2026-11-24T00:00:00Z",
  ...over,
});
const evidence = (affinity: number): CulturalEvidence => ({
  provenance: "built-in",
  affinity,
  contributions: [{ entityId: "lx:x", entityName: "X", score: 1 }],
  match: "profile",
  facets: ["quiet"],
  keywords: [],
  listingRead: "rules",
});

describe("rank", () => {
  const constraints = SearchConstraintsSchema.parse({ activity: "read" });
  const now = new Date("2026-11-24T15:00:00");

  it("lets taste move a slightly farther match ahead in the taste lens only", () => {
    const near = place("near");
    const match = place("match", { lat: at.lat + 0.004 });
    const { recommendations } = rank({ candidates: [{ place: near }, { place: match, cultural: evidence(0.8) }], location: at, constraints, feedback: [], now });
    const byId = new Map(recommendations.map((r) => [r.place.id, r]));
    expect(byId.get("near")!.practicalRank).toBe(1);
    expect(byId.get("match")!.tasteRank).toBe(1);
    expect(byId.get("near")!.tasteScore.cultural).toBe(0);
  });

  it("filters hard constraints and says why", () => {
    const pricey = place("pricey", { priceLevel: 4 });
    const { recommendations, filteredOut } = rank({
      candidates: [{ place: pricey }],
      location: at,
      constraints: { ...constraints, maxPriceLevel: 2 },
      feedback: [],
      now,
    });
    expect(recommendations).toHaveLength(0);
    expect(filteredOut[0].reason).toMatch(/budget/);
  });
});

describe("venue matching", () => {
  it("treats provider variants of one name as the same venue, but not generic names", () => {
    expect(namesMatch("Irving Farm Coffee Roasters", "Irving Farm Coffee Roasters NYC")).toBe(true);
    expect(namesMatch("Joe Coffee Company", "Joe Coffee")).toBe(true);
    expect(namesMatch("Books", "Mercer Street Books")).toBe(false);
  });

  it("knows other names for common asks", () => {
    expect(synonymsFor("Boba")).toContain("bubble tea");
    expect(synonymsFor("anything")).toEqual([]);
  });
});
