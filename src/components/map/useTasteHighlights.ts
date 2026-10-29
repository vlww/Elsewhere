"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { categoryShown, useElsewhere } from "@/store/useElsewhere";
import { rankedMatches, tasteHighlights, type TasteHighlight } from "@/lib/taste/highlights";
import { fallbackColor, type PlaceColor } from "@/lib/taste/placeColor";

/**
 * The Taste Layer's highlights for the current results. Uses the interests the results were computed
 * with (not ones added since), so the evidence and the highlight always describe the same search.
 */
export function useTasteHighlights() {
  return useTaste().highlights;
}

// Photo colours per place, shared by every component that shows highlights. null = no usable photo colour.
const colors = new Map<string, PlaceColor | null>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getVersion = () => version;

async function loadColors(items: { id: string; imageUrl: string }[]) {
  items.forEach((it) => pending.add(it.id));
  let got: Record<string, PlaceColor> = {};
  try {
    const res = await fetch("/api/place-colors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
    got = (await res.json()).colors ?? {};
  } catch {
    /* fall back to sunset colours */
  }
  for (const it of items) {
    colors.set(it.id, got[it.id] ?? null);
    pending.delete(it.id);
  }
  version++;
  listeners.forEach((fn) => fn());
}

/** Each highlight in its own colour: its photo's, softened to a pastel, else a sunset pastel. */
function withPlaceColors(hs: TasteHighlight[]): TasteHighlight[] {
  return hs.map((h) => {
    const c = colors.get(h.placeId) ?? fallbackColor(h.placeId);
    return { ...h, color: c.fill, deep: c.deep };
  });
}

/** Highlights plus how many places had any signal at all (for honest legend counts). */
export function useTaste() {
  const tasteLayer = useElsewhere((s) => s.tasteLayer);
  const result = useElsewhere((s) => s.result);
  const shown = useElsewhere((s) => s.shownCategories);
  const colorVersion = useSyncExternalStore(subscribe, getVersion, getVersion);

  const base = useMemo(() => {
    if (!tasteLayer || !result) return { highlights: [], matched: 0 };
    const recs = result.recommendations.filter((r) => categoryShown(shown, r.place.category));
    return { highlights: tasteHighlights(recs, result.tasteSignals), matched: rankedMatches(recs, result.tasteSignals).length };
  }, [tasteLayer, result, shown]);

  useEffect(() => {
    if (!result) return;
    const image = new Map(result.recommendations.map((r) => [r.place.id, r.place.imageUrl]));
    const missing = base.highlights.flatMap((h) => {
      const imageUrl = image.get(h.placeId);
      return imageUrl && !colors.has(h.placeId) && !pending.has(h.placeId) ? [{ id: h.placeId, imageUrl }] : [];
    });
    if (missing.length) void loadColors(missing);
  }, [base, result]);

  return useMemo(
    () => ({ ...base, highlights: withPlaceColors(base.highlights) }),
    // colorVersion re-applies colours as photos are read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, colorVersion],
  );
}
