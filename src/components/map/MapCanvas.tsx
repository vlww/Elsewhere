"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as maplibregl from "maplibre-gl";
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { Bookmark, Undo2, Crosshair, Sparkles } from "lucide-react";
import { useElsewhere } from "@/store/useElsewhere";
import type { Recommendation } from "@/types";
import { CATEGORY_LABEL, CATEGORY_META } from "@/components/places/categoryMeta";
import type { TasteHighlight } from "@/lib/taste/highlights";
import { useTasteHighlights } from "./useTasteHighlights";
import { BASE_STYLE_URL, BUILDING_2D_COLOR, BUILDING_2D_COLOR_MUTED, BUILDING_3D_COLOR, BUILDING_3D_COLOR_MUTED, buildElsewhereStyle, IMMERSIVE_SKY, TASTE_SKY } from "./mapStyle";
import { ImmersiveLayer, type TasteBuilding } from "./ImmersiveLayer";
import { findAuraBuildings, findFootprints, type AuraBuilding, type Footprint } from "./footprints";
import { mapRef, panelPadding, prefersReducedMotion } from "./mapRef";
import { trailGeometry, TRAIL_COLORS } from "@/components/trails/trailGeometry";

const MARKER_LIMIT = 14;
/** Immersive draws the 3D city, which the basemap only has from z14; further out it's an empty plain. */
const IMMERSIVE_MIN_ZOOM = 14;
const TASTE_BUILDING_LIMIT = 16;
/** Explore aura opacity per ring, before the travelling wave and the outward reveal. */
const AURA_OPACITY: maplibregl.ExpressionSpecification = ["match", ["get", "level"], 1, 0.52, 2, 0.32, 0.16];
const AURA_REACH_M = 190;

/** Explore aura: rings revealed outward up to `reveal` metres, brightened where the wave front `front` passes. */
function auraOpacity(reveal: number, front: number | null): maplibregl.ExpressionSpecification {
  const shown: maplibregl.ExpressionSpecification = ["min", 1, ["max", 0, ["/", ["-", reveal, ["get", "dist"]], 40]]];
  const bump: maplibregl.ExpressionSpecification =
    front === null ? ["literal", 0] : ["*", 0.28, ["max", 0, ["-", 1, ["abs", ["/", ["-", ["get", "dist"], front], 32]]]]];
  return ["*", shown, ["+", AURA_OPACITY, bump]];
}
// Copied from node_modules by scripts/copy-maplibre-worker.mjs.
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
const DEMO_CENTER: [number, number] = [-73.99735, 40.73085];

type MarkerEntry = { marker: maplibregl.Marker; el: HTMLButtonElement; root: Root; key: string };

function circlePolygon(lat: number, lon: number, radiusM: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const dLat = (radiusM / 111320) * Math.sin(a);
    const dLon = (radiusM / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a);
    pts.push([lon + dLon, lat + dLat]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [pts] } };
}

const emptyFC = { type: "FeatureCollection" as const, features: [] };

/** Route gradient along the line, revealed up to `progress` (0–1) for the draw-in. */
function routeGradient(colors: string[], progress: number): maplibregl.ExpressionSpecification {
  const stops: (number | string)[] = [];
  colors.forEach((c, i) => stops.push(colors.length > 1 ? i / (colors.length - 1) : 0, c));
  if (colors.length === 1) stops.push(1, colors[0]);
  const ramp = ["interpolate", ["linear"], ["line-progress"], ...stops] as unknown as maplibregl.ExpressionSpecification;
  return progress >= 1 ? ramp : ["case", ["<=", ["line-progress"], progress], ramp, "rgba(0,0,0,0)"];
}
/** "Marching" dash steps for the flow overlay (MapLibre can't animate dash offsets directly). */
const FLOW_DASHES = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

/** The top recommendations as floating 3D markers, in the same order and filter as the DOM markers. */
function immersivePoints(highlights: Map<string, TasteHighlight>, footprints: Map<string, Footprint | null>) {
  const s = useElsewhere.getState();
  const layerOn = s.tasteLayer && highlights.size > 0;
  return s
    .orderedRecommendations()
    .filter((r) => !s.hiddenCategories.includes(r.place.category))
    .slice(0, 10)
    .map((r) => {
      const h = highlights.get(r.place.id);
      const fp = h ? footprints.get(r.place.id) : undefined;
      return {
        id: r.place.id,
        lat: r.place.lat,
        lon: r.place.lon,
        color: h?.color ?? CATEGORY_META[r.place.category].color,
        selected: r.place.id === s.selectedPlaceId,
        isNew: true,
        // Float over the taste building drawn for this place (pavilions are 12 m).
        liftM: h ? (fp ? Math.max(fp.heightM, 7) : 12) + 6 : 0,
        muted: layerOn && !h,
      };
    });
}

function inPolygon(lon: number, lat: number, g: GeoJSON.Geometry) {
  const rings = g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p) => p[0]) : [];
  return rings.some((ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });
}

