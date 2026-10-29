import type { Place, PlaceCategory } from "@/types";

export interface NearbyQuery {
  lat: number;
  lon: number;
  radiusM: number;
  categories: PlaceCategory[];
}

export interface TextQuery {
  text: string;
  lat: number;
  lon: number;
  radiusM: number;
  /** Category for matches whose own types don't map to one. */
  fallbackCategory: PlaceCategory;
}

export interface PlaceProvider {
  id: "google" | "overpass" | "demo";
  label: string;
  searchNearby(q: NearbyQuery): Promise<Place[]>;
  /** Free-text search near a point; providers without one leave it out. */
  searchText?(q: TextQuery): Promise<Place[]>;
}

export class ProviderError extends Error {
  constructor(message: string, readonly userMessage: string, readonly kind: "unavailable" | "out-of-area" | "config") {
    super(message);
  }
}
