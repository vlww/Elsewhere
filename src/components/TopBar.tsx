"use client";

import { useState } from "react";
import { Bookmark, Footprints, MapPin, Search, Sparkles } from "lucide-react";
import { useElsewhere } from "@/store/useElsewhere";
import { Chip, cx } from "@/components/ui/primitives";
import { LocationSearch } from "./LocationGate";

export function TopBar() {
  const location = useElsewhere((s) => s.location);
  const status = useElsewhere((s) => s.status);
  const panel = useElsewhere((s) => s.panel);
  const setPanel = useElsewhere((s) => s.setPanel);
  const savedCount = useElsewhere((s) => Object.keys(s.saved).length);
  const tasteCount = useElsewhere((s) => s.tasteSignals.length);
  const trailStops = useElsewhere((s) => s.trail?.stops.length ?? 0);
  const [editing, setEditing] = useState(false);

  const nav = [
    { id: "results" as const, label: "Explore", icon: Search },
    { id: "saved" as const, label: "Saved", icon: Bookmark, count: savedCount },
    { id: "taste" as const, label: "Taste", icon: Sparkles, count: tasteCount },
    { id: "trail" as const, label: "Trail", icon: Footprints, count: trailStops },
  ];

  return (
    <header className="pointer-events-auto flex items-center gap-2">
      <div className="surface flex h-12 items-center gap-1 rounded-full pl-4 pr-1.5">
        <h1 className="mr-2 font-serif text-[26px] italic leading-none tracking-[-0.01em] text-aubergine">Elsewhere</h1>
        <div className="relative">
          <button
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
            className="inline-flex h-9 max-w-[220px] items-center gap-1.5 rounded-full bg-aubergine/[0.05] px-3 text-[13px] font-medium text-plum hover:bg-aubergine/[0.08]"
          >
            <MapPin size={14} className="shrink-0 text-rose-deep" />
            <span className="truncate">{location ? location.label.split(",")[0] : "Choose a place"}</span>
          </button>
          {editing && (
            <div className="absolute left-0 top-12 z-30 w-[320px] rounded-[var(--radius-lg)] surface-solid p-3 animate-rise">
              <LocationSearch onDone={() => setEditing(false)} compact />
            </div>
          )}
        </div>
      </div>

      <nav aria-label="Primary" className="surface hidden h-12 items-center gap-0.5 rounded-full p-1.5 lg:flex">
        {nav.map((n) => (
          <button
            key={n.id}
            onClick={() => setPanel(panel === n.id && n.id !== "results" ? "results" : n.id)}
            aria-current={panel === n.id ? "page" : undefined}
            className={cx(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors",
              panel === n.id ? "bg-aubergine text-ivory" : "text-ink-soft hover:bg-aubergine/[0.05] hover:text-aubergine",
            )}
          >
            <n.icon size={14} />
            {n.label}
            {!!n.count && <span className={cx("ml-0.5 text-[11px] tabular-nums", panel === n.id ? "text-ivory/70" : "text-ink-faint")}>{n.count}</span>}
          </button>
        ))}
      </nav>

      {status && (
        <div className="hidden items-center gap-1.5 xl:flex">
          {status.taste === "demo" && (
            <Chip tone="demo" className="h-7 px-2.5">
              <span title="No Qloo key configured: cultural signals are simulated from a small fixture.">Taste: demo</span>
            </Chip>
          )}
          {status.places[0]?.includes("snapshot") && (
            <Chip tone="demo" className="h-7 px-2.5">
              <span title={`Place data is a ${status.demoArea.snapshotDate} OpenStreetMap snapshot of ${status.demoArea.name}.`}>Places: snapshot</span>
            </Chip>
          )}
        </div>
      )}
    </header>
  );
}
