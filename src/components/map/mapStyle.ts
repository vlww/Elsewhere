import type { LayerSpecification, StyleSpecification } from "@maplibre/maplibre-gl-style-spec";

/**
 * Elsewhere's map style: OpenFreeMap's "Liberty" style (OpenMapTiles schema) recoloured into the
 * sunset palette. Geometry and labels are untouched; only paint, plus hiding generic POI icons
 * so recommendation markers stay legible.
 */
export const BASE_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

const C = {
  ground: "#FBF1EA",
  residential: "#F8EAE2",
  park: "#D7E3CB",
  wood: "#CADAB9",
  water: "#CBD3F0",
  waterLine: "#BEC8EE",
  casing: "#EBD3C9",
  minor: "#FFFDFA",
  tertiary: "#FFF4EA",
  primary: "#FCE0CF",
  motorway: "#F4C7AC",
  rail: "#D8C6D2",
  path: "#E6C9BE",
  building: "#F1DDD5",
  buildingLine: "#DDBFB6",
  label: "#59465F",
  labelStrong: "#302638",
  halo: "#FFF9F4",
  boundary: "#C9B4C8",
};

function lineColor(id: string): string | null {
  if (id.includes("casing")) return C.casing;
  if (id.includes("path_pedestrian")) return C.path;
  if (id.includes("rail")) return C.rail;
  if (id.includes("motorway")) return C.motorway;
  if (id.includes("trunk_primary")) return C.primary;
  if (id.includes("secondary_tertiary")) return C.tertiary;
  if (/(minor|street|service|link)/.test(id)) return C.minor;
  return null;
}

const FILL: Record<string, string> = {
  park: C.park,
  landuse_residential: C.residential,
  landcover_wood: C.wood,
  landcover_grass: C.park,
  landcover_wetland: "#D3E0D3",
  landcover_sand: "#F7ECCF",
  landcover_ice: "#F3F1FA",
  landuse_pitch: "#D5E2C8",
  landuse_track: "#D5E2C8",
  landuse_cemetery: "#DCE4D1",
  landuse_hospital: "#F6DEDF",
  landuse_school: "#F5E5DA",
  water: C.water,
  aeroway_fill: "#EFE3EA",
  road_area_pattern: "#FFF6EF",
  building: C.building,
};

/** Explore buildings, and the neutral porcelain they recede to while the Taste Layer is lit. */
export const BUILDING_2D_COLOR = C.building;
export const BUILDING_2D_COLOR_MUTED = "#ECE6E6";

/** Immersive city: warm ivory low-rise fading to lavender towers. */
export const BUILDING_3D_COLOR = [
  "interpolate",
  ["linear"],
  ["coalesce", ["get", "render_height"], 8],
  0, "#FFFBF6",
  18, "#FFF3EB",
  45, "#FBEBEC",
  90, "#F2EBF8",
  200, "#E9E3FA",
] as const as unknown as string;

/** With the Taste Layer on, the rest of the city recedes to a soft porcelain so highlighted buildings carry the colour. */
export const BUILDING_3D_COLOR_MUTED = [
  "interpolate",
  ["linear"],
  ["coalesce", ["get", "render_height"], 8],
  0, "#FAF5F2",
  40, "#F3EEF0",
  200, "#ECE8F2",
] as const as unknown as string;

export function buildElsewhereStyle(base: StyleSpecification): StyleSpecification {
  const style: StyleSpecification = structuredClone(base);
  delete (style.sources as Record<string, unknown>).ne2_shaded;
  const layers: LayerSpecification[] = [];

  for (const layer of style.layers) {
    if (layer.id === "natural_earth") continue;
    const l = layer as LayerSpecification & { paint?: Record<string, unknown>; layout?: Record<string, unknown> };
    l.paint = { ...(l.paint ?? {}) };
    l.layout = { ...(l.layout ?? {}) };

    switch (l.type) {
      case "background":
        l.paint["background-color"] = C.ground;
        break;
      case "fill":
        if (FILL[l.id]) {
          l.paint["fill-color"] = FILL[l.id];
          delete l.paint["fill-pattern"];
        }
        if (l.id === "building") {
          l.paint["fill-outline-color"] = C.buildingLine;
          // Liberty hands buildings to the 3D layer past z14; Explore is flat, so keep the 2D outlines at every zoom.
          delete (l as { maxzoom?: number }).maxzoom;
        }
        if (l.id === "landuse_residential") l.paint["fill-opacity"] = 0.6;
        break;
      case "line": {
        if (l.id.startsWith("waterway")) l.paint["line-color"] = C.waterLine;
        else if (l.id === "park_outline") l.paint["line-color"] = "#C3D4B5";
        else if (l.id.startsWith("boundary")) l.paint["line-color"] = C.boundary;
        else {
          const col = lineColor(l.id);
          if (col) l.paint["line-color"] = col;
          if (l.id.startsWith("tunnel")) l.paint["line-opacity"] = 0.45;
        }
        break;
      }
      case "fill-extrusion":
        if (l.id === "building-3d") {
          l.paint["fill-extrusion-color"] = BUILDING_3D_COLOR;
          l.paint["fill-extrusion-opacity"] = 0.95;
          l.paint["fill-extrusion-vertical-gradient"] = true;
          l.layout.visibility = "none";
        }
        break;
      case "symbol":
        if (/^poi_r(1|7|20)$/.test(l.id) || l.id.startsWith("road_one_way")) {
          l.layout.visibility = "none";
          break;
        }
        l.paint["text-color"] = /label_(city|country|state)/.test(l.id) ? C.labelStrong : C.label;
        l.paint["text-halo-color"] = C.halo;
        l.paint["text-halo-width"] = 1.4;
        if (l.id === "poi_transit") l.paint["icon-opacity"] = 0.7;
        break;
    }
    layers.push(l);
  }
  style.layers = layers;
  style.light = { anchor: "map", color: "#FFE6D2", intensity: 0.35, position: [1.4, 215, 40] };
  return style;
}

export const IMMERSIVE_SKY = {
  "sky-color": "#EFC3D2",
  "horizon-color": "#FCE3D6",
  "fog-color": "#F8E2E2",
  "sky-horizon-blend": 0.7,
  "horizon-fog-blend": 0.6,
  "fog-ground-blend": 0.35,
  "atmosphere-blend": 0,
};

/** Taste Layer dusk: a touch deeper and rosier, so lit windows and halos read. */
export const TASTE_SKY = {
  ...IMMERSIVE_SKY,
  "sky-color": "#E3AECB",
  "horizon-color": "#FBD3C4",
  "fog-color": "#F4D6DE",
};
