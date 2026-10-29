"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, Search, Sparkles, X } from "lucide-react";
import { useElsewhere } from "@/store/useElsewhere";
import type { CulturalEntity } from "@/types";
import { Button, Chip, cx } from "@/components/ui/primitives";
import { entityKindLabel } from "./entityLabels";

/**
 * Starting points for people who can't name their taste off-hand: the feel of a place, as Qloo tags
 * (ambience and decor) that places are actually labelled with.
 */
const VIBES: { id: string; name: string; hint: string; tint: string }[] = [
  { id: "urn:tag:ambience:qloo:cozy", name: "Cozy", hint: "Warm, snug, unhurried", tint: "#F6C29B" },
  { id: "urn:tag:ambience:qloo:quiet", name: "Quiet", hint: "Room to think", tint: "#D9D0F2" },
  { id: "urn:tag:ambience:qloo:artsy", name: "Artsy", hint: "Murals, makers, galleries", tint: "#F2B9C8" },
  { id: "urn:tag:decor:qloo:vintage", name: "Vintage", hint: "Worn-in and collected", tint: "#F7E6A2" },
  { id: "urn:tag:decor:qloo:minimalist", name: "Minimalist", hint: "Clean lines, calm design", tint: "#E4E0EA" },
  { id: "urn:tag:ambience:qloo:lively", name: "Lively", hint: "A buzz, people around", tint: "#F2958A" },
  { id: "urn:tag:ambience:place:hidden_gem", name: "Hidden gem", hint: "Off the obvious path", tint: "#B9C8B0" },
  { id: "urn:tag:ambience:qloo:romantic", name: "Romantic", hint: "Soft light, good for two", tint: "#E9A5C9" },
  { id: "urn:tag:ambience:qloo:bohemian", name: "Bohemian", hint: "Eclectic, free-spirited", tint: "#C9A8E6" },
];

const NAMED = ["Wes Anderson", "Studio Ghibli", "Phoebe Bridgers", "Haruki Murakami", "MUJI", "Specialty coffee", "Live music"];

