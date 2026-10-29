"use client";

import { useState } from "react";
import { Box, ChevronDown, Map as MapIcon, Sparkles } from "lucide-react";
import { useElsewhere } from "@/store/useElsewhere";
import { interestColors, type TasteHighlight } from "@/lib/taste/highlights";
import { Chip, cx, Segmented } from "@/components/ui/primitives";
import { useTaste } from "./useTasteHighlights";

/**
 * How the map is drawn: Explore (2D) or Immersive (3D), with the Taste Layer on top of either.
 * All three are presentations of the same results; switching never re-runs a search.
 */
export function MapModeDock({ compact = false }: { compact?: boolean }) {
  const mapMode = useElsewhere((s) => s.mapMode);
  const setMapMode = useElsewhere((s) => s.setMapMode);
  const tasteLayer = useElsewhere((s) => s.tasteLayer);
  const setTasteLayer = useElsewhere((s) => s.setTasteLayer);
  const { highlights, matched } = useTaste();

  return (
    // Docked at the bottom on desktop (legend rises above), at the top on phones (legend drops below).
    <div className={cx("pointer-events-auto flex items-start gap-2", compact ? "flex-col-reverse" : "flex-col")}>
      {tasteLayer && <TasteLegend highlights={highlights} matched={matched} compact={compact} />}
      <div className="surface flex flex-col gap-1 rounded-[22px] p-1">
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
        <button
          role="switch"
          aria-checked={tasteLayer}
          onClick={() => setTasteLayer(!tasteLayer)}
          className={cx(
            "group relative flex h-8 items-center gap-2 overflow-hidden rounded-full pl-3 pr-1.5 text-[12px] font-medium transition-colors",
            tasteLayer ? "text-aubergine" : "text-ink-soft hover:text-aubergine",
          )}
        >
          <span
            aria-hidden
            className={cx(
              "absolute inset-0 rounded-full bg-[linear-gradient(100deg,#FBD3DF_0%,#E6DAFA_38%,#FCE0CC_70%,#F8EBB4_100%)] transition-opacity duration-500",
              tasteLayer ? "opacity-100" : "opacity-0 group-hover:opacity-40",
            )}
          />
          <Sparkles size={13} className={cx("relative transition-colors", tasteLayer ? "text-rose-deep" : "")} />
          <span className="relative flex-1 text-left">Taste Layer</span>
          <span
            aria-hidden
            className={cx("relative block h-[18px] w-8 shrink-0 rounded-full transition-colors duration-300", tasteLayer ? "bg-rose-deep" : "bg-aubergine/15")}
          >
            <span
              className={cx(
                "absolute left-0 top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform duration-300 ease-[var(--ease-out-soft)]",
                tasteLayer ? "translate-x-[16px]" : "translate-x-[2px]",
              )}
            />
          </span>
        </button>
      </div>
    </div>
  );
}

