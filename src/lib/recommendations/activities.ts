import type { Activity, PlaceCategory } from "@/types";

/**
 * How well each place type suits each activity (0–1). These are Elsewhere's editorial
 * estimates, surfaced in the UI as such — never as verified facts about a specific place.
 */
export const ACTIVITY_FIT: Record<Activity, Partial<Record<PlaceCategory, number>>> = {
  study: { library: 1, coworking: 0.95, cafe: 0.7, tea: 0.7, community: 0.55, bookstore: 0.45, garden: 0.4, arts_centre: 0.4, park: 0.35, museum: 0.3, gallery: 0.25, plaza: 0.2, other: 0.3, music: 0.1, cinema: 0 },
  work: { coworking: 1, library: 0.9, cafe: 0.8, tea: 0.65, community: 0.5, arts_centre: 0.4, bookstore: 0.3, park: 0.25, garden: 0.25, gallery: 0.15, museum: 0.15, plaza: 0.15, other: 0.3, music: 0.05, cinema: 0 },
  read: { library: 1, bookstore: 0.85, tea: 0.85, garden: 0.85, park: 0.75, cafe: 0.7, coworking: 0.5, gallery: 0.4, community: 0.4, museum: 0.35, plaza: 0.35, arts_centre: 0.3, other: 0.3, music: 0.2, cinema: 0.05 },
  think: { garden: 1, park: 0.9, gallery: 0.8, tea: 0.75, museum: 0.7, library: 0.7, bookstore: 0.55, cafe: 0.5, plaza: 0.5, arts_centre: 0.5, cinema: 0.4, music: 0.4, coworking: 0.3, community: 0.3, other: 0.3 },
  meet: { cafe: 1, tea: 0.8, park: 0.75, plaza: 0.7, community: 0.7, arts_centre: 0.65, cinema: 0.6, garden: 0.6, gallery: 0.55, museum: 0.55, music: 0.55, bookstore: 0.5, coworking: 0.5, other: 0.4, library: 0.2 },
  create: { arts_centre: 1, coworking: 0.85, cafe: 0.75, gallery: 0.7, library: 0.65, tea: 0.6, garden: 0.6, community: 0.6, museum: 0.6, music: 0.6, park: 0.55, bookstore: 0.5, plaza: 0.35, other: 0.4, cinema: 0.3 },
  break: { park: 1, garden: 1, cafe: 0.85, tea: 0.85, plaza: 0.75, gallery: 0.7, bookstore: 0.7, music: 0.65, museum: 0.6, arts_centre: 0.55, cinema: 0.55, other: 0.4, library: 0.35, community: 0.35, coworking: 0.1 },
  explore: { gallery: 0.9, bookstore: 0.9, museum: 0.85, garden: 0.85, arts_centre: 0.85, music: 0.8, tea: 0.75, park: 0.75, cinema: 0.7, cafe: 0.65, plaza: 0.65, library: 0.55, community: 0.45, other: 0.4, coworking: 0.25 },
};

export const ACTIVITY_VERB: Record<Activity, string> = {
  study: "studying",
  work: "working",
  read: "reading",
  think: "thinking",
  meet: "meeting up",
  create: "making things",
  break: "taking a break",
  explore: "exploring",
};

export const CATEGORY_LABEL: Record<PlaceCategory, string> = {
  cafe: "Café",
  library: "Library",
  bookstore: "Bookstore",
  park: "Park",
  garden: "Garden",
  gallery: "Gallery",
  museum: "Museum",
  arts_centre: "Arts centre",
  coworking: "Coworking",
  tea: "Tea house",
  cinema: "Cinema",
  music: "Record store",
  community: "Community space",
  plaza: "Plaza",
  other: "Place",
};

export const OUTDOOR_CATEGORIES: PlaceCategory[] = ["park", "garden", "plaza"];

export function activityFit(activity: Activity, category: PlaceCategory) {
  return ACTIVITY_FIT[activity][category] ?? 0.3;
}

export function relevantCategories(activity: Activity): PlaceCategory[] {
  return (Object.entries(ACTIVITY_FIT[activity]) as [PlaceCategory, number][]).filter(([, v]) => v >= 0.1).map(([k]) => k);
}
