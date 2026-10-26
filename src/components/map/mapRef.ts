import type * as maplibregl from "maplibre-gl";

/** The single live map instance, for controls that sit outside MapCanvas. */
export const mapRef: { current: maplibregl.Map | null } = { current: null };

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Space taken by floating panels, so the camera frames results in the visible part of the map. */
export function panelPadding() {
  if (typeof window === "undefined") return { top: 80, bottom: 80, left: 80, right: 80 };
  if (window.innerWidth >= 1024) {
    // Panel widths are fluid (clamp()), so measure the panels themselves.
    const left = document.querySelector<HTMLElement>("[data-panel=chat]")?.offsetWidth ?? 0;
    const right = document.querySelector<HTMLElement>("[data-panel=side]")?.offsetWidth ?? 400;
    return { top: 110, bottom: 90, left: left + 60, right: right + 60 };
  }
  return { top: 90, bottom: Math.round(window.innerHeight * 0.42), left: 40, right: 40 };
}
