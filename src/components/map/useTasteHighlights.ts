"use client";

import { useMemo } from "react";
import { useElsewhere } from "@/store/useElsewhere";
import { rankedMatches, tasteHighlights } from "@/lib/taste/highlights";

/**
 * The Taste Layer's highlights for the current results. Uses the interests the results were computed
 * with (not ones added since), so the evidence and the highlight always describe the same search.
 */
export function useTasteHighlights() {
  return useTaste().highlights;
}

/** Highlights plus how many places had any signal at all (for honest legend counts). */
export function useTaste() {
  const tasteLayer = useElsewhere((s) => s.tasteLayer);
  const result = useElsewhere((s) => s.result);
  const hidden = useElsewhere((s) => s.hiddenCategories);
  return useMemo(() => {
    if (!tasteLayer || !result) return { highlights: [], matched: 0 };
    const recs = result.recommendations.filter((r) => !hidden.includes(r.place.category));
    return { highlights: tasteHighlights(recs, result.tasteSignals), matched: rankedMatches(recs, result.tasteSignals).length };
  }, [tasteLayer, result, hidden]);
}
