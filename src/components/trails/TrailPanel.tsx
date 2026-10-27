"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bike,
  Bookmark,
  BookmarkCheck,
  Car,
  ChevronDown,
  Clock,
  Dices,
  Eye,
  Footprints,
  Info,
  Maximize,
  Minus,
  Navigation,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Shuffle,
  Sparkles,
  TrainFront,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useElsewhere } from "@/store/useElsewhere";
import type { TasteTrail, TrailLeg, TrailMode, TrailSpec, TrailStop } from "@/types";
import { Chip, cx, IconButton, Segmented } from "@/components/ui/primitives";
import { CATEGORY_LABEL, CATEGORY_META } from "@/components/places/categoryMeta";
import { PlaceArt } from "@/components/places/PlaceArt";
import { fmtDuration } from "@/lib/trails/narrative";
import { prefersReducedMotion } from "@/components/map/mapRef";
import { TRAIL_COLORS } from "./trailGeometry";


const MODE_ICON: Record<TrailMode, typeof Footprints> = { walking: Footprints, cycling: Bike, driving: Car, transit: TrainFront };
const GMAPS_MODE: Record<TrailMode, string> = { walking: "walking", cycling: "bicycling", driving: "driving", transit: "transit" };

function clock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const PRESETS: { label: string; hint: string; spec: Partial<TrailSpec> }[] = [
  { label: "A creative afternoon", hint: "Art, a pause, then open air", spec: { mood: ["creative"] } },
  { label: "The slow afternoon", hint: "Books, a green corner, something to eat", spec: { mood: ["slow", "read"] } },
  { label: "Somewhere unexpected", hint: "Past the obvious picks, two hours", spec: { surprise: true, timeBudgetMin: 120 } },
  { label: "Before dinner", hint: "Two stops, then a meal", spec: { mood: ["dinner"] } },
  { label: "The budget reset", hint: "Free and cheap places only", spec: { maxPriceLevel: 1, mood: ["cheap"] } },
  { label: "A date", hint: "Something to look at, a walk, dinner", spec: { mood: ["date"] } },
];

export function TrailPanel() {
  const trail = useElsewhere((s) => s.trail);
  const busy = useElsewhere((s) => s.trailBusy);
  const error = useElsewhere((s) => s.trailError);
  return (
    <section aria-label="Taste Trail" className="flex min-h-0 flex-1 flex-col">
      {trail ? <Itinerary trail={trail} /> : <EmptyTrail />}
      <div aria-live="polite" className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex flex-col items-center gap-2">
        {busy && (
          <p className="shimmer-text pointer-events-auto rounded-full surface-solid px-4 py-2 text-[12.5px] font-medium shadow-[var(--shadow-lift)]">{busy}</p>
        )}
        {error && !busy && (
          <p className="pointer-events-auto rounded-[var(--radius-md)] bg-apricot/90 px-3.5 py-2 text-[12.5px] text-[#6B3A20] shadow-[var(--shadow-lift)]">{error}</p>
        )}
      </div>
    </section>
  );
}

