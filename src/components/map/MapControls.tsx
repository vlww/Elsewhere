"use client";

import { Gauge, LocateFixed, Minus, Plus } from "lucide-react";
import { useElsewhere } from "@/store/useElsewhere";
import { IconButton } from "@/components/ui/primitives";
import { mapRef, prefersReducedMotion } from "./mapRef";

/**
 * A north needle that turns with the map's bearing and leans back with its pitch. MapCanvas writes
 * --map-bearing / --map-pitch on the root element, so this follows the camera without re-rendering.
 */
function CompassNeedle() {
  return (
    <span
      aria-hidden
      className="block h-[22px] w-[22px] [perspective:60px]"
      style={{ transform: "rotate(calc(var(--map-bearing, 0) * -1deg))" }}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-full w-full"
        style={{ transform: "rotateX(calc(var(--map-pitch, 0) * 0.6deg))" }}
      >
        <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.2" />
        <path d="M12 3.2 15 12h-6z" fill="#B8668A" />
        <path d="M12 20.8 9 12h6z" fill="currentColor" fillOpacity="0.35" />
        <circle cx="12" cy="12" r="1.3" fill="#FFF9F4" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.6" />
      </svg>
    </span>
  );
}

export function MapControls() {
  const mapMode = useElsewhere((s) => s.mapMode);
  const location = useElsewhere((s) => s.location);
  const lowPower = useElsewhere((s) => s.lowPower);
  const setLowPower = useElsewhere((s) => s.setLowPower);
  const d = () => (prefersReducedMotion() ? 0 : 500);

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-2">
      <div className="surface flex flex-col rounded-full p-1">
        <IconButton label="Zoom in" onClick={() => mapRef.current?.zoomIn({ duration: d() })}>
          <Plus size={16} />
        </IconButton>
        <IconButton label="Zoom out" onClick={() => mapRef.current?.zoomOut({ duration: d() })}>
          <Minus size={16} />
        </IconButton>
        <IconButton
          label="Face north"
          onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: mapMode === "immersive" ? 58 : 0, duration: d() })}
        >
          <CompassNeedle />
        </IconButton>
        <IconButton
          label="Back to search area"
          disabled={!location}
          onClick={() => location && mapRef.current?.flyTo({ center: [location.lon, location.lat], zoom: 15.2, duration: prefersReducedMotion() ? 0 : 1000 })}
        >
          <LocateFixed size={16} />
        </IconButton>
        <IconButton
          label={lowPower ? "Effects reduced. Turn full effects back on" : "Reduce effects (lighter 3D, no ambient animation)"}
          aria-pressed={lowPower}
          onClick={() => setLowPower(!lowPower)}
          className={lowPower ? "bg-aubergine/10 text-rose-deep" : undefined}
        >
          <Gauge size={16} />
        </IconButton>
      </div>
    </div>
  );
}
