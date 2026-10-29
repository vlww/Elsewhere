"use client";

import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { categoryShown, useElsewhere } from "@/store/useElsewhere";
import type { PlaceCategory } from "@/types";
import { cx, IconButton, Segmented } from "@/components/ui/primitives";
import { CATEGORY_LABEL, CATEGORY_META } from "./categoryMeta";
import { PlaceCard } from "./PlaceCard";

function Skeleton() {
  return (
    <div className="space-y-2.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3 rounded-[var(--radius-lg)] bg-white/60 p-3 ring-1 ring-line">
          <div className="h-[76px] w-[76px] animate-pulse rounded-[14px] bg-peach/70" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-4 w-2/3 animate-pulse rounded bg-peach/70" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-peach/50" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-peach/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResultsPanel() {
  const result = useElsewhere((s) => s.result);
  const searching = useElsewhere((s) => s.searching);
  const searchError = useElsewhere((s) => s.searchError);
  const runSearch = useElsewhere((s) => s.runSearch);
  const shown = useElsewhere((s) => s.shownCategories);
  const toggleCategory = useElsewhere((s) => s.toggleCategory);
  const sortMode = useElsewhere((s) => s.sortMode);
  const setSortMode = useElsewhere((s) => s.setSortMode);
  const lensMode = useElsewhere((s) => s.lensMode);
  const tasteOn = useElsewhere((s) => s.lensMode === "taste" && s.tasteSignals.length > 0);
  const location = useElsewhere((s) => s.location);
  const constraints = useElsewhere((s) => s.constraints);
  // Re-sort whenever lens/sort/result change.
  const ordered = useMemo(
    () => useElsewhere.getState().orderedRecommendations(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, lensMode, sortMode, tasteOn],
  );
  const visible = ordered.filter((r) => categoryShown(shown, r.place.category));
  // Chains have several branches nearby; show addresses when names repeat.
  const repeated = new Set(visible.map((r) => r.place.name).filter((n, i, a) => a.indexOf(n) !== i));
  const cats = useMemo(() => {
    const c = new Map<PlaceCategory, number>();
    for (const r of ordered) c.set(r.place.category, (c.get(r.place.category) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [ordered]);

  if (!location) {
    return <p className="px-5 py-6 text-[13.5px] text-ink-soft">Pick a place to start and recommendations will appear here.</p>;
  }

  return (
    <section aria-label="Recommendations" className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 px-4 pb-3 pt-4">
        <div className="flex items-end justify-between gap-2 px-1">
          <div>
            <h2 className="font-serif text-[26px] leading-none text-aubergine">Explore</h2>
            <p className="mt-1.5 text-[12px] text-ink-faint">
              {searching
                ? "Looking around…"
                : !result
                  ? "Pick a spot to start."
                  : visible.length
                    ? `A few places came to mind. ${visible.length} within ${constraints.radiusM >= 1000 ? `${(constraints.radiusM / 1000).toFixed(1)} km` : `${constraints.radiusM} m`}`
                    : "Nothing quite fits."}
            </p>
          </div>
          <IconButton label="Refresh results" onClick={() => runSearch()} disabled={searching}>
            <RefreshCw size={15} className={cx(searching && "animate-spin")} />
          </IconButton>
        </div>
        {cats.length > 1 && (
          <div className="flex items-center gap-2">
            <Segmented
              label="Sort"
              size="sm"
              value={sortMode}
              onChange={setSortMode}
              options={[
                { value: "fit", label: "Best fit" },
                { value: "distance", label: "Nearest" },
              ]}
            />
            <div className="scroll-soft -mr-4 flex flex-1 gap-1 overflow-x-auto pb-1 pr-4" role="group" aria-label="Filter by kind">
              {cats.map(([c, n]) => {
                const on = shown.includes(c);
                const Icon = CATEGORY_META[c].icon;
                return (
                  <button
                    key={c}
                    aria-pressed={on}
                    onClick={() => toggleCategory(c)}
                    className={cx(
                      "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium ring-1 transition-colors",
                      on ? "bg-aubergine text-ivory ring-aubergine" : "bg-white/70 text-plum ring-line hover:bg-white",
                    )}
                  >
                    <Icon size={11} /> {CATEGORY_LABEL[c]} <span className={on ? "text-ivory/70" : "text-ink-faint"}>{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {result?.inventory.note && <p className="px-1 text-[11.5px] text-[#7A6320]">{result.inventory.note}</p>}
      </div>

      <div className="scroll-soft min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-4">
        {searchError && (
          <div className="rounded-[var(--radius-md)] bg-apricot/25 p-3.5 text-[13px] text-[#7A4426] ring-1 ring-apricot/40">
            {searchError}
            <button onClick={() => runSearch()} className="ml-2 font-semibold underline-offset-2 hover:underline">
              Try again
            </button>
          </div>
        )}
        {searching && !result ? (
          <Skeleton />
        ) : (
          <div className={cx("space-y-2.5 transition-opacity", searching && "opacity-50")}>
            {visible.slice(0, 20).map((r, i) => (
              <PlaceCard key={r.place.id} rec={r} index={i} showAddress={repeated.has(r.place.name)} />
            ))}
          </div>
        )}
        {result && !searching && !visible.length && (
          <div className="rounded-[var(--radius-lg)] bg-white/60 p-4 text-[13px] leading-relaxed text-plum ring-1 ring-line">
            Nothing fits every constraint here.{" "}
            {result.filteredOut.length > 0 && (
              <>Most were ruled out for: {[...new Set(result.filteredOut.map((f) => f.reason))].slice(0, 3).join("; ")}. </>
            )}
            <button onClick={() => runSearch({ radiusM: Math.min(8000, constraints.radiusM * 2) })} className="font-semibold text-rose-deep hover:underline">
              Look a little further
            </button>
            {shown.length > 0 && (
              <>
                {" "}or{" "}
                <button onClick={() => shown.forEach(toggleCategory)} className="font-semibold text-rose-deep hover:underline">
                  show every kind
                </button>
              </>
            )}
            .
          </div>
        )}
        {result && (
          <p className="px-1 pt-2 text-[10.5px] leading-snug text-ink-faint">
            Place data: {result.inventory.provider}. Hours and amenities are as listed by the source; check before you go.
          </p>
        )}
      </div>
    </section>
  );
}
