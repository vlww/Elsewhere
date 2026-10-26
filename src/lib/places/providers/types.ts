import type { Place, PlaceCategory } from "@/types";

export interface NearbyQuery {
  lat: number;
  lon: number;
  radiusM: number;
  categories: PlaceCategory[];
}

export interface PlaceProvider {
  id: "google" | "overpass" | "demo";
  label: string;
  searchNearby(q: NearbyQuery): Promise<Place[]>;
}

export class ProviderError extends Error {
  constructor(message: string, readonly userMessage: string, readonly kind: "unavailable" | "out-of-area" | "config") {
    super(message);
  }
}
