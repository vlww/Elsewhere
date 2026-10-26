"use client";

import { useMemo } from "react";
import { Footprints, RefreshCw, Sparkles, X } from "lucide-react";
import { useElsewhere } from "@/store/useElsewhere";
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

function TrailCard() {
  const trail = useElsewhere((s) => s.trail);
  const clearTrail = useElsewhere((s) => s.clearTrail);
  const select = useElsewhere((s) => s.select);
  if (!trail) return null;
  return (
    <section aria-label="Taste trail" className="rounded-[var(--radius-lg)] bg-gradient-to-br from-peach via-sunset/40 to-lavender/60 p-4 ring-1 ring-white/60 animate-rise">
      <div className="flex items-start justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-plum/80">
            <Footprints size={12} /> Taste Trail · {trail.totalWalkMin} min walking
          </p>
          <h3 className="mt-1 font-serif text-[22px] leading-tight text-aubergine">{trail.title}</h3>
        </div>
        <IconButton label="Clear trail" onClick={clearTrail} className="-mr-2 -mt-1 h-8 w-8">
          <X size={14} />
        </IconButton>
      </div>
      <ol className="mt-3 space-y-2">
        {trail.stops.map((s, i) => (
          <li key={s.placeId}>
            <button onClick={() => select(s.placeId, { focus: true })} className="flex w-full gap-2.5 text-left">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-aubergine text-[10.5px] font-semibold text-ivory">{i + 1}</span>
              <span className="min-w-0 text-[13px] leading-snug">
                <span className="font-semibold text-aubergine">{s.name}</span>
                <span className="text-ink-soft"> · {s.walkFromPrevMin} min {i === 0 ? "from start" : "on foot"}</span>
                <span className="block text-[12px] text-plum/90">{s.why}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11.5px] leading-snug text-plum/80">{trail.synthesisNote}</p>
    </section>
  );
}

export function TasteLensBar() {
  const lensMode = useElsewhere((s) => s.lensMode);
  const setLens = useElsewhere((s) => s.setLens);
  const tasteSignals = useElsewhere((s) => s.tasteSignals);
  const result = useElsewhere((s) => s.result);
  const setPanel = useElsewhere((s) => s.setPanel);
  const hasSignals = tasteSignals.length > 0;

  const diff = useMemo(() => {
    if (!result || !hasSignals) return null;
    const p = [...result.recommendations].sort((a, b) => a.practicalRank - b.practicalRank).slice(0, 5).map((r) => r.place.id);
    const t = [...result.recommendations].sort((a, b) => a.tasteRank - b.tasteRank).slice(0, 5).map((r) => r.place.id);
    const newcomers = t.filter((id) => !p.includes(id)).length;
    const reordered = t.filter((id, i) => p[i] !== id).length;
    return { newcomers, reordered };
  }, [result, hasSignals]);

  return (
    <div className="rounded-[var(--radius-lg)] bg-white/55 p-3 ring-1 ring-line">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-plum">
          <Sparkles size={13} className="text-lilac" /> Taste Lens
        </p>
        <Segmented
          label="Ranking lens"
          size="sm"
          value={hasSignals ? lensMode : "practical"}
          onChange={setLens}
          options={[
            { value: "practical", label: "Practical" },
            { value: "taste", label: "Taste-aware", disabled: !hasSignals, hint: hasSignals ? undefined : "Add an interest to compare" },
          ]}
        />
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-ink-soft">
        {!hasSignals ? (
          <>
            Same places, ranked two ways.{" "}
            <button onClick={() => setPanel("taste")} className="font-medium text-rose-deep underline-offset-2 hover:underline">
              Add a film, artist or author
            </button>{" "}
            to see what changes.
          </>
        ) : result?.taste.status === "error" ? (
          <span className="text-[#8A4E2C]">{result.taste.message} Showing practical ranking.</span>
        ) : diff && diff.reordered === 0 ? (
          <>Your interests don&apos;t meaningfully change the top five here — these places fit either way.</>
        ) : diff ? (
          <>
            With {tasteSignals.map((e) => e.name).join(", ")}: {diff.reordered} of the top five shift
            {diff.newcomers ? `, ${diff.newcomers} new` : ""}. Arrows show movement vs practical.
          </>
        ) : null}
      </p>
      {hasSignals && result?.taste.mode === "demo" && (
        <p className="mt-1.5 text-[11.5px] text-[#7A6320]">Demo mode: cultural signals are simulated, not from Qloo.</p>
      )}
    </div>
  );
}

export function ResultsPanel() {
  const result = useElsewhere((s) => s.result);
  const searching = useElsewhere((s) => s.searching);
  const searchError = useElsewhere((s) => s.searchError);
  const runSearch = useElsewhere((s) => s.runSearch);
  const hidden = useElsewhere((s) => s.hiddenCategories);
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
  const visible = ordered.filter((r) => !hidden.includes(r.place.category));
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
            <h2 className="font-serif text-[26px] leading-none text-aubergine">
              {searching ? "Looking around…" : visible.length ? "A few places came to mind" : result ? "Nothing quite fits" : "Let's explore"}
            </h2>
            {result && !searching && (
              <p className="mt-1.5 text-[12px] text-ink-faint">
                {visible.length} of {result.inventory.count} nearby · within {constraints.radiusM >= 1000 ? `${(constraints.radiusM / 1000).toFixed(1)} km` : `${constraints.radiusM} m`} · {result.inventory.provider}
              </p>
            )}
          </div>
          <IconButton label="Refresh results" onClick={() => runSearch()} disabled={searching}>
            <RefreshCw size={15} className={cx(searching && "animate-spin")} />
          </IconButton>
        </div>
        <TasteLensBar />
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
                const on = !hidden.includes(c);
                const Icon = CATEGORY_META[c].icon;
                return (
                  <button
                    key={c}
                    aria-pressed={on}
                    onClick={() => toggleCategory(c)}
                    className={cx(
                      "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium ring-1 transition-colors",
                      on ? "bg-white/80 text-plum ring-line" : "bg-transparent text-ink-faint line-through ring-line/60",
                    )}
                  >
                    <Icon size={11} /> {CATEGORY_LABEL[c]} <span className="text-ink-faint">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {result?.inventory.note && <p className="px-1 text-[11.5px] text-[#7A6320]">{result.inventory.note}</p>}
      </div>

      <div className="scroll-soft min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-4">
        <TrailCard />
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
              <PlaceCard key={r.place.id} rec={r} index={i} showAddress={repeated.has(r.place.name)} movement={tasteOn && sortMode === "fit" ? r.practicalRank - r.tasteRank : undefined} />
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
            {hidden.length > 0 && (
              <>
                {" "}or{" "}
                <button onClick={() => hidden.forEach(toggleCategory)} className="font-semibold text-rose-deep hover:underline">
                  show hidden kinds
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
