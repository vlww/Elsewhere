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
        Qloo hasn&apos;t linked this place to your interests, so it&apos;s ranked on distance, hours and amenities.
      </p>
    );
  }
  const max = Math.max(...ev.contributions.map((c) => c.score), 0.0001);
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {ev.provenance === "demo" ? <Chip tone="demo">Simulated · demo mode</Chip> : <Chip tone="taste">Qloo Insights</Chip>}
        {ev.affinity !== undefined && (
          <Chip tone="neutral">
            {ev.provenance === "demo" ? "Simulated affinity" : "Qloo affinity"} {ev.affinity.toFixed(2)}
          </Chip>
        )}
        {ev.match === "name-proximity" && <Chip tone="muted">Matched by name &amp; location</Chip>}
        {ev.match === "qloo-place" && <Chip tone="muted">Surfaced by Qloo</Chip>}
      </div>
      {ev.contributions.length > 0 ? (
        <ul className="space-y-1.5" aria-label="Which interests contributed">
          {[...ev.contributions].sort((a, b) => b.score - a.score).map((c) => (
            <li key={c.entityId} className="text-[12.5px]">
              <div className="flex justify-between text-plum">
                <span>{c.entityName}</span>
                <span className="tabular-nums text-ink-faint">{c.score.toFixed(2)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-aubergine/[0.06]">
                <div className="h-full rounded-full bg-gradient-to-r from-sunset to-lilac" style={{ width: `${(c.score / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-ink-soft">Qloo didn&apos;t return a per-interest breakdown for this place.</p>
      )}
      {ev.qlooTags.length > 0 && <p className="text-[12px] text-ink-soft">Qloo tags: {ev.qlooTags.join(", ")}</p>}
      {ev.note && <p className="text-[11.5px] leading-snug text-ink-faint">{ev.note}</p>}
    </div>
  );
}

const FACTOR_LABEL: Record<keyof ScoreBreakdown["weights"], string> = {
  activity: "Fit for the plan",
  proximity: "Closeness",
  attributes: "Listed hours & amenities",
  cultural: "Qloo taste affinity",
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
        Overall score {score.total.toFixed(2)}{score.weights.cultural > 0 ? ", blending Qloo taste affinity with practical fit" : ""}.
      </p>
    </div>
  );
}