export function TastePanel() {
  const signals = useElsewhere((s) => s.tasteSignals);
  const mode = useElsewhere((s) => s.status?.taste ?? "demo");
  const { addTaste, removeTaste, clearTaste, setPanel, setLens } = useElsewhere.getState();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CulturalEntity[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  // The query whose results are on screen, and the one the user has paused on.
  const [loadedFor, setLoadedFor] = useState("");
  const [pausedOn, setPausedOn] = useState("");
  const [own, setOwn] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pause = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typed = q.trim();
  // Only once they've stopped typing and nothing found is exactly what they typed.
  const offerOwn =
    mode === "live" &&
    typed.length >= 2 &&
    state === "idle" &&
    loadedFor === typed &&
    pausedOn === typed &&
    !hits.some((e) => e.name.toLowerCase() === typed.toLowerCase());

  async function addOwn() {
    setOwn({ busy: true });
    try {
      const json = await (await fetch(`/api/entities?interpret=1&q=${encodeURIComponent(typed)}`)).json();
      if (!json.entity) return setOwn({ busy: false, error: json.error ?? "Couldn't connect that to places yet." });
      addTaste(json.entity as CulturalEntity);
      setQ("");
      setOwn({ busy: false });
    } catch {
      setOwn({ busy: false, error: "Couldn't reach the server just now." });
    }
  }

  function toggleVibe(v: (typeof VIBES)[number]) {
    if (signals.some((s) => s.id === v.id)) removeTaste(v.id);
    else addTaste({ id: v.id, name: v.name, type: v.id.split(":").slice(0, 4).join(":"), provenance: "live", origin: "picked" });
  }

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (pause.current) clearTimeout(pause.current);
    const query = q.trim();
    if (query.length < 2) return;
    timer.current = setTimeout(async () => {
      setState("loading");
      try {
        const res = await fetch(`/api/entities?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        setHits(json.entities ?? []);
        setLoadedFor(query);
        setState(json.error ? "error" : "idle");
      } catch {
        setState("error");
      }
    }, 280);
    pause.current = setTimeout(() => setPausedOn(query), 1100);
  }, [q]);

  return (
    <section aria-label="Your taste" className="scroll-soft flex min-h-0 flex-1 flex-col overflow-y-auto pb-5">
      <div className="px-5 pb-2 pt-5">
        <h2 className="font-serif text-[28px] leading-[1.05] text-aubergine">
          Your <em>Taste</em>
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          Your style, not a destination. Pick the vibes you&apos;re drawn to, or add films, brands, artists and anything in between. Elsewhere uses them to notice places that might suit you.
        </p>
        {mode === "demo" && (
          <p className="mt-2 rounded-[var(--radius-md)] bg-butter/45 px-3 py-2 text-[12px] leading-snug text-[#6D5A1F] ring-1 ring-[#E8D27A]/50">
            Demo mode: no Qloo key is configured, so search covers a small fixture and cultural signals are simulated. Add QLOO_API_KEY for live results.
          </p>
        )}
      </div>

      {mode === "live" && (
        <div className="px-4 pt-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Places that feel…</p>
          <ul className="mt-2 grid grid-cols-3 gap-1.5">
            {VIBES.map((v) => {
              const on = signals.some((s) => s.id === v.id);
              return (
                <li key={v.id}>
                  <button
                    aria-pressed={on}
                    onClick={() => toggleVibe(v)}
                    className={cx(
                      "relative h-full w-full rounded-[14px] px-2.5 py-2 text-left ring-1 transition-[transform,box-shadow] hover:-translate-y-0.5",
                      on ? "ring-2 ring-aubergine/70" : "ring-white/80",
                    )}
                    style={{ background: `linear-gradient(140deg, ${v.tint}cc, ${v.tint}55)` }}
                  >
                    <span className="block text-[13px] font-semibold text-aubergine">{v.name}</span>
                    <span className="mt-0.5 block text-[10.5px] leading-snug text-plum/80">{v.hint}</span>
                    {on && (
                      <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-aubergine text-ivory">
                        <Check size={10} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="space-y-3 px-4 pt-5">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Things you love</p>
        <div className="flex items-center gap-2 rounded-full bg-white/85 py-1 pl-3.5 pr-1.5 ring-1 ring-line focus-within:ring-lilac/70">
          <Search size={15} className="text-ink-faint" aria-hidden />
          <label htmlFor="taste-search" className="sr-only">Search for anything you love</label>
          <input
            id="taste-search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOwn({ busy: false });
            }}
            placeholder="A film, an artist, a brand, boba…"
            className="h-9 min-w-0 flex-1 bg-transparent text-sm text-aubergine outline-none placeholder:text-ink-faint"
          />
          {state === "loading" && <span className="shimmer-text pr-2 text-[12px]">Searching</span>}
        </div>

        {typed.length >= 2 && (
          <ul className="scroll-soft max-h-72 overflow-y-auto rounded-[var(--radius-md)] bg-white/80 ring-1 ring-line" aria-live="polite">
            {hits.map((e) => {
              const on = signals.some((s) => s.id === e.id);
              return (
                <li key={e.id}>
                  <button
                    disabled={on}
                    onClick={() => {
                      addTaste({ ...e, origin: "picked" });
                      setQ("");
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-lavender/30 disabled:opacity-60"
                  >
                    {e.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.imageUrl} alt="" className="h-9 w-9 rounded-[10px] object-cover" />
                    ) : (
                      <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-lavender/60 text-[#5A4791]">
                        <Sparkles size={15} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-aubergine">{e.name}</span>
                      <span className="block truncate text-[11.5px] text-ink-faint">{e.disambiguation ?? entityKindLabel(e.type)}</span>
                    </span>
                    {on ? <Check size={15} className="text-sage-deep" /> : <Plus size={15} className="text-ink-faint" />}
                  </button>
                </li>
              );
            })}
            {offerOwn && (
              <li className={cx(hits.length > 0 && "border-t border-line/70")}>
                <button onClick={() => void addOwn()} disabled={own.busy} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-lavender/30 disabled:opacity-70">
                  <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-sunset/50 text-rose-deep">
                    <Plus size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-aubergine">Add “{typed}”</span>
                    <span className={cx("block truncate text-[11.5px]", own.error ? "text-[#8A4E2C]" : "text-ink-faint")}>
                      {own.busy ? <span className="shimmer-text">Finding matches…</span> : own.error ?? "Find matches from your personal taste"}
                    </span>
                  </span>
                </button>
              </li>
            )}
            {!hits.length && !offerOwn && state !== "loading" && loadedFor === typed && (
              <li className="px-3 py-3 text-[12.5px] text-ink-soft">
                {state === "error" ? "Couldn't reach Qloo just now. Try again in a moment." : `Nothing named “${typed}” yet.`}
              </li>
            )}
          </ul>
        )}

        {!q && (
          <div className="flex flex-wrap gap-1.5">
            {NAMED.map((s) => (
              <button key={s} onClick={() => setQ(s)} className="rounded-full bg-white/70 px-2.5 py-1 text-[12px] text-plum ring-1 ring-line hover:bg-white">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 px-4">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Your taste so far</p>
          {signals.length > 0 && (
            <button onClick={clearTaste} className="text-[12px] text-ink-soft hover:text-aubergine">
              Clear all
            </button>
          )}
        </div>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {signals.map((e) => (
            <li key={e.id}>
              <span className={cx("inline-flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-1.5 text-[12.5px] font-medium ring-1", e.provenance === "demo" ? "bg-butter/50 text-[#6D5A1F] ring-[#E8D27A]/60" : "bg-lavender/70 text-[#4B3B80] ring-lilac/40")}>
                {e.name}
                <span className="text-[11px] font-normal opacity-70">{entityKindLabel(e.type)}</span>
                {e.origin === "conversation" && <Chip tone="muted" className="px-1.5 py-0">this chat</Chip>}
                <button onClick={() => removeTaste(e.id)} aria-label={`Remove ${e.name}`} className="rounded-full p-0.5 hover:bg-white/60">
                  <X size={12} />
                </button>
              </span>
            </li>
          ))}
          {!signals.length && <li className="px-1 text-[12.5px] text-ink-soft">Nothing yet. Places are ranked on practical fit alone.</li>}
        </ul>
        {signals.length > 0 && (
          <Button
            className="mt-4"
            variant="solid"
            size="sm"
            icon={<Sparkles size={14} />}
            onClick={() => {
              setLens("taste");
              setPanel("results");
            }}
          >
            See places for your taste
          </Button>
        )}
      </div>
    </section>
  );
}
