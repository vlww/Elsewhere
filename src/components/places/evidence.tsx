"use client";

import { Check, CircleQuestionMark, Minus, X } from "lucide-react";
import type { CulturalEvidence, EvidenceStatus, PracticalEvidence, ScoreBreakdown } from "@/types";
import { Chip, cx } from "@/components/ui/primitives";

const STATUS: Record<EvidenceStatus, { icon: typeof Check; cls: string; sr: string }> = {
  met: { icon: Check, cls: "bg-sage/45 text-[#4E6446]", sr: "Meets" },
  partial: { icon: Minus, cls: "bg-butter/60 text-[#7A6320]", sr: "Partly" },
  unknown: { icon: CircleQuestionMark, cls: "bg-aubergine/[0.06] text-ink-soft", sr: "Unknown" },
  unmet: { icon: X, cls: "bg-apricot/40 text-[#8A4E2C]", sr: "Doesn't meet" },
};

export function PracticalList({ items }: { items: PracticalEvidence[] }) {
  return (
    <ul className="space-y-2">
      {items.map((e) => {
        const s = STATUS[e.status];
        return (
          <li key={e.label} className="flex items-start gap-2.5">
            <span className={cx("mt-[1px] grid h-5 w-5 shrink-0 place-items-center rounded-full", s.cls)}>
              <s.icon size={11} strokeWidth={2.5} aria-hidden />
              <span className="sr-only">{s.sr}</span>
            </span>
            <div className="min-w-0 text-[13px] leading-snug">
              <span className="font-semibold text-aubergine">{e.label}</span> <span className="text-plum">{e.detail}</span>
              <span className="block text-[11px] text-ink-faint">{e.source}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CulturalBlock({ ev }: { ev?: CulturalEvidence }) {
  if (!ev) {
    return (
      <p className="text-[13px] leading-snug text-ink-soft">
        This place&apos;s profile doesn&apos;t line up closely with your interests, so it&apos;s ranked on distance, hours and amenities.
      </p>
    );
  }
  const max = Math.max(...ev.contributions.map((c) => c.score), 0.0001);
  return (
    <div className="space-y-2.5">
      {ev.note && <p className="text-[13px] leading-snug text-plum">{ev.note}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone="taste">{ev.provenance === "ai" ? "Interest profiled by Claude" : "Built-in profile"}</Chip>
        {ev.affinity !== undefined && <Chip tone="neutral">Affinity {ev.affinity.toFixed(2)}</Chip>}
        {ev.match === "listing" && <Chip tone="muted">Named in the listing</Chip>}
        <Chip tone="muted">{ev.listingRead === "claude" ? "Listing read by Claude + rules" : "Listing read by rules"}</Chip>
      </div>
      {ev.facets.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Shared taste facets">
          {ev.facets.map((f) => (
            <li key={f} className="rounded-full bg-white/70 px-2 py-0.5 text-[11.5px] text-[#5A4791] ring-1 ring-lilac/40">
              {f}
            </li>
          ))}
        </ul>
      )}
      {ev.contributions.length > 1 && (
        <ul className="space-y-1.5" aria-label="Which interests contributed">
          {[...ev.contributions].sort((a, b) => b.score - a.score).map((c) => (
            <li key={c.entityId} className="text-[12.5px]">
              <div className="flex justify-between text-plum">
                <span>{c.entityName}</span>
                <span className="tabular-nums text-ink-faint">{Math.round(c.score * 100)}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-aubergine/[0.06]">
                <div className="h-full rounded-full bg-gradient-to-r from-sunset to-lilac" style={{ width: `${(c.score / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11.5px] leading-snug text-ink-faint">
        An estimate from overlapping taste profiles, not a review. It never adds facts the listing doesn&apos;t have.
      </p>
    </div>
  );
}

const FACTOR_LABEL: Record<keyof ScoreBreakdown["weights"], string> = {
  activity: "Fit for the plan",
  proximity: "Closeness",
  attributes: "Listed hours & amenities",
  cultural: "Taste affinity",
  feedback: "Your feedback",
};

export function ScoreBars({ score }: { score: ScoreBreakdown }) {
  const keys = (Object.keys(score.weights) as (keyof ScoreBreakdown["weights"])[]).filter((k) => score.weights[k] > 0);
  return (
    <div>
      <ul className="space-y-1.5">
        {keys.map((k) => (
          <li key={k} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-[12px]">
            <span className="text-plum">
              {FACTOR_LABEL[k]} <span className="text-ink-faint">×{score.weights[k].toFixed(2)}</span>
            </span>
            <span className="tabular-nums text-ink-faint">{score[k].toFixed(2)}</span>
            <div className="col-span-2 h-1 rounded-full bg-aubergine/[0.06]">
              <div className="h-full rounded-full bg-rose/70" style={{ width: `${score[k] * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-ink-faint">
        Overall score {score.total.toFixed(2)}{score.weights.cultural > 0 ? ", blending taste affinity with practical fit" : ""}.
      </p>
    </div>
  );
}
