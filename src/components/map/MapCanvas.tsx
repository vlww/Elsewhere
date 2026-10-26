"use client";

import { useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as maplibregl from "maplibre-gl";
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { Bookmark, Undo2, Crosshair } from "lucide-react";
import { useElsewhere } from "@/store/useElsewhere";
import type { Recommendation } from "@/types";
import { CATEGORY_LABEL, CATEGORY_META } from "@/components/places/categoryMeta";
import { BASE_STYLE_URL, buildElsewhereStyle, IMMERSIVE_SKY } from "./mapStyle";
import { ImmersiveLayer } from "./ImmersiveLayer";
import { mapRef, panelPadding, prefersReducedMotion } from "./mapRef";

const MARKER_LIMIT = 14;
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

/** The top recommendations as floating 3D markers, in the same order and filter as the DOM markers. */
function immersivePoints() {
  const s = useElsewhere.getState();
  return s
    .orderedRecommendations()
    .filter((r) => !s.hiddenCategories.includes(r.place.category))
    .slice(0, 10)
    .map((r) => ({
      id: r.place.id,
      lat: r.place.lat,
      lon: r.place.lon,
      color: CATEGORY_META[r.place.category].color,
      selected: r.place.id === s.selectedPlaceId,
      isNew: true,
    }));
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
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const immersive = useRef<ImmersiveLayer | null>(null);
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
        map.addSource("es-trail", { type: "geojson", data: emptyFC });
        map.addLayer({
          id: "es-trail-line",
          type: "line",
          source: "es-trail",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#B8668A", "line-width": 3.5, "line-opacity": 0.85, "line-dasharray": [0.5, 1.8] },
        });

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
    return () => {
      cancelled = true;
      for (const m of markerMap.values()) {
        m.marker.remove();
        queueMicrotask(() => m.root.unmount());
      }
      markerMap.clear();
      extraMarkers.current.forEach((m) => m.remove());
      userMarker.current?.remove();
      userMarker.current = null;
      immersive.current = null;
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
    const visible = ordered.filter((r) => !hiddenCategories.includes(r.place.category));
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
          useElsewhere.getState().select(r.place.id, { focus: false });
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
      const key = `${i}|${selected}|${immersiveOn}`;
      entry.el.dataset.selected = String(selected);
      entry.el.dataset.shape = immersiveOn ? "round" : meta.shape;
      entry.el.dataset.mode = immersiveOn ? "immersive" : "explore";
      entry.el.dataset.dimmed = String(!!selectedPlaceId && !selected && hoveredPlaceId !== r.place.id);
      entry.el.style.setProperty("--pin-bg", meta.color);
      entry.el.setAttribute("aria-label", `${i + 1}. ${r.place.name}, ${CATEGORY_LABEL[r.place.category]}, ${r.walkMin} minute walk`);
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

    immersive.current?.setPoints(immersivePoints());
  }, [ready, result, hiddenCategories, selectedPlaceId, hoveredPlaceId, lensMode, sortMode, tasteSignals.length, mapMode]);

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
    if (trail) {
      trail.stops.forEach((s, i) => {
        const el = document.createElement("div");
        el.className = "es-trail-stop";
        el.textContent = String(i + 1);
        el.setAttribute("aria-label", `Trail stop ${i + 1}: ${s.name}`);
        el.setAttribute("role", "img");
        extraMarkers.current.push(new maplibregl.Marker({ element: el, offset: [0, -48] }).setLngLat([s.lon, s.lat]).addTo(map));
      });
    }
  }, [ready, saved, result, trail]);

  // --- Trail line -----------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const src = map.getSource("es-trail") as maplibregl.GeoJSONSource | undefined;
    const loc = useElsewhere.getState().location;
    if (!trail || !loc) return void src?.setData(emptyFC);
    src?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[loc.lon, loc.lat], ...trail.stops.map((s) => [s.lon, s.lat] as [number, number])] },
    });
  }, [ready, trail]);

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
      ? s.trail.stops.map((x) => [x.lon, x.lat] as [number, number])
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
      zoom: Math.max(map.getZoom(), 16.6),
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
    if (on) {
      map.setSky(IMMERSIVE_SKY);
      map.setLight({ anchor: "map", color: "#FFF0E4", intensity: 0.22, position: [1.35, 210, 38] });
      if (!map.getLayer("es-immersive")) {
        try {
          const layer = new ImmersiveLayer({ animate: !reduce });
          layer.onError = () => {
            if (map.getLayer("es-immersive")) map.removeLayer("es-immersive");
            immersive.current = null;
          };
          map.addLayer(layer);
          immersive.current = layer;
          layer.setPoints(immersivePoints());
        } catch (e) {
          console.warn("[immersive] falling back to extrusions only", e);
        }
      }
      map.easeTo({ pitch: 58, bearing: map.getBearing() || -18, zoom: Math.max(map.getZoom(), 15.4), duration: reduce ? 0 : 1100 });
    } else {
      if (map.getLayer("es-immersive")) map.removeLayer("es-immersive");
      immersive.current = null;
      map.easeTo({ pitch: 0, bearing: 0, duration: reduce ? 0 : 900 });
    }
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
      <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center gap-2 lg:top-5">
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
