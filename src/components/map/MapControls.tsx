"use client";

import { Box, Compass, LocateFixed, Map as MapIcon, Minus, Plus } from "lucide-react";
import { useElsewhere } from "@/store/useElsewhere";
import { IconButton, Segmented } from "@/components/ui/primitives";
import { mapRef, prefersReducedMotion } from "./mapRef";

export function MapControls() {
  const mapMode = useElsewhere((s) => s.mapMode);
  const setMapMode = useElsewhere((s) => s.setMapMode);
  const location = useElsewhere((s) => s.location);
  const d = () => (prefersReducedMotion() ? 0 : 500);

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-2">
      <div className="surface rounded-full p-1">
        <Segmented
          label="Map mode"
          size="sm"
          value={mapMode}
          onChange={setMapMode}
          options={[
            { value: "explore", label: <><MapIcon size={13} /> Explore</> },
            { value: "immersive", label: <><Box size={13} /> Immersive</>, hint: "3D city view with depth and light" },
          ]}
        />
      </div>
      <div className="surface flex flex-col rounded-full p-1">
        <IconButton label="Zoom in" onClick={() => mapRef.current?.zoomIn({ duration: d() })}>
          <Plus size={16} />
        </IconButton>
        <IconButton label="Zoom out" onClick={() => mapRef.current?.zoomOut({ duration: d() })}>
          <Minus size={16} />
        </IconButton>
        <IconButton
          label="Reset view angle"
          onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: mapMode === "immersive" ? 58 : 0, duration: d() })}
        >
          <Compass size={16} />
        </IconButton>
        <IconButton
          label="Back to search area"
          disabled={!location}
          onClick={() => location && mapRef.current?.flyTo({ center: [location.lon, location.lat], zoom: 15.2, duration: prefersReducedMotion() ? 0 : 1000 })}
        >
          <LocateFixed size={16} />
        </IconButton>
      </div>
    </div>
  );
}