function EmptyTrail() {
  const location = useElsewhere((s) => s.location);
  const agentReady = useElsewhere((s) => s.status?.agent.configured ?? false);
  const signals = useElsewhere((s) => s.tasteSignals);
  const savedTrails = useElsewhere((s) => s.savedTrails);
  const { planTrail, sendMessage, setMobileTab, openSavedTrail, deleteSavedTrail } = useElsewhere.getState();
  const [budget, setBudget] = useState<"any" | "90" | "120" | "180">("any");
  return (
    <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
      <p className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-plum/70">
        <Footprints size={12} /> Taste Trails
      </p>
      <h2 className="mt-1 px-1 font-serif text-[28px] leading-[1.05] text-aubergine">
        A few places, <em>one</em> outing.
      </h2>
      <p className="mt-2 px-1 text-[13px] leading-relaxed text-ink-soft">
        Real places in a walkable order, with routed travel times, listed hours at the time you&apos;d arrive
        {signals.length ? <> and your interests ({signals.map((s) => s.name).join(", ")}) via Qloo</> : null}.
      </p>
      {agentReady && (
        <button
          onClick={() => {
            setMobileTab("guide");
            void sendMessage(signals.length ? "Plan a creative afternoon around my interests." : "Plan me a relaxed afternoon nearby.");
          }}
          className="mt-3 w-full rounded-[var(--radius-lg)] bg-aubergine px-4 py-3 text-left text-[13px] text-ivory shadow-[var(--shadow-lift)]"
        >
          <span className="flex items-center gap-1.5 font-semibold">
            <Sparkles size={14} /> Ask the guide
          </span>
          <span className="mt-0.5 block text-[12px] text-ivory/75">“Plan a creative afternoon around my interests” — or anything: time, budget, a bookstore then dinner…</span>
        </button>
      )}
      <div className="mt-4 flex items-center justify-between gap-2 px-1">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Start from a mood</p>
        <Segmented
          label="Time available"
          size="sm"
          value={budget}
          onChange={setBudget}
          options={[
            { value: "any", label: "Any" },
            { value: "90", label: "1½ h" },
            { value: "120", label: "2 h" },
            { value: "180", label: "3 h" },
          ]}
        />
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-2">
        {PRESETS.map((p, i) => (
          <li key={p.label}>
            <button
              disabled={!location}
              onClick={() => void planTrail({ ...p.spec, ...(budget !== "any" ? { timeBudgetMin: Number(budget) } : {}) }, `Planning ${p.label.toLowerCase()}…`)}
              className="h-full w-full rounded-[var(--radius-md)] p-3 text-left ring-1 ring-white/70 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${TRAIL_COLORS[i % 5]}40, ${TRAIL_COLORS[(i + 1) % 5]}30)` }}
            >
              <span className="block font-serif text-[16px] leading-tight text-aubergine">{p.label}</span>
              <span className="mt-1 block text-[11.5px] leading-snug text-plum/80">{p.hint}</span>
            </button>
          </li>
        ))}
      </ul>
      {savedTrails.length > 0 && (
        <>
          <p className="mt-5 px-1 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Saved trails</p>
          <ul className="mt-2 space-y-1.5">
            {savedTrails.map(({ trail: t, savedAt }) => (
              <li key={t.id} className="flex items-center gap-2 rounded-[var(--radius-md)] bg-white/70 p-2.5 ring-1 ring-line">
                <button onClick={() => openSavedTrail(t.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-serif text-[16px] text-aubergine">{t.story?.title ?? t.title}</span>
                  <span className="block truncate text-[11.5px] text-ink-faint">
                    {t.stops.map((s) => s.place.name).join(" → ")} · saved {new Date(savedAt).toLocaleDateString()}
                  </span>
                </button>
                <IconButton label={`Delete ${t.story?.title ?? t.title}`} onClick={() => deleteSavedTrail(t.id)}>
                  <Trash2 size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Itinerary({ trail }: { trail: TasteTrail }) {
  const busy = useElsewhere((s) => s.trailBusy);
  const savedTrails = useElsewhere((s) => s.savedTrails);
  const trailStop = useElsewhere((s) => s.trailStop);
  const { clearTrail, reviseTrail, planTrail, saveTrail, setTrailStop, frameTrail } = useElsewhere.getState();
  const [collapsed, setCollapsed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const playing = useTour(trail);
  const isSaved = savedTrails.some((t) => t.trail.id === trail.id && t.trail.stops.map((s) => s.placeId).join() === trail.stops.map((s) => s.placeId).join());
  const ModeIcon = MODE_ICON[trail.mode];
  const title = trail.story?.title ?? trail.title;

  return (
    <>
      <header className="relative overflow-hidden px-5 pb-3 pt-4">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(135deg,#FCE3EA_0%,#EEE6FB_45%,#FDEBDD_100%)] opacity-90" />
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-plum/75">
              <Footprints size={12} /> Taste Trail
            </p>
            <h2 className="mt-1 font-serif text-[27px] leading-[1.05] text-aubergine">{title}</h2>
            <p className="mt-1 text-[12.5px] italic text-plum/85">{trail.theme}</p>
          </div>
          <IconButton label={collapsed ? "Show itinerary" : "Collapse itinerary"} onClick={() => setCollapsed((v) => !v)} className="-mr-1">
            <ChevronDown size={16} className={cx("transition-transform", !collapsed && "rotate-180")} />
          </IconButton>
          <IconButton label="Close trail" onClick={clearTrail} className="-mr-2">
            <X size={15} />
          </IconButton>
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-1.5 text-[11.5px]" aria-label="Trail at a glance">
          <li className="inline-flex items-center gap-1 rounded-full bg-white/75 px-2.5 py-1 text-plum ring-1 ring-white">
            <Clock size={12} /> {clock(trail.startAt)}–{clock(trail.endAt)} <span className="text-ink-faint">· ~{fmtDuration(trail.totalMin)}</span>
          </li>
          <li className="inline-flex items-center gap-1 rounded-full bg-white/75 px-2.5 py-1 text-plum ring-1 ring-white">
            <ModeIcon size={12} /> {fmtDuration(trail.travelMin)} {trail.routing.effectiveMode}
            {!trail.routing.live && <span className="text-[#8A4E2C]"> (est.)</span>}
          </li>
          <li className="inline-flex items-center gap-1 rounded-full bg-white/75 px-2.5 py-1 text-plum ring-1 ring-white">{trail.stops.length} stops</li>
          {trail.cultural.mode !== "off" && trail.cultural.matchedStops > 0 && (
            <li>
              <Chip tone={trail.cultural.mode === "demo" ? "demo" : "taste"} className="py-1">
                <Sparkles size={11} /> {trail.cultural.matchedStops} via {trail.cultural.mode === "demo" ? "simulated taste" : "Qloo"}
              </Chip>
            </li>
          )}
        </ul>
        {!collapsed && <p className="mt-2.5 text-[13px] leading-relaxed text-plum">{trail.story?.summary ?? trail.summary}</p>}
        {trail.changeNote && !collapsed && (
          <p className="mt-2 rounded-[12px] bg-white/70 px-2.5 py-1.5 text-[12px] text-plum ring-1 ring-white animate-rise">{trail.changeNote}</p>
        )}
        <div className="scroll-soft -mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 pb-1" role="toolbar" aria-label="Trail actions">
          <Action icon={playing.on ? Pause : Play} onClick={playing.toggle} primary>
            {playing.on ? "Pause tour" : "Walk it through"}
          </Action>
          <Action icon={Maximize} onClick={frameTrail}>
            Whole route
          </Action>
          <Action icon={isSaved ? BookmarkCheck : Bookmark} onClick={saveTrail} pressed={isSaved}>
            {isSaved ? "Saved" : "Save trail"}
          </Action>
          <Action icon={Dices} disabled={!!busy} onClick={() => void reviseTrail([], { surprise: !trail.spec.surprise }, "Looking past the obvious…")} pressed={trail.spec.surprise}>
            {trail.spec.surprise ? "Less unexpected" : "Surprise me"}
          </Action>
          <Action
            icon={Minus}
            disabled={!!busy}
            onClick={() => void reviseTrail([], { timeBudgetMin: Math.max(30, trail.totalMin - 30) }, "Making it shorter…")}
          >
            30 min shorter
          </Action>
          <Action icon={Wallet} disabled={!!busy} onClick={() => void reviseTrail([], { maxPriceLevel: 1 }, "Keeping it cheap…")} pressed={trail.spec.maxPriceLevel === 1}>
            Cheaper
          </Action>
          <Action icon={Repeat} disabled={!!busy} onClick={() => void reviseTrail([], { endNearStart: !trail.spec.endNearStart }, "Rerouting…")} pressed={trail.spec.endNearStart}>
            End near start
          </Action>
          <Action icon={Shuffle} disabled={!!busy} onClick={() => void planTrail({ ...trail.spec, slots: undefined, keepOrder: false, mood: nextMood(trail.spec.mood) }, "Trying a different theme…")}>
            Different theme
          </Action>
          <ModePicker trail={trail} disabled={!!busy} />
        </div>
      </header>

      {!collapsed && (
        <div className={cx("scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-20 pt-3 transition-opacity", busy && "opacity-60")}>
          <Leg leg={trail.stops[0].legIn} from={trail.start.name} mode={trail.mode} first />
          <ol>
            {trail.stops.map((s, i) => (
              <li key={s.placeId}>
                <StopCard trail={trail} stop={s} i={i} active={trailStop === i} onSelect={() => setTrailStop(trailStop === i ? null : i)} />
                {i < trail.stops.length - 1 && <Leg leg={trail.stops[i + 1].legIn} mode={trail.mode} />}
              </li>
            ))}
          </ol>
          {trail.legOut && <Leg leg={trail.legOut} mode={trail.mode} to={`back to ${trail.start.name}`} />}

          <button
            onClick={() => setShowNotes((v) => !v)}
            aria-expanded={showNotes}
            className="mt-4 flex w-full items-center gap-1.5 px-1 text-left text-[12px] font-semibold text-plum"
          >
            <Info size={13} /> What&apos;s estimated, assumed or unknown ({trail.assumptions.length})
            <ChevronDown size={13} className={cx("ml-auto transition-transform", showNotes && "rotate-180")} />
          </button>
          {showNotes && (
            <ul className="mt-2 space-y-1.5 rounded-[var(--radius-md)] bg-white/60 p-3 text-[12px] leading-snug text-ink-soft ring-1 ring-line">
              {trail.assumptions.map((a) => (
                <li key={a} className="flex gap-2">
                  <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose" />
                  {a}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 px-1 text-[10.5px] leading-snug text-ink-faint">
            Routes: {trail.routing.provider}
            {trail.routing.live ? "" : " (unavailable — estimates shown)"}. Places: listed by their providers. Cultural fit:{" "}
            {trail.cultural.mode === "live" ? "Qloo Insights" : trail.cultural.mode === "demo" ? "simulated (demo mode)" : "not used"}. The order, timings and
            stays are Elsewhere&apos;s plan{trail.story ? "; the trail's title and notes were written by the guide from this evidence" : ""}.
          </p>
          <button onClick={clearTrail} className="mt-3 inline-flex items-center gap-1.5 px-1 text-[12px] font-medium text-rose-deep hover:underline">
            <RefreshCw size={12} /> Start over
          </button>
        </div>
      )}
    </>
  );
}

function nextMood(mood: string[]) {
  const cycle = [["creative"], ["slow", "read"], ["dinner"], ["music"], ["date"]];
  const i = cycle.findIndex((m) => m[0] === mood[0]);
  return cycle[(i + 1) % cycle.length];
}

function Action({
  icon: Icon,
  children,
  onClick,
  disabled,
  primary,
  pressed,
}: {
  icon: typeof Play;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cx(
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] font-medium transition-colors disabled:opacity-50",
        primary ? "bg-aubergine text-ivory shadow-[var(--shadow-lift)]" : pressed ? "bg-rose-deep/90 text-ivory" : "bg-white/80 text-plum ring-1 ring-white hover:bg-white",
      )}
    >
      <Icon size={13} /> {children}
    </button>
  );
}

function ModePicker({ trail, disabled }: { trail: TasteTrail; disabled: boolean }) {
  const reviseTrail = useElsewhere((s) => s.reviseTrail);
  return (
    <label className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-white/80 pl-2.5 pr-1 text-[12px] font-medium text-plum ring-1 ring-white">
      <span className="sr-only">Travel mode</span>
      {(() => {
        const I = MODE_ICON[trail.mode];
        return <I size={13} aria-hidden />;
      })()}
      <select
        value={trail.mode}
        disabled={disabled}
        onChange={(e) => void reviseTrail([], { mode: e.target.value as TrailMode }, "Rerouting…")}
        className="h-7 cursor-pointer rounded-full bg-transparent pr-1 text-[12px] outline-none"
      >
        <option value="walking">Walk</option>
        <option value="cycling">Bike</option>
        <option value="driving">Drive</option>
        <option value="transit">Transit</option>
      </select>
    </label>
  );
}

function Leg({ leg, mode, from, to, first }: { leg: TrailLeg; mode: TrailMode; from?: string; to?: string; first?: boolean }) {
  const Icon = MODE_ICON[mode === "transit" ? "walking" : mode];
  const dist = leg.distanceM >= 950 ? `${(leg.distanceM / 1000).toFixed(1)} km` : `${Math.round(leg.distanceM / 10) * 10} m`;
  return (
    <div className={cx("relative flex items-center gap-2 py-1.5 pl-[22px] text-[11.5px] text-ink-soft", first && "pt-0")}>
      <span aria-hidden className="absolute bottom-0 left-[13px] top-0 w-[2px] bg-[repeating-linear-gradient(to_bottom,#D98FA8_0_4px,transparent_4px_8px)] opacity-60" />
      <span className="ml-3 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2 py-0.5 ring-1 ring-line">
        <Icon size={11} /> {leg.durationMin} min · {dist}
        {leg.source === "estimate" && <span className="text-[#8A4E2C]">estimate</span>}
      </span>
      {from && <span className="truncate text-ink-faint">from {from}</span>}
      {to && <span className="truncate text-ink-faint">{to}</span>}
    </div>
  );
}

function StopCard({ trail, stop, i, active, onSelect }: { trail: TasteTrail; stop: TrailStop; i: number; active: boolean; onSelect: () => void }) {
  const saved = useElsewhere((s) => !!s.saved[stop.placeId]);
  const busy = useElsewhere((s) => s.trailBusy);
  const { toggleSave, select, reviseTrail } = useElsewhere.getState();
  const color = TRAIL_COLORS[i % TRAIL_COLORS.length];
  const p = stop.place;
  const Icon = CATEGORY_META[p.category].icon;
  const prev = i === 0 ? trail.start : trail.stops[i - 1].place;
  const directions = `https://www.google.com/maps/dir/?api=1&origin=${prev.lat},${prev.lon}&destination=${p.lat},${p.lon}&travelmode=${GMAPS_MODE[trail.mode]}`;
  const note = trail.story?.notes[stop.placeId];
  const n = trail.stops.length;
  const tune = (edits: Parameters<typeof reviseTrail>[0], label: string) => void reviseTrail(edits, {}, label);

  return (
    <article
      className={cx(
        "relative rounded-[var(--radius-lg)] bg-white/80 ring-1 transition-shadow",
        active ? "shadow-[0_0_0_2px_var(--stop),0_14px_28px_-14px_rgba(89,52,82,0.45)] ring-transparent" : "ring-line",
      )}
      style={{ "--stop": color } as React.CSSProperties}
    >
      <button onClick={onSelect} aria-expanded={active} className="flex w-full gap-3 p-3 text-left">
        <div className="relative shrink-0">
          <PlaceArt place={p} className="h-16 w-16 rounded-[14px]" />
          <span
            className="absolute -left-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full text-[12px] font-semibold text-aubergine ring-2 ring-white"
            style={{ background: color }}
          >
            {i + 1}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[11px] text-ink-faint">
            <Icon size={11} /> {CATEGORY_LABEL[p.category]} · arrive ~{clock(stop.arriveAt)} · stay ~{stop.plannedMin} min
          </p>
          <h3 className="truncate font-serif text-[19px] leading-tight text-aubergine">{p.name}</h3>
          <p className="mt-0.5 text-[12.5px] leading-snug text-plum">{note ?? stop.reason}</p>
        </div>
      </button>
      {active && (
        <div className="space-y-2.5 px-3 pb-3 animate-rise">
          {stop.culturalRationale && (
            <p className="flex gap-1.5 rounded-[12px] bg-lavender/45 px-2.5 py-1.5 text-[12px] leading-snug text-[#4B3B80]">
              <Sparkles size={12} className="mt-0.5 shrink-0" /> {stop.culturalRationale}
            </p>
          )}
          {!stop.culturalRationale && trail.cultural.mode !== "off" && (
            <p className="text-[11.5px] text-ink-faint">No cultural signal for this place — it&apos;s here for practical fit.</p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
            <dt className="text-ink-faint">Hours</dt>
            <dd className={cx(stop.openAtArrival.status === "closed" ? "text-[#8A4E2C]" : stop.openAtArrival.status === "unknown" ? "text-ink-soft" : "text-plum")}>
              {stop.openAtArrival.status === "unknown" ? "Not listed — check before going" : `At ${clock(stop.arriveAt)}: ${stop.openAtArrival.detail}`}
            </dd>
            <dt className="text-ink-faint">Price</dt>
            <dd className="text-plum">{p.priceLevel ? "$".repeat(p.priceLevel) + " listed" : "Not listed"}</dd>
            {p.address && (
              <>
                <dt className="text-ink-faint">Address</dt>
                <dd className="text-plum">{p.address}</dd>
              </>
            )}
            <dt className="text-ink-faint">Stay</dt>
            <dd className="flex items-center gap-1.5 text-plum">
              ~{stop.plannedMin} min <span className="text-ink-faint">(estimate)</span>
              <button
                aria-label="Less time here"
                disabled={!!busy}
                onClick={() => tune([{ op: "stay", stop: i + 1, minutes: Math.max(10, stop.plannedMin - 10) }], "Adjusting the time…")}
                className="grid h-5 w-5 place-items-center rounded-full bg-aubergine/[0.06] hover:bg-aubergine/10"
              >
                <Minus size={11} />
              </button>
              <button
                aria-label="More time here"
                disabled={!!busy}
                onClick={() => tune([{ op: "stay", stop: i + 1, minutes: stop.plannedMin + 10 }], "Adjusting the time…")}
                className="grid h-5 w-5 place-items-center rounded-full bg-aubergine/[0.06] hover:bg-aubergine/10"
              >
                <Plus size={11} />
              </button>
            </dd>
          </dl>
          <div className="flex flex-wrap gap-1.5">
            <SmallBtn icon={Eye} onClick={() => select(p.id, { focus: true, detail: true })}>
              Details
            </SmallBtn>
            <SmallBtn icon={saved ? BookmarkCheck : Bookmark} onClick={() => toggleSave(p)}>
              {saved ? "Saved" : "Save"}
            </SmallBtn>
            <a
              href={directions}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-full bg-aubergine/[0.05] px-2.5 text-[11.5px] font-medium text-plum hover:bg-aubergine/10"
            >
              <Navigation size={11} /> Directions
            </a>
          </div>
          <div>
            <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Tune this stop</p>
            <div className="flex flex-wrap gap-1.5">
              <SmallBtn icon={Sparkles} disabled={!!busy} onClick={() => tune([{ op: "more-like", stop: i + 1 }], "Finding more like this…")}>
                More like this
              </SmallBtn>
              <SmallBtn icon={Shuffle} disabled={!!busy} onClick={() => tune([{ op: "replace", stop: i + 1, because: "not-my-vibe" }], "Swapping it…")}>
                Not my vibe
              </SmallBtn>
              <SmallBtn icon={Wallet} disabled={!!busy} onClick={() => tune([{ op: "replace", stop: i + 1, because: "too-expensive" }], "Finding something cheaper…")}>
                Too expensive
              </SmallBtn>
              <SmallBtn icon={Dices} disabled={!!busy} onClick={() => tune([{ op: "replace", stop: i + 1, because: "less-touristy" }], "Looking off the beaten path…")}>
                Less obvious
              </SmallBtn>
              <SmallBtn icon={Footprints} disabled={!!busy} onClick={() => tune([{ op: "replace", stop: i + 1, because: "outdoors" }], "Finding somewhere outside…")}>
                Outdoors instead
              </SmallBtn>
              {n > 2 && (
                <SmallBtn icon={Trash2} disabled={!!busy} onClick={() => tune([{ op: "remove", stop: i + 1 }], "Removing the stop…")}>
                  Skip it
                </SmallBtn>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function SmallBtn({ icon: Icon, children, onClick, disabled }: { icon: typeof Eye; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 items-center gap-1 rounded-full bg-aubergine/[0.05] px-2.5 text-[11.5px] font-medium text-plum hover:bg-aubergine/10 disabled:opacity-50"
    >
      <Icon size={11} /> {children}
    </button>
  );
}

/** Steps the camera through the stops, a few seconds each (instant jumps with reduced motion). */
function useTour(trail: TasteTrail) {
  const [on, setOn] = useState(false);
  const setTrailStop = useElsewhere((s) => s.setTrailStop);
  const i = useRef(0);
  useEffect(() => {
    if (!on) return;
    i.current = 0;
    setTrailStop(0);
    const hold = prefersReducedMotion() ? 2500 : 4800;
    const t = setInterval(() => {
      i.current += 1;
      if (i.current >= trail.stops.length) {
        setOn(false);
        return;
      }
      setTrailStop(i.current);
    }, hold);
    return () => clearInterval(t);
  }, [on, trail.id, trail.stops.length, setTrailStop]);
  return { on, toggle: () => setOn((v) => !v) };
}
