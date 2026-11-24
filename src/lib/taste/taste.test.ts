import { describe, expect, it } from "vitest";
import { demoProvider, DEMO_AREA } from "@/lib/places/providers/demo";
import type { CulturalEntity, Place } from "@/types";
import { normalizeKind, toProfile } from "./ai";
import { culturalEvidence, explainFit, hydrateSignals, interpretInterest, resolveEntities } from "./engine";
import { cosine, facetsFromText, mentions, sharedFacets } from "./facets";
import { lexiconByName, searchLexicon, VIBES } from "./lexicon";
import { profilePlace } from "./placeProfile";

const place = (over: Partial<Place>): Place => ({
  id: "t:1",
  providerId: "1",
  source: "osm",
  name: "Somewhere",
  lat: 40.73,
  lon: -73.99,
  category: "cafe",
  wifi: "unknown",
  outdoorSeating: "unknown",
  wheelchair: "unknown",
  tags: [],
  fetchedAt: "2026-11-24T00:00:00Z",
  ...over,
});

const signal = (name: string): CulturalEntity => {
  const e = searchLexicon(name)[0];
  return { id: e.id, name: e.name, type: e.kind, provenance: "built-in", origin: "picked" };
};

async function demoPlaces() {
  return demoProvider.searchNearby({ lat: DEMO_AREA.center.lat, lon: DEMO_AREA.center.lon, radiusM: 1500, categories: [] });
}

describe("facets", () => {
  it("reads listing words into facets and names the cue", () => {
    const r = facetsFromText("Vintage vinyl records and antiques");
    expect(r.facets.nostalgic).toBeGreaterThan(0.5);
    expect(r.facets.music).toBeGreaterThan(0.5);
    expect(r.words).toEqual(expect.arrayContaining(["vintage", "records"]));
  });

  it("matches keywords as whole words only", () => {
    expect(mentions("Joe's Jazz Bar", "bar")).toBe(true);
    expect(mentions("Barber Shop", "bar")).toBe(false);
    expect(mentions("Rare Books", "book")).toBe(true);
  });

  it("measures overlap and names shared facets strongest first", () => {
    expect(cosine({ quiet: 1 }, { quiet: 1 })).toBeCloseTo(1);
    expect(cosine({ quiet: 1 }, { lively: 1 })).toBe(0);
    expect(sharedFacets({ literary: 1, quiet: 0.5 }, { literary: 0.9, quiet: 0.9, social: 1 })).toEqual(["literary", "quiet"]);
  });
});

describe("place profiles", () => {
  it("starts from the kind of place and adds listed details", () => {
    const p = profilePlace(place({ name: "Spoonbill Used Books", category: "bookstore", outdoorSeating: "yes" }));
    expect(p.facets.literary).toBeGreaterThan(0.9);
    expect(p.facets.nostalgic).toBeGreaterThan(0.3);
    expect(p.cues).toContain("outdoor seating");
  });

  it("marks loved-but-little-known places as offbeat and discounts chains", () => {
    expect(profilePlace(place({ rating: 4.8, ratingCount: 60 })).facets.offbeat).toBeGreaterThan(0.4);
    const chain = profilePlace(place({ name: "Roasters", tags: ["chain"] }));
    const indie = profilePlace(place({ name: "Roasters" }));
    expect(chain.facets.craft!).toBeLessThan(indie.facets.craft!);
  });
});

describe("lexicon", () => {
  it("finds interests by name and alias", () => {
    expect(searchLexicon("boba")[0].name).toBe("Bubble tea");
    expect(lexiconByName("murakami")?.id).toBe("lx:haruki-murakami");
    expect(searchLexicon("x")).toEqual([]);
  });

  it("keeps the vibe card ids stable (they're stored in browsers)", () => {
    expect(VIBES.map((v) => v.id)).toContain("lx:vibe:hidden-gem");
    for (const v of VIBES) expect(Object.keys(v.facets).length).toBeGreaterThan(0);
  });
});

