"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Bookmark, ChevronDown, Columns3, Eye, Sparkles, ThumbsDown, ThumbsUp, Wifi } from "lucide-react";
import { useElsewhere } from "@/store/useElsewhere";
import type { FeedbackReason, Recommendation } from "@/types";
import { Chip, cx } from "@/components/ui/primitives";
import { PlaceArt } from "./PlaceArt";
import { CATEGORY_LABEL, CATEGORY_META } from "./categoryMeta";
import { CulturalBlock, PracticalList } from "./evidence";

const FEEDBACK: { reason: FeedbackReason; label: string }[] = [
  { reason: "not-for-me", label: "Not for me" },
  { reason: "too-far", label: "Too far" },
  { reason: "too-expensive", label: "Too expensive" },
  { reason: "too-busy", label: "Too busy" },
  { reason: "already-been", label: "Already been" },
];

function OpenChip({ rec }: { rec: Recommendation }) {
  const s = rec.openState.status;
  return (
    <Chip tone={s === "open" ? "good" : s === "closed" ? "warn" : "muted"}>
      {s === "open" ? rec.openState.detail : s === "closed" ? "Closed now" : "Hours not listed"}
    </Chip>
  );
}

export function PlaceCard({ rec, index, movement, showAddress = false }: { rec: Recommendation; index: number; movement?: number; showAddress?: boolean }) {
  const p = rec.place;
  const selected = useElsewhere((s) => s.selectedPlaceId === p.id);
  const hovered = useElsewhere((s) => s.hoveredPlaceId === p.id);
  const isSaved = useElsewhere((s) => !!s.saved[p.id]);
  const inCompare = useElsewhere((s) => s.compareIds.includes(p.id));
  const tasteOn = useElsewhere((s) => s.lensMode === "taste" && s.tasteSignals.length > 0);
  const { select, hover, toggleSave, toggleCompare, giveFeedback } = useElsewhere.getState();
  const [why, setWhy] = useState(false);
  const [fbOpen, setFbOpen] = useState(false);
  const meta = CATEGORY_META[p.category];
  const Icon = meta.icon;
  const topContributor = rec.cultural ? [...rec.cultural.contributions].sort((a, b) => b.score - a.score)[0] : undefined;

  return (
    <article
      onMouseEnter={() => hover(p.id)}
      onMouseLeave={() => hover(null)}
      aria-label={`${index + 1}. ${p.name}`}
      className={cx(
        "group relative overflow-hidden rounded-[var(--radius-lg)] bg-white/75 ring-1 transition-[box-shadow,transform,background] duration-300",
        selected ? "bg-white ring-rose/50 shadow-[var(--shadow-lift)]" : hovered ? "ring-line-strong shadow-[var(--shadow-card)]" : "ring-line",
      )}
    >
      <button onClick={() => select(p.id, { focus: true })} className="flex w-full gap-3 p-3 text-left" aria-describedby={`sum-${p.id}`}>
        <div className="relative shrink-0">
          <PlaceArt place={p} className="h-[76px] w-[76px] rounded-[14px]" />
          <span className="absolute -left-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-aubergine px-1 text-[11px] font-semibold text-ivory ring-2 ring-white">
            {index + 1}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-serif text-[21px] leading-[1.1] text-aubergine">{p.name}</h3>
            {movement !== undefined && movement !== 0 && (
              <span
                className={cx(
                  "mt-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums",
                  movement > 0 ? "bg-lavender/80 text-[#5A4791]" : "bg-aubergine/[0.05] text-ink-faint",
                )}
                title={`${movement > 0 ? "Up" : "Down"} ${Math.abs(movement)} vs practical ranking`}
              >
                {movement > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                {Math.abs(movement)}
              </span>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-soft">
            <Icon size={12} aria-hidden /> {CATEGORY_LABEL[p.category]} · {rec.walkMin} min walk
            {p.priceLevel ? ` · ${"$".repeat(p.priceLevel)}` : ""}
          </p>
          {showAddress && p.address && <p className="truncate text-[11.5px] text-ink-faint">{p.address}</p>}
          <div id={`sum-${p.id}`} className="mt-2 flex flex-wrap gap-1">
            <OpenChip rec={rec} />
            {p.wifi === "yes" && (
              <Chip tone="neutral">
                <Wifi size={10} /> Wi-Fi listed
              </Chip>
            )}
            {p.outdoorSeating === "yes" && <Chip tone="neutral">Outdoor seats</Chip>}
            {tasteOn && rec.cultural && (
              <Chip tone={rec.cultural.provenance === "demo" ? "demo" : "taste"}>
                <Sparkles size={10} />
                {topContributor ? `via ${topContributor.entityName}` : "Cultural signal"}
              </Chip>
            )}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-0.5 border-t border-line/70 px-2 py-1">
        <button
          onClick={() => setWhy((v) => !v)}
          aria-expanded={why}
          className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium text-rose-deep hover:bg-sunset/20"
        >
          Why this place? <ChevronDown size={13} className={cx("transition-transform", why && "rotate-180")} />
        </button>
        <span className="flex-1" />
        <button
          onClick={() => select(p.id, { focus: true, detail: false })}
          aria-label={`Show ${p.name} on map`}
          title="Show on map"
          className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-aubergine/[0.05] hover:text-aubergine"
        >
          <Eye size={15} />
        </button>
        <button
          onClick={() => toggleCompare(p.id)}
          aria-pressed={inCompare}
          aria-label={inCompare ? `Remove ${p.name} from comparison` : `Add ${p.name} to comparison`}
          title="Compare"
          className={cx("grid h-8 w-8 place-items-center rounded-full hover:bg-aubergine/[0.05]", inCompare ? "text-rose-deep" : "text-ink-soft")}
        >
          <Columns3 size={15} />
        </button>
        <button
          onClick={() => toggleSave(p)}
          aria-pressed={isSaved}
          aria-label={isSaved ? `Unsave ${p.name}` : `Save ${p.name}`}
          title={isSaved ? "Saved" : "Save"}
          className={cx("grid h-8 w-8 place-items-center rounded-full transition-transform hover:bg-aubergine/[0.05] active:scale-90", isSaved ? "text-rose-deep" : "text-ink-soft")}
        >
          <Bookmark size={15} fill={isSaved ? "currentColor" : "none"} />
        </button>
        <div className="relative">
          <button
            onClick={() => setFbOpen((v) => !v)}
            aria-expanded={fbOpen}
            aria-label="Feedback"
            title="Not quite right?"
            className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-aubergine/[0.05] hover:text-aubergine"
          >
            <ThumbsDown size={15} />
          </button>
          {fbOpen && (
            <div role="menu" className="absolute bottom-9 right-0 z-20 w-44 overflow-hidden rounded-[var(--radius-md)] surface-solid py-1 animate-rise">
              <button
                role="menuitem"
                onClick={() => {
                  setFbOpen(false);
                  giveFeedback(rec, "more-like-this");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-aubergine hover:bg-peach/60"
              >
                <ThumbsUp size={13} /> More like this
              </button>
              {FEEDBACK.map((f) => (
                <button
                  key={f.reason}
                  role="menuitem"
                  onClick={() => {
                    setFbOpen(false);
                    giveFeedback(rec, f.reason);
                  }}
                  className="block w-full px-3 py-2 text-left text-[13px] text-plum hover:bg-peach/60"
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {why && (
        <div className="space-y-4 border-t border-line/70 bg-cream/60 px-4 py-3.5 animate-rise">
          <section>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Practical fit</h4>
            <PracticalList items={rec.practical} />
          </section>
          <section>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Cultural fit</h4>
            <CulturalBlock ev={rec.cultural} />
          </section>
          {rec.tradeoffs.length > 0 && (
            <section>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Trade-offs</h4>
              <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] text-plum">
                {rec.tradeoffs.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </article>
  );
}
