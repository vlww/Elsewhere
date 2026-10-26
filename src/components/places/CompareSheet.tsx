"use client";

import { useEffect } from "react";
import { Columns3, X } from "lucide-react";
import { useElsewhere } from "@/store/useElsewhere";
import type { Recommendation } from "@/types";
import { Button, cx, IconButton } from "@/components/ui/primitives";
import { CATEGORY_LABEL } from "./categoryMeta";
import { PlaceArt } from "./PlaceArt";

const yn = (v: string) => (v === "yes" ? "Listed" : v === "no" ? "No" : "Not listed");

export function CompareTray() {
  const ids = useElsewhere((s) => s.compareIds);
  const result = useElsewhere((s) => s.result);
  const open = useElsewhere((s) => s.compareOpen);
  const { setCompareOpen, toggleCompare } = useElsewhere.getState();
  const recs = ids.map((id) => result?.recommendations.find((r) => r.place.id === id)).filter((r): r is Recommendation => !!r);
  if (!recs.length || open) return null;
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full surface py-1.5 pl-2 pr-1.5 animate-rise">
      {recs.map((r) => (
        <span key={r.place.id} className="inline-flex items-center gap-1 rounded-full bg-white/80 py-1 pl-2.5 pr-1 text-[12px] font-medium text-plum ring-1 ring-line">
          <span className="max-w-[110px] truncate">{r.place.name}</span>
          <button aria-label={`Remove ${r.place.name}`} onClick={() => toggleCompare(r.place.id)} className="rounded-full p-0.5 text-ink-faint hover:text-aubergine">
            <X size={11} />
          </button>
        </span>
      ))}
      <Button size="sm" variant="solid" icon={<Columns3 size={13} />} disabled={recs.length < 2} onClick={() => setCompareOpen(true)}>
        Compare {recs.length}
      </Button>
    </div>
  );
}

export function CompareSheet() {
  const ids = useElsewhere((s) => s.compareIds);
  const result = useElsewhere((s) => s.result);
  const open = useElsewhere((s) => s.compareOpen);
  const tasteOn = useElsewhere((s) => s.lensMode === "taste" && s.tasteSignals.length > 0);
  const { setCompareOpen, select } = useElsewhere.getState();
  const recs = ids.map((id) => result?.recommendations.find((r) => r.place.id === id)).filter((r): r is Recommendation => !!r);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCompareOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setCompareOpen]);

  if (!open || recs.length < 2) return null;
  const nearest = Math.min(...recs.map((r) => r.distanceM));
  const rows: { label: string; cell: (r: Recommendation) => React.ReactNode; best?: (r: Recommendation) => boolean }[] = [
    { label: "Kind", cell: (r) => CATEGORY_LABEL[r.place.category] },
    { label: "Walk", cell: (r) => `${r.walkMin} min`, best: (r) => r.distanceM === nearest },
    { label: "Right now", cell: (r) => r.openState.detail, best: (r) => r.openState.status === "open" },
    { label: "Price", cell: (r) => (r.place.priceLevel ? "$".repeat(r.place.priceLevel) : "Not listed") },
    { label: "Wi-Fi", cell: (r) => yn(r.place.wifi), best: (r) => r.place.wifi === "yes" },
    { label: "Outdoor seating", cell: (r) => yn(r.place.outdoorSeating) },
    { label: "Fit for the plan", cell: (r) => r.practical.find((p) => p.label === "Fit for the plan")?.detail },
    {
      label: "Cultural signal",
      cell: (r) =>
        r.cultural
          ? `${r.cultural.provenance === "demo" ? "Simulated" : "Qloo"} ${r.cultural.affinity?.toFixed(2) ?? ""}${
              r.cultural.contributions[0] ? ` · ${[...r.cultural.contributions].sort((a, b) => b.score - a.score)[0].entityName}` : ""
            }`
          : "None",
    },
    { label: tasteOn ? "Taste-aware rank" : "Practical rank", cell: (r) => `#${tasteOn ? r.tasteRank : r.practicalRank}` },
    { label: "Trade-offs", cell: (r) => (r.tradeoffs.length ? r.tradeoffs.join("; ") : "—") },
  ];

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 grid place-items-center bg-aubergine/25 p-4 backdrop-blur-sm" onClick={() => setCompareOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-title"
        onClick={(e) => e.stopPropagation()}
        className="scroll-soft max-h-[88vh] w-full max-w-3xl overflow-auto rounded-[var(--radius-xl)] surface-solid p-5 animate-rise"
      >
        <div className="flex items-center justify-between">
          <h2 id="compare-title" className="font-serif text-[28px] text-aubergine">
            Side by side
          </h2>
          <IconButton label="Close comparison" onClick={() => setCompareOpen(false)} autoFocus>
            <X size={17} />
          </IconButton>
        </div>
        <table className="mt-4 w-full border-separate border-spacing-0 text-left text-[13px]">
          <thead>
            <tr>
              <th className="w-32" />
              {recs.map((r) => (
                <th key={r.place.id} scope="col" className="px-2 pb-3 align-bottom font-normal">
                  <button onClick={() => { setCompareOpen(false); select(r.place.id, { focus: true }); }} className="w-full text-left">
                    <PlaceArt place={r.place} className="mb-2 h-20 w-full rounded-[12px]" />
                    <span className="font-serif text-[19px] leading-tight text-aubergine">{r.place.name}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="border-t border-line py-2.5 pr-2 align-top text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                  {row.label}
                </th>
                {recs.map((r) => (
                  <td key={r.place.id} className={cx("border-t border-line px-2 py-2.5 align-top text-plum", row.best?.(r) && "font-semibold text-aubergine")}>
                    {row.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-ink-faint">Bold marks the better value where there&apos;s a clear one. Amenities are as listed by each place&apos;s data source.</p>
      </div>
    </div>
  );
}