describe("Claude output handling", () => {
  it("normalizes unexpected kinds instead of failing", () => {
    expect(normalizeKind("Film director")).toBe("film");
    expect(normalizeKind("musician")).toBe("artist");
    expect(normalizeKind("aesthetic")).toBe("vibe");
    expect(normalizeKind("something else")).toBe("interest");
  });

  it("clamps weights and drops unknown facets and categories", () => {
    const p = toProfile({ facets: [{ facet: "quiet", weight: 3 }, { facet: "made-up", weight: 1 }], keywords: ["  Jazz ", "x"], categories: ["cafe", "spaceport"] });
    expect(p.facets).toEqual({ quiet: 1 });
    expect(p.keywords).toEqual(["jazz"]);
    expect(p.categories).toEqual(["cafe"]);
  });
});

describe("interests without Claude", () => {
  it("resolves built-in names", async () => {
    const hits = await resolveEntities("wong kar");
    expect(hits[0].name).toBe("Wong Kar-wai");
    expect(hits[0].profile?.facets.cinematic).toBe(1);
  });

  it("reads a typed interest from its words, or declines", async () => {
    const e = await interpretInterest("rainy day jazz records");
    expect(e?.provenance).toBe("built-in");
    expect(e?.profile?.facets.music).toBeGreaterThan(0.5);
    expect(await interpretInterest("qwertyuiop")).toBeNull();
  });

  it("profiles vibe cards and interests saved in the Qloo era by name", async () => {
    const old = { id: "urn:entity:person:abc", name: "Haruki Murakami", type: "urn:entity:person", provenance: "built-in", origin: "saved" } as CulturalEntity;
    const [vibe, author] = await hydrateSignals([{ id: "lx:vibe:cozy", name: "Cozy", type: "vibe", provenance: "built-in", origin: "picked" }, old]);
    expect(vibe.profile?.facets.cozy).toBe(1);
    expect(author.id).toBe(old.id);
    expect(author.origin).toBe("saved");
    expect(author.profile?.facets.literary).toBe(1);
  });
});

describe("taste matching on the OpenStreetMap snapshot", () => {
  it("connects an author to bookstores, with a readable reason", async () => {
    const places = await demoPlaces();
    const r = await culturalEvidence({ signals: [signal("murakami")], inventory: places, readWithClaude: false });
    expect(r.status).toBe("ok");
    const top = [...r.evidence].sort((a, b) => b[1].affinity! - a[1].affinity!).slice(0, 3);
    for (const [id, ev] of top) {
      expect(places.find((p) => p.id === id)?.category).toBe("bookstore");
      expect(ev.facets).toContain("bookish");
      expect(ev.note).toMatch(/Haruki Murakami/);
      expect(ev.listingRead).toBe("rules");
    }
  });

  it("is selective: most places are not taste matches", async () => {
    const places = await demoPlaces();
    const r = await culturalEvidence({ signals: [signal("vintage")], inventory: places, readWithClaude: false });
    expect(r.evidence.size).toBeGreaterThan(0);
    expect(r.evidence.size).toBeLessThan(places.length * 0.1);
  });

  it("splits credit between interests and keeps shares summing to one", async () => {
    const places = await demoPlaces();
    const r = await culturalEvidence({ signals: [signal("specialty coffee"), signal("hiking")], inventory: places, readWithClaude: false });
    for (const ev of r.evidence.values()) {
      const sum = ev.contributions.reduce((s, c) => s + c.score, 0);
      expect(sum).toBeGreaterThan(0.98);
      expect(sum).toBeLessThan(1.02);
    }
    const leaders = new Set([...r.evidence.values()].map((ev) => [...ev.contributions].sort((a, b) => b.score - a.score)[0].entityName));
    expect(leaders).toEqual(new Set(["Specialty coffee", "Hiking"]));
  });

  it("returns no evidence without interests", async () => {
    const r = await culturalEvidence({ signals: [], inventory: await demoPlaces(), readWithClaude: false });
    expect(r.status).toBe("no-signals");
    expect(r.evidence.size).toBe(0);
  });
});

describe("explanations", () => {
  it("names shared facets and listing words, and phrases vibes as picks", () => {
    expect(explainFit({ name: "Haruki Murakami", shared: ["bookish", "quiet"], keywords: ["jazz"] })).toBe(
      `Shares Haruki Murakami's bookish and quiet side; the listing mentions "jazz".`,
    );
    expect(explainFit({ name: "Cozy", kind: "vibe", shared: ["cozy"], keywords: [] })).toBe("Fits your cozy pick: cozy.");
  });
});
