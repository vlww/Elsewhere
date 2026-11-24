import type { Place, PlaceCategory } from "@/types";
import { bump, facetsFromText, type FacetVec } from "./facets";

/**
 * A place's taste profile from what its listing actually says: its kind, name, tags, description,
 * amenities and price. Deterministic and explainable: every facet traces back to a listed fact.
 * (When Claude is configured, `readListings` can add a second reading of the same listing text.)
 */

/** What a kind of place usually offers. A starting point that listing details then refine. */
const CATEGORY_BASE: Record<PlaceCategory, FacetVec> = {
  cafe: { craft: 0.4, social: 0.5, cozy: 0.4 },
  tea: { quiet: 0.8, design: 0.5, craft: 0.6, cozy: 0.4 },
  library: { quiet: 1, literary: 0.9, heritage: 0.2 },
  bookstore: { literary: 1, quiet: 0.5, cozy: 0.4, nostalgic: 0.3 },
  park: { nature: 1, social: 0.4, quiet: 0.3 },
  garden: { nature: 1, quiet: 0.8, design: 0.3, romantic: 0.3 },
  gallery: { artsy: 1, design: 0.6, quiet: 0.4 },
  museum: { heritage: 0.8, artsy: 0.6, quiet: 0.4 },
  arts_centre: { artsy: 0.8, social: 0.5, music: 0.3, offbeat: 0.3 },
  cinema: { cinematic: 1, nostalgic: 0.4, romantic: 0.2 },
  music: { music: 1, nostalgic: 0.6, offbeat: 0.3 },
  coworking: { design: 0.4, social: 0.3, quiet: 0.3 },
  plaza: { social: 0.7, lively: 0.4, heritage: 0.2 },
  community: { social: 0.8, artsy: 0.2, offbeat: 0.2 },
  food: { foodie: 0.8, social: 0.6 },
  other: { offbeat: 0.2 },
};

export interface PlaceProfile {
  facets: FacetVec;
  /** Listing words that shaped the profile ("vintage", "records"), for explanations. */
  cues: string[];
  /** Everything searchable about the listing, lower-cased, for interest keywords. */
  text: string;
}

export function listingText(p: Place) {
  return [p.name, p.subcategory?.replace(/_/g, " "), p.description, ...p.tags].filter(Boolean).join(" · ");
}

export function profilePlace(p: Place): PlaceProfile {
  const facets: FacetVec = { ...CATEGORY_BASE[p.category] };
  const text = listingText(p);
  const read = facetsFromText(text);
  bump(facets, read.facets, 0.7);
  const cues = [...read.words];

  if (p.outdoorSeating === "yes") {
    bump(facets, { nature: 0.2, social: 0.1 });
    cues.push("outdoor seating");
  }
  if (p.priceLevel && p.priceLevel >= 3) bump(facets, { romantic: 0.25, design: 0.2, foodie: 0.1 });
  if (p.tags.includes("free")) bump(facets, { social: 0.1 });
  // Loved by the few who know it: highly rated with a modest number of reviews.
  if (p.rating !== undefined && p.rating >= 4.6 && p.ratingCount !== undefined && p.ratingCount >= 15 && p.ratingCount < 250) {
    bump(facets, { offbeat: 0.45 });
    cues.push("highly rated, little known");
  }
  // Chains are rarely what anyone means by a crafted, design-led or offbeat find.
  if (p.tags.includes("chain")) {
    for (const f of ["craft", "design", "offbeat", "cozy"] as const) if (facets[f]) facets[f] = facets[f]! * 0.4;
  }
  return { facets, cues, text };
}