function TasteLegend({ highlights, matched, compact }: { highlights: TasteHighlight[]; matched: number; compact: boolean }) {
  const result = useElsewhere((s) => s.result);
  const searching = useElsewhere((s) => s.searching);
  const mapMode = useElsewhere((s) => s.mapMode);
  const signals = useElsewhere((s) => s.tasteSignals);
  const { setPanel, setMobileTab } = useElsewhere.getState();
  // Summary and colour key always show; the tier key and fine print fold away.
  const [open, setOpen] = useState(false);

  const used = result?.tasteSignals ?? [];
  const colors = interestColors(used);
  const counts = new Map<string, number>();
  for (const h of highlights) if (h.entityId) counts.set(h.entityId, (counts.get(h.entityId) ?? 0) + 1);
  const demo = highlights[0]?.provenance === "demo" || result?.taste.mode === "demo";
  const strong = highlights.filter((h) => h.tier === "strong").length;

  let body: React.ReactNode;
  if (!signals.length) {
    body = (
      <>
        <p>Tell Elsewhere what you love — a vibe, a cuisine, a film, an artist — and places that line up with it light up here.</p>
        <button
          onClick={() => {
            setPanel("taste");
            setMobileTab("places");
          }}
          className="mt-2 inline-flex h-7 items-center gap-1 rounded-full bg-aubergine px-3 text-[11.5px] font-medium text-ivory"
        >
          <Sparkles size={12} /> Add interests
        </button>
      </>
    );
  } else if (searching || !result) {
    body = <p className="shimmer-text">Reading your interests against the map…</p>;
  } else if (result.taste.status === "error") {
    body = <p className="text-[#8A4E2C]">{result.taste.message ?? "Cultural matching failed."} Nothing is highlighted rather than guessing.</p>;
  } else if (!highlights.length) {
    body = (
      <p>
        {result.taste.status === "no-signals" && result.taste.message
          ? result.taste.message
          : `${demo ? "The demo fixture" : "Qloo"} has no affinity signal for ${used.map((e) => e.name).join(", ") || "your interests"} among these ${result.recommendations.length} places. Try a wider radius or another interest.`}
      </p>
    );
  } else {
    body = (
      <>
        <p>
          Lighting up the <span className="font-semibold text-aubergine">{highlights.length}</span> strongest
          {matched > highlights.length ? <> of {matched}</> : null} places that line up with your interests
          {strong ? <> (<span className="font-semibold text-aubergine">{strong}</span> standouts)</> : null}.
        </p>
        {!compact || open ? (
          <ul className="mt-2 flex flex-wrap gap-1" aria-label="Colour key: which interest led">
              {used.map((e) => (
                <li key={e.id} className="inline-flex items-center gap-1.5 rounded-full bg-white/70 py-0.5 pl-1 pr-2 text-[11px] text-plum ring-1 ring-line">
                  <span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ background: colors.get(e.id)?.fill }} aria-hidden />
                  {e.name}
                  <span className="tabular-nums text-ink-faint">{counts.get(e.id) ?? 0}</span>
                </li>
              ))}
          </ul>
        ) : null}
        {open && (
          <>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-ink-soft">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-3 rounded-full bg-sunset shadow-[0_0_0_2px_#fff,0_0_0_4px_#B8668A]" /> Standout
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-3 rounded-full bg-sunset/60 shadow-[0_0_0_2px_#fff,0_0_0_3px_rgba(184,102,138,0.45)]" /> Good match
              </span>
              <span className="col-span-2 flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-5 rounded-full bg-[radial-gradient(closest-side,rgba(217,190,240,0.9),rgba(242,185,200,0.3),transparent)]" />
                Wash: where several matches cluster
              </span>
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-ink-faint">
              {mapMode === "immersive"
                ? "Coloured buildings are stylised illustrations on real OpenStreetMap footprints, not exact architecture. Where none is mapped, a small pavilion marks the spot."
                : "Tinted outlines are the real buildings these places are in (OpenStreetMap)."}{" "}
              Colour shows which interest contributed most; it isn&apos;t a claim about their style.{" "}
              {demo ? "Simulated in demo mode, not Qloo results." : "Matches come from Qloo Insights affinity for these places."}
            </p>
          </>
        )}
      </>
    );
  }

  return (
    <section
      aria-label="Taste Layer legend"
      className={cx("surface w-[min(300px,calc(100vw-24px))] rounded-[var(--radius-lg)] p-3 text-[12px] leading-snug text-ink-soft animate-rise")}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <Sparkles size={13} className="text-rose-deep" />
        <h2 className="flex-1 text-[12px] font-semibold text-plum">Taste Layer</h2>
        {signals.length > 0 && (demo ? <Chip tone="demo" className="px-2 py-0 text-[10.5px]">Simulated</Chip> : <Chip tone="taste" className="px-2 py-0 text-[10.5px]">Qloo</Chip>)}
        {highlights.length > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Hide legend details" : "Show legend details"}
            className="grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:bg-aubergine/[0.06] hover:text-aubergine"
          >
            <ChevronDown size={14} className={cx("transition-transform", open && "rotate-180")} />
          </button>
        )}
      </div>
      {body}
      <div aria-live="polite">
      </div>
    </section>
  );
}