export function MapCanvas() {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [backTo, setBackTo] = useState<maplibregl.CameraOptions | null>(null);
  const [showResultsChip, setShowResultsChip] = useState(false);
  const markers = useRef(new Map<string, MarkerEntry>());
  const seen = useRef(new Set<string>());
  const extraMarkers = useRef<maplibregl.Marker[]>([]);
  const trailMarkers = useRef<{ marker: maplibregl.Marker; el: HTMLElement }[]>([]);
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const immersive = useRef<ImmersiveLayer | null>(null);
  const footprints = useRef(new Map<string, Footprint | null>());
  const [footprintVersion, setFootprintVersion] = useState(0);
  const [immersiveVersion, setImmersiveVersion] = useState(0);
  // Neighbouring buildings in the standouts' radiating rings, from loaded tiles.
  const aura = useRef<AuraBuilding[]>([]);
  const auraSig = useRef("");
  const auraRevealAt = useRef(0);
  const [auraVersion, setAuraVersion] = useState(0);
  const highlightRef = useRef<TasteHighlight[]>([]);
  const userMovedAt = useRef(0);
  const [attempt, setAttempt] = useState(0);

  const location = useElsewhere((s) => s.location);
  const result = useElsewhere((s) => s.result);
  const constraints = useElsewhere((s) => s.constraints);
  const selectedPlaceId = useElsewhere((s) => s.selectedPlaceId);
  const hoveredPlaceId = useElsewhere((s) => s.hoveredPlaceId);
  const hiddenCategories = useElsewhere((s) => s.hiddenCategories);
  const lensMode = useElsewhere((s) => s.lensMode);
  const sortMode = useElsewhere((s) => s.sortMode);
  const tasteSignals = useElsewhere((s) => s.tasteSignals);
  const mapMode = useElsewhere((s) => s.mapMode);
  const focusRequest = useElsewhere((s) => s.focusRequest);
  const fitRequest = useElsewhere((s) => s.fitRequest);
  const searchStartedAt = useElsewhere((s) => s.searchStartedAt);
  const trail = useElsewhere((s) => s.trail);
  const saved = useElsewhere((s) => s.saved);
  const tasteLayer = useElsewhere((s) => s.tasteLayer);
  const trailStop = useElsewhere((s) => s.trailStop);
  const lowPower = useElsewhere((s) => s.lowPower);

  // The Taste Layer's highlights: one list, drawn by whichever mode is active.
  const highlights = useTasteHighlights();
  const highlightById = useMemo(() => new Map(highlights.map((h) => [h.placeId, h])), [highlights]);
  useEffect(() => {
    highlightRef.current = highlights;
  }, [highlights]);
  /** Recomputes the standouts' rings from loaded tiles; true when the set of buildings changed. */
  function refreshAura(map: maplibregl.Map) {
    const seeds = highlightRef.current.filter((h) => h.tier === "strong");
    const next = findAuraBuildings(map, seeds, footprints.current);
    const sig = seeds.map((h) => h.placeId).join(",") + "#" + next.map((b) => b.key).join(",");
    if (sig === auraSig.current) return false;
    // Only replay the outward reveal when the standouts themselves change, not when more tiles arrive.
    if (sig.split("#")[0] !== auraSig.current.split("#")[0]) auraRevealAt.current = performance.now();
    auraSig.current = sig;
    aura.current = next;
    return true;
  }

  // --- Create the map -------------------------------------------------------
  useEffect(() => {
    if (!container.current) return;
    let cancelled = false;
    let map: maplibregl.Map | null = null;
    setFailure(null);

    (async () => {
      let style: StyleSpecification;
      try {
        const res = await fetch(BASE_STYLE_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        style = buildElsewhereStyle(await res.json());
      } catch {
        if (!cancelled) setFailure("The map tiles couldn't load. Results still work — the list is on the right.");
        return;
      }
      if (cancelled || !container.current) return;
      const loc = useElsewhere.getState().location;
      try {
        map = new maplibregl.Map({
          container: container.current,
          style: style as maplibregl.StyleSpecification,
          center: loc ? [loc.lon, loc.lat] : DEMO_CENTER,
          zoom: 15,
          minZoom: 3,
          maxPitch: 72,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          attributionControl: { compact: true },
          canvasContextAttributes: { antialias: true },
          fadeDuration: 200,
        });
      } catch {
        setFailure("This browser can't draw the interactive map (WebGL unavailable). The results list still works.");
        return;
      }
      mapRef.current = map;
      if (process.env.NODE_ENV === "development") (window as unknown as { __esMap?: maplibregl.Map }).__esMap = map;
      map.keyboard.enable();
      const markUserMove = (e: { originalEvent?: unknown }) => {
        if (e.originalEvent) {
          userMovedAt.current = Date.now();
          setBackTo(null);
        }
      };
      map.on("dragstart", markUserMove);
      map.on("zoomstart", markUserMove);
      map.on("rotatestart", markUserMove);
      map.on("pitchstart", markUserMove);
      map.on("error", (e) => console.warn("[map]", e.error?.message));
      // The compass reads these, so it turns with the camera without re-rendering React every frame.
      const syncCompass = () => {
        if (!map) return;
        const root = document.documentElement.style;
        root.setProperty("--map-bearing", String(map.getBearing()));
        root.setProperty("--map-pitch", String(map.getPitch()));
      };
      map.on("rotate", syncCompass);
      map.on("pitch", syncCompass);
      map.on("load", syncCompass);
      map.on("load", () => {
        if (!map) return;
        map.addSource("es-radius", { type: "geojson", data: emptyFC });
        map.addLayer({ id: "es-radius-fill", type: "fill", source: "es-radius", paint: { "fill-color": "#F2B9C8", "fill-opacity": 0.08 } });
        map.addLayer({
          id: "es-radius-line",
          type: "line",
          source: "es-radius",
          paint: { "line-color": "#D98FA8", "line-opacity": 0.45, "line-width": 1.2, "line-dasharray": [2, 3] },
        });
        map.addSource("es-pool", { type: "geojson", data: emptyFC, cluster: true, clusterRadius: 38, clusterMaxZoom: 16 });
        map.addLayer({
          id: "es-pool-clusters",
          type: "circle",
          source: "es-pool",
          filter: ["has", "point_count"],
          paint: { "circle-color": "#FFF9F4", "circle-stroke-color": "#D98FA8", "circle-stroke-width": 1.5, "circle-radius": ["step", ["get", "point_count"], 13, 6, 16, 15, 20] },
        });
        map.addLayer({
          id: "es-pool-count",
          type: "symbol",
          source: "es-pool",
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": 11 },
          paint: { "text-color": "#59465F" },
        });
        map.addLayer({
          id: "es-pool-points",
          type: "circle",
          source: "es-pool",
          filter: ["!", ["has", "point_count"]],
          paint: { "circle-color": ["get", "color"], "circle-radius": 5.5, "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 1.5 },
        });
        // Taste Layer (Explore): a soft wash where matches cluster, tinted real footprints, and halos.
        // Directly above the 2D buildings (which this style draws after some labels), below everything else.
        const styleLayers = map.getStyle().layers;
        const afterBuildings = styleLayers[styleLayers.findIndex((l) => l.id === "building") + 1]?.id;
        const beforeLabels = afterBuildings ?? styleLayers.find((l) => l.type === "symbol")?.id;
        map.addSource("es-taste-pts", { type: "geojson", data: emptyFC });
        map.addSource("es-taste-fp", { type: "geojson", data: emptyFC });
        map.addLayer(
          {
            id: "es-taste-heat",
            type: "heatmap",
            source: "es-taste-pts",
            maxzoom: 18,
            paint: {
              "heatmap-weight": ["get", "strength"],
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 12, 22, 15, 50, 17, 90],
              "heatmap-intensity": 0.6,
              "heatmap-opacity": 0.38,
              "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],
                0, "rgba(255,255,255,0)",
                0.2, "rgba(249,213,228,0.35)",
                0.45, "rgba(242,185,200,0.55)",
                0.7, "rgba(217,190,240,0.65)",
                1, "rgba(246,194,155,0.75)",
              ],
            },
          },
          beforeLabels,
        );
        // Radiating aura (Explore): real neighbouring buildings tinted in rings around each standout.
        map.addSource("es-taste-aura", { type: "geojson", data: emptyFC });
        map.addLayer(
          {
            id: "es-taste-aura",
            type: "fill",
            source: "es-taste-aura",
            paint: { "fill-color": ["get", "color"], "fill-opacity": auraOpacity(0, null), "fill-outline-color": "rgba(255,255,255,0.7)" },
          },
          beforeLabels,
        );
        // The inner ring gets a coloured edge so the first buildings out read as part of the match.
        map.addLayer(
          {
            id: "es-taste-aura-edge",
            type: "line",
            source: "es-taste-aura",
            filter: ["==", ["get", "level"], 1],
            paint: { "line-color": ["get", "deep"], "line-width": 1, "line-opacity": 0.45 },
          },
          beforeLabels,
        );
        // Ripples spreading out from the standouts, two out of phase (animated in an effect below).
        for (const id of ["es-taste-ripple-0", "es-taste-ripple-1"])
          map.addLayer(
            {
              id,
              type: "circle",
              source: "es-taste-pts",
              filter: ["==", ["get", "tier"], "strong"],
              paint: {
                "circle-opacity": 0,
                "circle-radius": 0,
                "circle-stroke-color": ["get", "color"],
                "circle-stroke-width": 2,
                "circle-stroke-opacity": 0,
                "circle-pitch-alignment": "map",
              },
            },
            beforeLabels,
          );
        map.addLayer(
          {
            id: "es-taste-halo",
            type: "circle",
            source: "es-taste-pts",
            paint: {
              "circle-color": ["get", "color"],
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, ["*", 14, ["get", "scale"]], 17, ["*", 38, ["get", "scale"]]],
              "circle-blur": 0.85,
              "circle-opacity": ["case", ["==", ["get", "tier"], "strong"], 0.75, 0.5],
            },
          },
          beforeLabels,
        );
        map.addLayer(
          {
            id: "es-taste-fp-fill",
            type: "fill",
            source: "es-taste-fp",
            minzoom: 14,
            paint: {
              "fill-color": ["get", "color"],
              "fill-opacity": ["case", ["boolean", ["get", "active"], false], 0.85, ["==", ["get", "tier"], "strong"], 0.62, 0.42],
            },
          },
          beforeLabels,
        );
        map.addLayer(
          {
            id: "es-taste-fp-line",
            type: "line",
            source: "es-taste-fp",
            minzoom: 14,
            paint: { "line-color": ["get", "deep"], "line-width": ["case", ["boolean", ["get", "active"], false], 2.2, 1.2], "line-opacity": 0.7 },
          },
          beforeLabels,
        );
        map.on("click", "es-taste-fp-fill", (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (id) useElsewhere.getState().select(String(id), { focus: false });
        });
        map.on("mousemove", "es-taste-fp-fill", (e) => {
          const id = e.features?.[0]?.properties?.id;
          map!.getCanvas().style.cursor = "pointer";
          if (id && useElsewhere.getState().hoveredPlaceId !== id) useElsewhere.getState().hover(String(id));
        });
        map.on("mouseleave", "es-taste-fp-fill", () => {
          map!.getCanvas().style.cursor = "";
          useElsewhere.getState().hover(null);
        });

        // Immersive: the 3D taste buildings sit on real footprints, so the basemap's own extrusion at the
        // pointer tells us which highlighted place (if any) is under it.
        const pickBuilding = (point: maplibregl.Point) => {
          const s = useElsewhere.getState();
          if (s.mapMode !== "immersive" || !s.tasteLayer || !highlightRef.current.length || !map?.getLayer("building-3d")) return null;
          const hit = map.queryRenderedFeatures(point, { layers: ["building-3d"] })[0];
          if (!hit) return null;
          return highlightRef.current.find((h) => footprints.current.get(h.placeId) && inPolygon(h.lon, h.lat, hit.geometry)) ?? null;
        };
        map.on("click", (e) => {
          if (e.defaultPrevented) return;
          const h = pickBuilding(e.point);
          if (h) useElsewhere.getState().select(h.placeId, { focus: true });
        });
        let hoverFrame = 0;
        map.on("mousemove", (e) => {
          if (hoverFrame || useElsewhere.getState().mapMode !== "immersive") return;
          hoverFrame = requestAnimationFrame(() => {
            hoverFrame = 0;
            const h = pickBuilding(e.point);
            const s = useElsewhere.getState();
            if (h) {
              map!.getCanvas().style.cursor = "pointer";
              if (s.hoveredPlaceId !== h.placeId) s.hover(h.placeId);
            } else if (s.hoveredPlaceId && highlightRef.current.some((x) => x.placeId === s.hoveredPlaceId) && map!.getCanvas().style.cursor === "pointer") {
              map!.getCanvas().style.cursor = "";
              s.hover(null);
            }
          });
        });
        // Footprints come from loaded tiles; retry the ones not found once the view settles.
        map.on("idle", () => {
          const hs = highlightRef.current;
          if (!map || !hs.length || map.getZoom() < 14) return;
          const missing = hs.filter((h) => !footprints.current.get(h.placeId));
          let changed = false;
          if (missing.length)
            for (const [id, fp] of findFootprints(map, missing)) {
              if (fp && !footprints.current.get(id)) changed = true;
              footprints.current.set(id, fp);
            }
          if (changed) setFootprintVersion((v) => v + 1);
          // Newly loaded tiles can add buildings to the rings.
          if (refreshAura(map)) setAuraVersion((v) => v + 1);
        });

        // Taste Trail route: white casing, a soft glow, the gradient line, and a light flowing along it.
        map.addSource("es-trail", { type: "geojson", data: emptyFC, lineMetrics: true });
        map.addSource("es-trail-est", { type: "geojson", data: emptyFC });
        const routeLayout = { "line-cap": "round", "line-join": "round" } as const;
        map.addLayer(
          {
            id: "es-trail-casing",
            type: "line",
            source: "es-trail",
            layout: routeLayout,
            paint: { "line-color": "#FFFFFF", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 6, 17, 12], "line-opacity": 0.9 },
          },
          beforeLabels,
        );
        map.addLayer(
          {
            id: "es-trail-glow",
            type: "line",
            source: "es-trail",
            layout: routeLayout,
            paint: { "line-gradient": routeGradient(["#E58FA8"], 0), "line-width": ["interpolate", ["linear"], ["zoom"], 13, 12, 17, 26], "line-blur": 10, "line-opacity": 0.45 },
          },
          beforeLabels,
        );
        map.addLayer(
          {
            id: "es-trail-line",
            type: "line",
            source: "es-trail",
            layout: routeLayout,
            paint: { "line-gradient": routeGradient(["#E58FA8"], 0), "line-width": ["interpolate", ["linear"], ["zoom"], 13, 3.5, 17, 7] },
          },
          beforeLabels,
        );
        map.addLayer(
          {
            id: "es-trail-flow",
            type: "line",
            source: "es-trail",
            layout: { "line-cap": "butt", "line-join": "round" },
            paint: { "line-color": "#FFFDF6", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1.4, 17, 2.6], "line-opacity": 0, "line-dasharray": FLOW_DASHES[0] },
          },
          beforeLabels,
        );
        // Legs with no routed geometry: dotted, so an estimate never looks like a real street route.
        map.addLayer(
          {
            id: "es-trail-est",
            type: "line",
            source: "es-trail-est",
            layout: routeLayout,
            paint: { "line-color": "#B8668A", "line-width": 3, "line-opacity": 0.8, "line-dasharray": [0.4, 1.8] },
          },
          beforeLabels,
        );

        map.on("click", "es-pool-points", (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (id) useElsewhere.getState().select(String(id), { focus: false });
        });
        map.on("click", "es-pool-clusters", async (e) => {
          const f = e.features?.[0];
          if (!f || !map) return;
          const src = map.getSource("es-pool") as maplibregl.GeoJSONSource;
          const zoom = await src.getClusterExpansionZoom(f.properties?.cluster_id);
          map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom, duration: prefersReducedMotion() ? 0 : 500 });
        });
        for (const id of ["es-pool-points", "es-pool-clusters"]) {
          map.on("mouseenter", id, () => (map!.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", id, () => (map!.getCanvas().style.cursor = ""));
        }
        setReady(true);
      });
    })();

    const markerMap = markers.current;
    const footprintCache = footprints.current;
    return () => {
      cancelled = true;
      for (const m of markerMap.values()) {
        m.marker.remove();
        queueMicrotask(() => m.root.unmount());
      }
      markerMap.clear();
      extraMarkers.current.forEach((m) => m.remove());
      trailMarkers.current.forEach((m) => m.marker.remove());
      userMarker.current?.remove();
      userMarker.current = null;
      immersive.current = null;
      footprintCache.clear();
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [attempt]);

  // --- Location & radius ----------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !location) return;
    if (!userMarker.current) {
      const el = document.createElement("div");
      el.className = "es-user-dot";
      el.setAttribute("aria-label", "Search centre");
      el.setAttribute("role", "img");
      userMarker.current = new maplibregl.Marker({ element: el }).setLngLat([location.lon, location.lat]).addTo(map);
    } else userMarker.current.setLngLat([location.lon, location.lat]);
    const center = map.getCenter();
    if (Math.abs(center.lat - location.lat) > 0.002 || Math.abs(center.lng - location.lon) > 0.002) {
      map.flyTo({ center: [location.lon, location.lat], zoom: 15, duration: prefersReducedMotion() ? 0 : 1600, essential: false });
    }
  }, [ready, location]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !location) return;
    (map.getSource("es-radius") as maplibregl.GeoJSONSource).setData(circlePolygon(location.lat, location.lon, constraints.radiusM));
  }, [ready, location, constraints.radiusM]);

  // --- Markers --------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const ordered: Recommendation[] = useElsewhere.getState().orderedRecommendations();
    const onTrail = new Set(useElsewhere.getState().trail?.stops.map((s) => s.placeId) ?? []);
    const visible = ordered.filter((r) => !hiddenCategories.includes(r.place.category) && !onTrail.has(r.place.id));
    const top = visible.slice(0, MARKER_LIMIT);
    const rest = visible.slice(MARKER_LIMIT);
    const immersiveOn = mapMode === "immersive";

    const keep = new Set(top.map((r) => r.place.id));
    for (const [id, m] of markers.current) {
      if (!keep.has(id)) {
        m.marker.remove();
        queueMicrotask(() => m.root.unmount());
        markers.current.delete(id);
      }
    }

    top.forEach((r, i) => {
      const meta = CATEGORY_META[r.place.category];
      const isNew = !seen.current.has(r.place.id);
      let entry = markers.current.get(r.place.id);
      if (!entry) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "es-marker";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          // Immersive glides the camera to the place; Explore stays put and just opens the card.
          useElsewhere.getState().select(r.place.id, { focus: useElsewhere.getState().mapMode === "immersive" });
        });
        el.addEventListener("mouseenter", () => useElsewhere.getState().hover(r.place.id));
        el.addEventListener("mouseleave", () => useElsewhere.getState().hover(null));
        el.addEventListener("focus", () => useElsewhere.getState().hover(r.place.id));
        el.addEventListener("blur", () => useElsewhere.getState().hover(null));
        const root = createRoot(el);
        const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([r.place.lon, r.place.lat]).addTo(map);
        entry = { marker, el, root, key: "" };
        markers.current.set(r.place.id, entry);
        if (isNew) {
          el.classList.add("is-new");
          el.style.setProperty("--delay", `${Math.min(i, 10) * 60}ms`);
          setTimeout(() => el.classList.remove("is-new"), 1400 + i * 60);
        }
      }
      const Icon = meta.icon;
      const selected = selectedPlaceId === r.place.id;
      const h = highlightById.get(r.place.id);
      const key = `${i}|${selected}|${immersiveOn}|${h?.tier ?? ""}|${h?.why ?? ""}`;
      entry.el.dataset.selected = String(selected);
      entry.el.dataset.shape = immersiveOn ? "round" : meta.shape;
      entry.el.dataset.mode = immersiveOn ? "immersive" : "explore";
      // With a trail on the map, other results step back so the route reads first.
      entry.el.dataset.dimmed = String((!!selectedPlaceId || onTrail.size > 0) && !selected && hoveredPlaceId !== r.place.id);
      entry.el.style.setProperty("--pin-bg", meta.color);
      entry.el.dataset.taste = h ? h.tier : tasteLayer && highlights.length ? "muted" : "off";
      if (h) {
        entry.el.style.setProperty("--taste", h.color);
        entry.el.style.setProperty("--taste-deep", h.deep);
      }
      entry.el.setAttribute(
        "aria-label",
        `${i + 1}. ${r.place.name}, ${CATEGORY_LABEL[r.place.category]}, ${r.walkMin} minute walk${h ? `. Taste highlight: ${h.why}` : ""}`,
      );
      entry.el.setAttribute("aria-pressed", String(selected));
      entry.marker.getElement().style.zIndex = selected ? "10" : String(MARKER_LIMIT - i);
      if (entry.key !== key) {
        entry.key = key;
        entry.root.render(
          <>
            <span className="pin">
              <Icon size={selected ? 18 : 15} strokeWidth={2} />
            </span>
            <span className="rank" aria-hidden>
              {i + 1}
            </span>
            <span className="label" aria-hidden>
              {r.place.name}
              {h && (
                <span className="why">
                  <Sparkles size={10} /> {h.why}
                </span>
              )}
            </span>
          </>,
        );
      }
      seen.current.add(r.place.id);
    });

    (map.getSource("es-pool") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: rest.map((r) => ({
        type: "Feature",
        properties: { id: r.place.id, color: CATEGORY_META[r.place.category].color },
        geometry: { type: "Point", coordinates: [r.place.lon, r.place.lat] },
      })),
    });

    immersive.current?.setPoints(immersivePoints(highlightById, footprints.current));
  }, [ready, result, hiddenCategories, selectedPlaceId, hoveredPlaceId, lensMode, sortMode, tasteSignals.length, mapMode, highlightById, tasteLayer, highlights.length, footprintVersion, trail]);

  // --- Taste Layer ----------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const immersiveOn = mapMode === "immersive";
    const missing = highlights.filter((h) => !footprints.current.get(h.placeId));
    if (missing.length && map.getZoom() >= 14) for (const [id, fp] of findFootprints(map, missing)) footprints.current.set(id, fp);

    const active = (id: string) => id === selectedPlaceId || id === hoveredPlaceId;
    (map.getSource("es-taste-pts") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: highlights.map((h) => ({
        type: "Feature",
        properties: { id: h.placeId, color: h.color, tier: h.tier, strength: h.strength, scale: active(h.placeId) ? 1.4 : h.tier === "strong" ? 1 : 0.75 },
        geometry: { type: "Point", coordinates: [h.lon, h.lat] },
      })),
    });
    (map.getSource("es-taste-fp") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: highlights.flatMap((h) => {
        const fp = footprints.current.get(h.placeId);
        return fp
          ? [{ type: "Feature" as const, properties: { id: h.placeId, color: h.color, deep: h.deep, tier: h.tier, active: active(h.placeId) }, geometry: { type: "Polygon" as const, coordinates: [fp.ring] } }]
          : [];
      }),
    });
    // A cluster wash only means something when several places match.
    if (map.getLayer("es-taste-heat")) map.setLayoutProperty("es-taste-heat", "visibility", highlights.length >= 3 ? "visible" : "none");
    // In Immersive the 3D buildings replace the flat tint.
    for (const id of ["es-taste-fp-fill", "es-taste-fp-line"]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", immersiveOn ? "none" : "visible");
    // The rest of the city recedes to neutral so the taste colours carry.
    if (map.getLayer("building-3d")) map.setPaintProperty("building-3d", "fill-extrusion-color", highlights.length ? BUILDING_3D_COLOR_MUTED : BUILDING_3D_COLOR);
    if (map.getLayer("building")) map.setPaintProperty("building", "fill-color", highlights.length ? BUILDING_2D_COLOR_MUTED : BUILDING_2D_COLOR);
    // Radiating rings around each standout: the same real buildings in both modes.
    if (!highlights.length) {
      aura.current = [];
      auraSig.current = "";
    } else if (map.getZoom() >= 14) refreshAura(map);
    const colorOf = new Map(highlights.map((h) => [h.placeId, h.color]));
    const deepOf = new Map(highlights.map((h) => [h.placeId, h.deep]));
    const ringBuildings = aura.current.filter((b) => colorOf.has(b.seedId));
    (map.getSource("es-taste-aura") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: ringBuildings.map((b) => ({
        type: "Feature",
        properties: { color: colorOf.get(b.seedId), deep: deepOf.get(b.seedId), level: b.level, dist: Math.round(b.distM) },
        geometry: { type: "Polygon", coordinates: [b.ring] },
      })),
    });
    for (const id of ["es-taste-aura", "es-taste-aura-edge"]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", immersiveOn ? "none" : "visible");
    immersive.current?.setAura(
      ringBuildings.map((b) => ({ key: b.key, ring: b.ring, heightM: b.heightM, color: colorOf.get(b.seedId)!, distM: b.distM, level: b.level })),
    );
    if (immersiveOn) map.setSky(highlights.length ? TASTE_SKY : IMMERSIVE_SKY);

    immersive.current?.setTasteBuildings(
      highlights.slice(0, TASTE_BUILDING_LIMIT).map(
        (h): TasteBuilding => {
          const fp = footprints.current.get(h.placeId);
          return {
            id: h.placeId,
            lat: h.lat,
            lon: h.lon,
            ring: fp?.ring ?? null,
            heightM: fp?.heightM ?? 12,
            color: h.color,
            deep: h.deep,
            tier: h.tier,
            category: h.category,
            selected: h.placeId === selectedPlaceId,
            hovered: h.placeId === hoveredPlaceId,
          };
        },
      ),
    );
    immersive.current?.setPoints(immersivePoints(highlightById, footprints.current));
  }, [ready, highlights, highlightById, mapMode, selectedPlaceId, hoveredPlaceId, footprintVersion, immersiveVersion, auraVersion]);

  // Ripples radiate ~190 m from each standout every few seconds. Reduced motion: one still ring.
  const hasStandouts = highlights.some((h) => h.tier === "strong");
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.getLayer("es-taste-ripple-0")) return;
    const ids = ["es-taste-ripple-0", "es-taste-ripple-1"];
    const RADIUS_M = 190, PERIOD = 3600;
    // Ground metres → screen px at each zoom (512 px tiles), so the ring spans the same streets at any zoom.
    const radiusExpr = (k: number) => {
      const mpp0 = (40075016.686 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / 512;
      return ["interpolate", ["exponential", 2], ["zoom"], 10, (RADIUS_M * k * 2 ** 10) / mpp0, 20, (RADIUS_M * k * 2 ** 20) / mpp0] as maplibregl.ExpressionSpecification;
    };
    const paint = (i: number, k: number) => {
      map.setPaintProperty(ids[i], "circle-radius", radiusExpr(Math.max(k, 0.02)));
      map.setPaintProperty(ids[i], "circle-stroke-opacity", hasStandouts ? 0.7 * (1 - k) ** 1.5 : 0);
      map.setPaintProperty(ids[i], "circle-stroke-width", 2.5 - 1.5 * k);
    };
    const auraLayer = map.getLayer("es-taste-aura") ? "es-taste-aura" : null;
    if (!hasStandouts || prefersReducedMotion() || lowPower) {
      paint(0, 0.55);
      paint(1, 1);
      if (auraLayer) map.setPaintProperty(auraLayer, "fill-opacity", auraOpacity(AURA_REACH_M + 40, null));
      return;
    }
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 50) return; // ~20 fps is plenty for a slow ripple
      last = t;
      for (let i = 0; i < 2; i++) paint(i, ((t / PERIOD + i / 2) % 1));
      // The building wave rides the first ripple ring, and rings reveal outward after a change.
      if (auraLayer) {
        const reveal = Math.min(AURA_REACH_M + 40, (performance.now() - auraRevealAt.current) * 0.2);
        map.setPaintProperty(auraLayer, "fill-opacity", auraOpacity(reveal, ((t / PERIOD) % 1) * RADIUS_M));
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (mapRef.current?.getLayer(ids[0])) ids.forEach((id) => map.setPaintProperty(id, "circle-stroke-opacity", 0));
    };
  }, [ready, hasStandouts, lowPower]);

  // --- Saved pins (for saved places not already shown) -----------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    extraMarkers.current.forEach((m) => m.remove());
    extraMarkers.current = [];
    for (const { place } of Object.values(saved)) {
      if (markers.current.has(place.id)) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "es-saved-pin";
      el.setAttribute("aria-label", `Saved: ${place.name}`);
      const root = createRoot(el);
      root.render(<Bookmark size={11} fill="currentColor" />);
      el.addEventListener("click", () => useElsewhere.getState().select(place.id, { focus: false }));
      extraMarkers.current.push(new maplibregl.Marker({ element: el }).setLngLat([place.lon, place.lat]).addTo(map));
    }
  }, [ready, saved, result, trail]);

  // --- Trail stops: numbered markers in itinerary order ----------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    trailMarkers.current.forEach((m) => m.marker.remove());
    trailMarkers.current = [];
    if (!trail) return;
    const start = document.createElement("div");
    start.className = "es-trail-start";
    start.setAttribute("role", "img");
    start.setAttribute("aria-label", `Trail starts at ${trail.start.name}`);
    start.textContent = "Start";
    trailMarkers.current.push({ marker: new maplibregl.Marker({ element: start }).setLngLat([trail.start.lon, trail.start.lat]).addTo(map), el: start });
    trail.stops.forEach((s, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "es-trail-stop";
      el.style.setProperty("--stop", TRAIL_COLORS[i % TRAIL_COLORS.length]);
      el.style.setProperty("--delay", `${400 + i * 350}ms`);
      const num = document.createElement("span");
      num.className = "num";
      const digit = document.createElement("span");
      digit.textContent = String(i + 1);
      num.append(digit);
      const label = document.createElement("span");
      label.className = "label";
      const [h, m] = s.arriveAt.split(":").map(Number);
      label.textContent = `${s.place.name} · ~${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
      el.append(num, label);
      el.setAttribute("aria-label", `Stop ${i + 1}: ${s.place.name}, arrive around ${s.arriveAt}`);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const st = useElsewhere.getState();
        const fly = st.mapMode === "immersive";
        st.setTrailStop(i, { focus: fly });
        st.select(s.placeId, { focus: fly, detail: true });
      });
      trailMarkers.current.push({ marker: new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([s.place.lon, s.place.lat]).addTo(map), el });
    });
  }, [ready, trail]);

  useEffect(() => {
    trailMarkers.current.forEach(({ el, marker }, k) => {
      const on = k > 0 && k - 1 === trailStop; // the first marker is the start
      el.dataset.selected = String(on);
      el.dataset.mode = mapMode;
      marker.getElement().style.zIndex = on ? "30" : "20";
    });
  }, [trail, trailStop, mapMode]);

  // --- Trail route ------------------------------------------------------------
  // One geometry for both modes: the flat route here, the luminous 3D path in the Immersive layer.
  const trailGeo = useMemo(() => (trail ? trailGeometry(trail) : null), [trail]);
  const routeKey = trail && trailGeo ? `${trail.id}|${trail.mode}|${trailGeo.path.length}|${trail.stops.map((s) => s.placeId).join(",")}` : "";
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.getLayer("es-trail-line")) return;
    const src = map.getSource("es-trail") as maplibregl.GeoJSONSource;
    const est = map.getSource("es-trail-est") as maplibregl.GeoJSONSource;
    if (!trailGeo) {
      src.setData(emptyFC);
      est.setData(emptyFC);
      map.setPaintProperty("es-trail-flow", "line-opacity", 0);
      return;
    }
    src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: trailGeo.path } });
    est.setData({ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: trailGeo.estimated } });
    const set = (p: number) => {
      map.setPaintProperty("es-trail-line", "line-gradient", routeGradient(trailGeo.colors, p));
      map.setPaintProperty("es-trail-glow", "line-gradient", routeGradient(trailGeo.colors, p));
    };
    if (prefersReducedMotion() || lowPower) {
      set(1);
      map.setPaintProperty("es-trail-flow", "line-opacity", 0);
      return;
    }
    // Draw the route in from the start, then keep a soft light flowing along it.
    let raf = 0;
    const t0 = performance.now();
    let lastFlow = 0;
    let step = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const k = Math.min(1, (t - t0) / 1800);
      if (k < 1) return set(1 - (1 - k) ** 3);
      if (lastFlow === 0) {
        set(1);
        map.setPaintProperty("es-trail-flow", "line-opacity", 0.85);
      }
      if (t - lastFlow > 70) {
        lastFlow = t;
        step = (step + 1) % FLOW_DASHES.length;
        map.setPaintProperty("es-trail-flow", "line-dasharray", FLOW_DASHES[step]);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- replays only when the route itself changes
  }, [ready, routeKey, lowPower]);

  useEffect(() => {
    const layer = immersive.current;
    if (!layer) return;
    layer.setTrail(
      trail && trailGeo
        ? {
            key: routeKey,
            path: trailGeo.path,
            colors: trailGeo.colors,
            stops: trail.stops.map((s, i) => ({ lon: s.place.lon, lat: s.place.lat, color: TRAIL_COLORS[i % TRAIL_COLORS.length], selected: i === trailStop })),
          }
        : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- routeKey stands in for the route
  }, [routeKey, trailStop, mapMode, immersiveVersion]);

  useEffect(() => {
    immersive.current?.setAnimate(!prefersReducedMotion() && !lowPower);
  }, [lowPower, immersiveVersion]);

  // --- Frame new results, respecting user control ----------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !fitRequest) return;
    if (userMovedAt.current > searchStartedAt) {
      setShowResultsChip(true);
      return;
    }
    frameResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitRequest]);

  function frameResults() {
    const map = mapRef.current;
    const s = useElsewhere.getState();
    if (!map || !s.location) return;
    setShowResultsChip(false);
    const pts = s.trail
      ? [...trailGeometry(s.trail).bounds, ...s.trail.stops.map((x) => [x.place.lon, x.place.lat] as [number, number])]
      : s.orderedRecommendations().slice(0, 6).map((r) => [r.place.lon, r.place.lat] as [number, number]);
    if (!pts.length) return;
    const bounds = new maplibregl.LngLatBounds([s.location.lon, s.location.lat], [s.location.lon, s.location.lat]);
    pts.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, {
      padding: panelPadding(),
      maxZoom: 16.5,
      duration: prefersReducedMotion() ? 0 : 1200,
      pitch: s.mapMode === "immersive" ? 58 : 0,
      bearing: s.mapMode === "immersive" ? -18 : 0,
    });
  }

  // --- Focus a place ----------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focusRequest) return;
    const place = useElsewhere.getState().findPlace(focusRequest.placeId);
    if (!place) return;
    const previous = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
    requestAnimationFrame(() => setBackTo(previous));
    const immersiveOn = useElsewhere.getState().mapMode === "immersive";
    map.flyTo({
      center: [place.lon, place.lat],
      // Immersive comes in close enough for the building itself to read.
      zoom: Math.max(map.getZoom(), immersiveOn ? 17.3 : 16.6),
      pitch: immersiveOn ? 62 : map.getPitch(),
      bearing: immersiveOn ? map.getBearing() - 12 : map.getBearing(),
      padding: panelPadding(),
      duration: prefersReducedMotion() ? 0 : 1500,
      curve: 1.3,
      essential: false,
    });
    const t = setTimeout(() => setBackTo(null), 9000);
    return () => clearTimeout(t);
  }, [ready, focusRequest]);

  // --- Explore ↔ Immersive ----------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const reduce = prefersReducedMotion();
    const on = mapMode === "immersive";
    map.setLayoutProperty("building-3d", "visibility", on ? "visible" : "none");
    map.setPaintProperty("building", "fill-opacity", on ? 0 : 1);
    map.setPaintProperty("background", "background-color", on ? "#F9ECE6" : "#FBF1EA");
    let settle: (() => void) | null = null;
    if (on) {
      map.setSky(useElsewhere.getState().tasteLayer && highlightRef.current.length ? TASTE_SKY : IMMERSIVE_SKY);
      map.setLight({ anchor: "map", color: "#FFF0E4", intensity: 0.22, position: [1.35, 210, 38] });
      if (!map.getLayer("es-immersive")) {
        try {
          const layer = new ImmersiveLayer({ animate: !reduce && !useElsewhere.getState().lowPower });
          layer.onError = () => {
            if (map.getLayer("es-immersive")) map.removeLayer("es-immersive");
            immersive.current = null;
          };
          map.addLayer(layer);
          immersive.current = layer;
          layer.setPoints(immersivePoints(new Map(highlightRef.current.map((h) => [h.placeId, h])), footprints.current));
          // Hand the new layer its taste buildings (that effect ran before this layer existed).
          requestAnimationFrame(() => setImmersiveVersion((v) => v + 1));
        } catch (e) {
          console.warn("[immersive] falling back to extrusions only", e);
        }
      }
      map.easeTo({ pitch: 58, bearing: map.getBearing() || -18, zoom: Math.max(map.getZoom(), 15.4), duration: reduce ? 0 : 1100 });
      // Lock the zoom floor once the camera has arrived, so the transition itself isn't clipped.
      settle = () => {
        if (useElsewhere.getState().mapMode === "immersive") map.setMinZoom(IMMERSIVE_MIN_ZOOM);
      };
      if (reduce) settle();
      else map.once("moveend", settle);
    } else {
      if (map.getLayer("es-immersive")) map.removeLayer("es-immersive");
      immersive.current = null;
      map.setMinZoom(3);
      map.easeTo({ pitch: 0, bearing: 0, duration: reduce ? 0 : 900 });
    }
    return () => {
      if (settle) map.off("moveend", settle);
    };
  }, [ready, mapMode]);

  if (failure) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-ivory via-peach to-lavender/60 p-8">
        <div className="max-w-sm rounded-[var(--radius-lg)] surface p-6 text-center">
          <p className="font-serif text-2xl text-aubergine">The map is resting.</p>
          <p className="mt-2 text-sm text-ink-soft">{failure}</p>
          <button onClick={() => setAttempt((a) => a + 1)} className="mt-4 rounded-full bg-aubergine px-4 py-2 text-sm text-ivory">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" aria-label="Map of places" role="region" />
      {!ready && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-gradient-to-br from-ivory via-peach/70 to-lavender/50">
          <p className="shimmer-text font-serif text-2xl italic">Drawing the neighbourhood…</p>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center gap-2 lg:top-[84px]">
        {backTo && (
          <button
            onClick={() => {
              mapRef.current?.flyTo({ ...backTo, duration: prefersReducedMotion() ? 0 : 900 });
              setBackTo(null);
            }}
            className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full surface px-3.5 text-[13px] font-medium text-aubergine animate-rise"
          >
            <Undo2 size={14} /> Back to where you were
          </button>
        )}
        {showResultsChip && (
          <button
            onClick={frameResults}
            className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-aubergine px-3.5 text-[13px] font-medium text-ivory shadow-[var(--shadow-lift)] animate-rise"
          >
            <Crosshair size={14} /> Show new results
          </button>
        )}
      </div>
    </div>
  );
}
