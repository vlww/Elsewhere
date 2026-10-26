import opening_hours from "opening_hours";
import type { OpenState, Place } from "@/types";

/**
 * Turns the client's local wall-clock time ("YYYY-MM-DDTHH:mm") into a Date whose
 * local fields match it, so OSM opening_hours (which are local time) evaluate correctly
 * regardless of the server's timezone.
 */
export function wallClockDate(clientNow: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(clientNow);
  if (!m) return new Date();
  const [, y, mo, d, h, mi] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi);
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "");
}

export function evaluateOpenState(place: Place, now: Date): OpenState {
  if (place.openingHoursRaw) {
    const source = place.source === "google" ? "Google Places" : "OpenStreetMap";
    try {
      const oh = new opening_hours(place.openingHoursRaw, null, { mode: 0, tag_key: "opening_hours" } as never);
      if (oh.getUnknown(now)) return { status: "unknown", detail: "Hours listed but ambiguous right now", source };
      const open = oh.getState(now);
      const next = oh.getNextChange(now);
      const sameDay = next && next.toDateString() === now.toDateString();
      if (open) {
        return {
          status: "open",
          detail: next ? `Open until ${fmtTime(next)}${sameDay ? "" : " tomorrow"}` : "Open (listed 24/7)",
          source,
          closesInMin: next ? Math.round((next.getTime() - now.getTime()) / 60000) : undefined,
        };
      }
      return {
        status: "closed",
        detail: next ? `Closed · opens ${sameDay ? "" : next.toLocaleDateString("en-US", { weekday: "short" }) + " "}${fmtTime(next)}` : "Closed",
        source,
      };
    } catch {
      return { status: "unknown", detail: "Listed hours couldn't be read", source };
    }
  }
  if (place.openNowReported !== undefined) {
    return {
      status: place.openNowReported ? "open" : "closed",
      detail: place.openNowReported ? "Reported open when fetched" : "Reported closed when fetched",
      source: "Google Places",
    };
  }
  return { status: "unknown", detail: "Hours not listed — check before going" };
}
