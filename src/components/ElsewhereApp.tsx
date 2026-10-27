"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Bookmark, Map as MapIcon, MessageCircle, Search, Sparkles } from "lucide-react";
import { useElsewhere, type MobileTab, type Panel } from "@/store/useElsewhere";
import { cx } from "@/components/ui/primitives";
import { TopBar } from "./TopBar";
import { LocationGate } from "./LocationGate";
import { MapControls } from "./map/MapControls";
import { MapModeDock } from "./map/MapModeDock";
import { ChatPanel, Composer } from "./chat/ChatPanel";
import { ResultsPanel } from "./places/ResultsPanel";
import { PlaceDetail } from "./places/PlaceDetail";
import { SavedPanel } from "./places/SavedPanel";
import { CompareSheet, CompareTray } from "./places/CompareSheet";
import { TastePanel } from "./taste/TastePanel";
import { TrailPanel } from "./trails/TrailPanel";

// MapLibre and three.js touch `window`; load them only in the browser, after first paint.
const MapCanvas = dynamic(() => import("./map/MapCanvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-gradient-to-br from-ivory via-peach/70 to-lavender/50" />,
});

function useIsDesktop() {
  const [v, setV] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setV(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return v;
}

function SidePanel({ panel }: { panel: Panel }) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {panel === "saved" ? <SavedPanel /> : panel === "taste" ? <TastePanel /> : panel === "trail" ? <TrailPanel /> : <ResultsPanel />}
      <PlaceDetail />
    </div>
  );
}

function DesktopLayout() {
  const panel = useElsewhere((s) => s.panel);
  const location = useElsewhere((s) => s.location);
  return (
    <>
      <div className="pointer-events-none absolute left-4 top-4 z-30">
        <TopBar />
      </div>
      {location && (
        <aside data-panel="chat" className="surface absolute bottom-4 left-4 top-[84px] z-20 flex w-[var(--chat-w)] flex-col overflow-hidden rounded-[var(--radius-xl)]">
          <ChatPanel className="flex-1" />
        </aside>
      )}
      <aside data-panel="side" className="surface absolute bottom-4 right-4 top-4 z-20 flex w-[var(--side-w)] flex-col overflow-hidden rounded-[var(--radius-xl)]">
        <SidePanel panel={panel ?? "results"} />
      </aside>
      <div className="pointer-events-none absolute bottom-6 right-[calc(var(--side-w)+32px)] z-20">
        <MapControls />
      </div>
      {location && (
        <div className="pointer-events-none absolute bottom-4 left-[calc(var(--chat-w)+28px)] z-20">
          <MapModeDock />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center pl-[calc(var(--chat-w)+250px)] pr-[calc(var(--side-w)+80px)]">
        <CompareTray />
      </div>
      {!location && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center pr-[var(--side-w)]">
          <LocationGate />
        </div>
      )}
    </>
  );
}

const TABS: { id: MobileTab | "saved" | "taste"; label: string; icon: typeof MapIcon }[] = [
  { id: "map", label: "Map", icon: MapIcon },
  { id: "guide", label: "Guide", icon: MessageCircle },
  { id: "places", label: "Places", icon: Search },
  { id: "saved", label: "Saved", icon: Bookmark },
  { id: "taste", label: "Taste", icon: Sparkles },
];

function MobileLayout() {
  const tab = useElsewhere((s) => s.mobileTab);
  const panel = useElsewhere((s) => s.panel);
  const location = useElsewhere((s) => s.location);
  const resultCount = useElsewhere((s) => s.result?.recommendations.length ?? 0);
  const { setMobileTab, setPanel } = useElsewhere.getState();
  const sheetOpen = tab !== "map";
  const active = tab === "places" ? (panel === "saved" ? "saved" : panel === "taste" ? "taste" : "places") : tab;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex">
        <TopBar />
      </div>
      {!location && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-4">
          <LocationGate />
        </div>
      )}
      {location && !sheetOpen && (
        <>
          <div className="pointer-events-none absolute left-3 top-20 z-20">
            <MapModeDock compact />
          </div>
          <div className="pointer-events-none absolute right-3 top-20 z-20">
            <MapControls />
          </div>
        </>
      )}

      {location && (
        <div
          className={cx(
            "absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[26px] surface transition-[height] duration-500 ease-[var(--ease-out-soft)]",
            sheetOpen ? "h-[72dvh]" : "h-auto",
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-aubergine/15" aria-hidden />
          {sheetOpen ? (
            <div className="relative flex min-h-0 flex-1 flex-col">
              {tab === "guide" ? <ChatPanel className="flex-1" /> : <SidePanel panel={panel ?? "results"} />}
            </div>
          ) : (
            <div className="px-3 pt-2">
              <Composer />
              <div className="mt-2 flex justify-center">
                <CompareTray />
              </div>
            </div>
          )}
          <nav aria-label="Sections" className="grid shrink-0 grid-cols-5 border-t border-line/70 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  if (t.id === "saved" || t.id === "taste") {
                    setPanel(t.id);
                    setMobileTab("places");
                  } else {
                    if (t.id === "places") setPanel("results");
                    setMobileTab(t.id);
                  }
                }}
                aria-current={active === t.id ? "page" : undefined}
                className={cx(
                  "flex flex-col items-center gap-0.5 rounded-[12px] py-1.5 text-[10.5px] font-medium",
                  active === t.id ? "text-aubergine" : "text-ink-faint",
                )}
              >
                <span className={cx("grid h-7 w-12 place-items-center rounded-full transition-colors", active === t.id && "bg-peach")}>
                  <t.icon size={17} />
                </span>
                {t.label}
                {t.id === "places" && resultCount > 0 && <span className="sr-only">({resultCount} results)</span>}
              </button>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}

export function ElsewhereApp() {
  const isDesktop = useIsDesktop();

  useEffect(() => {
    void (async () => {
      await useElsewhere.persist.rehydrate();
      const s = useElsewhere.getState();
      // A Taste Layer left on last visit ranks by taste again, so markers lead with what it highlights.
      if (s.tasteLayer && s.tasteSignals.length) s.setLens("taste");
      await s.loadStatus();
      if (s.location) void s.runSearch();
    })();
  }, []);

  return (
    <main
      className="relative h-dvh w-full overflow-hidden bg-ivory"
      // Panel widths shared by the layout and the map camera padding.
      style={{ "--chat-w": "clamp(320px, 27vw, 400px)", "--side-w": "clamp(340px, 28vw, 410px)" } as React.CSSProperties}
    >
      <MapCanvas />
      {/* A soft dusk wash at the edges keeps floating panels legible over busy streets. */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(120%_80%_at_50%_45%,transparent_55%,rgba(242,185,200,0.18)_100%)]" />
      {isDesktop === true && <DesktopLayout />}
      {isDesktop === false && <MobileLayout />}
      <CompareSheet />
    </main>
  );
}
