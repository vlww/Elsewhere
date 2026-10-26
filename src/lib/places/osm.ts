import type { Place, PlaceCategory, PlaceSource, Verified } from "@/types";

export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function osmCategory(t: Record<string, string>): PlaceCategory | null {
  if (t.amenity === "library") return "library";
  if (t.amenity === "cafe") return /tea/i.test(t.cuisine ?? "") ? "tea" : "cafe";
  if (t.amenity === "coworking_space" || t.office === "coworking") return "coworking";
  if (t.amenity === "arts_centre" || t.amenity === "studio") return "arts_centre";
  if (t.amenity === "cinema") return "cinema";
  if (t.amenity === "community_centre" || t.amenity === "social_centre") return "community";
  if (t.shop === "books") return "bookstore";
  if (t.shop === "tea") return "tea";
  if (t.shop === "music") return "music";
  if (t.shop === "art" || t.tourism === "gallery") return "gallery";
  if (t.tourism === "museum") return "museum";
  if (t.leisure === "garden") return "garden";
  if (t.leisure === "park") return "park";
  if (t.place === "square") return "plaza";
  if (t.shop === "stationery") return "other";
  return null;
}

/** OSM amenity tri-state. `internet_access=wlan|yes|wifi` → yes, `no` → no. */
function wifiState(t: Record<string, string>): Verified {
  const v = t.internet_access;
  if (!v) return "unknown";
  if (v === "no") return "no";
  if (["wlan", "yes", "wifi", "terminal;wlan"].includes(v)) return "yes";
  return "unknown";
}

function yesNo(v?: string): Verified {
  if (!v) return "unknown";
  if (v === "no") return "no";
  if (["yes", "sidewalk", "garden", "terrace", "pedestrian_zone", "patio", "only"].includes(v)) return "yes";
  return "unknown";
}

function commonsImage(t: Record<string, string>): string | undefined {
  const img = t.image;
  if (img && /^https:\/\/(upload\.wikimedia\.org|commons\.wikimedia\.org)\//.test(img)) {
    const file = /File:(.+)$/.exec(img)?.[1];
    return file ? `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=800` : img;
  }
  const commons = t.wikimedia_commons;
  if (commons?.startsWith("File:")) {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(commons.slice(5))}?width=800`;
  }
  return undefined;
}

export function normalizeOsm(el: OsmElement, source: PlaceSource, fetchedAt: string): Place | null {
  const t = el.tags ?? {};
  if (!t.name) return null;
  const category = osmCategory(t);
  if (!category) return null;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;

  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const tags: string[] = [];
  if (t.cuisine) tags.push(...t.cuisine.split(";").map((c) => c.trim().replace(/_/g, " ")));
  if (t.brand) tags.push("chain");
  if (t.socket) tags.push("power outlets");
  if (t.wheelchair === "yes") tags.push("step-free access");
  const imageUrl = commonsImage(t);

  return {
    id: `${source}:${el.type}/${el.id}`,
    providerId: `${el.type}/${el.id}`,
    source,
    name: t.name,
    lat,
    lon,
    category,
    subcategory: t.amenity ?? t.shop ?? t.leisure ?? t.tourism ?? t.place,
    address: street || undefined,
    neighborhood: t["addr:city"],
    url: t.website ?? t["contact:website"],
    providerUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    phone: t.phone,
    openingHoursRaw: t.opening_hours,
    wifi: wifiState(t),
    outdoorSeating: yesNo(t.outdoor_seating),
    wheelchair: t.wheelchair === "yes" ? "yes" : t.wheelchair === "no" ? "no" : "unknown",
    description: t.description,
    imageUrl,
    imageCredit: imageUrl ? "Wikimedia Commons" : undefined,
    tags,
    fetchedAt,
    dataNote: t.check_date ? `Last surveyed ${t.check_date}` : undefined,
  };
}
