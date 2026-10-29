"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, Search, Sparkles, X } from "lucide-react";
import { useElsewhere } from "@/store/useElsewhere";
import type { CulturalEntity } from "@/types";
import { Button, Chip, cx } from "@/components/ui/primitives";
import { entityKindLabel } from "./entityLabels";

/** A mix on purpose: everyday interests (Qloo tags) next to a few titles and names. */
const SUGGESTIONS: { label: string; items: string[] }[] = [
  { label: "Things you're into", items: ["Specialty coffee", "Vintage", "Live music", "Hiking", "Natural wine", "Architecture", "Vegan", "Board games"] },
  { label: "Films, music, books & brands", items: ["Wes Anderson", "Haruki Murakami", "Phoebe Bridgers", "Studio Ghibli", "MUJI"] },
];

export function TastePanel() {
  const signals = useElsewhere((s) => s.tasteSignals);
  const mode = useElsewhere((s) => s.status?.taste ?? "demo");
  const { addTaste, removeTaste, clearTaste, setPanel, setLens } = useElsewhere.getState();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CulturalEntity[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) return;
    timer.current = setTimeout(async () => {
      setState("loading");
      try {
        const res = await fetch(`/api/entities?q=${encodeURIComponent(q.trim())}`);
        const json = await res.json();
        setHits(json.entities ?? []);
        setState(json.error ? "error" : "idle");
      } catch {
        setState("error");
      }
    }, 280);
  }, [q]);

  return (
    <section aria-label="Your interests" className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pb-2 pt-4">
        <h2 className="font-serif text-[26px] leading-none text-aubergine">
          Your <em>Taste</em>
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          What you love. Films, brands, artists, and anything in between help Elsewhere notice places that might suit you.
        </p>
        {mode === "demo" && (
          <p className="mt-2 rounded-[var(--radius-md)] bg-butter/45 px-3 py-2 text-[12px] leading-snug text-[#6D5A1F] ring-1 ring-[#E8D27A]/50">
            Demo mode: no Qloo key is configured, so search covers a small fixture and cultural signals are simulated. Add QLOO_API_KEY for live results.
          </p>
        )}
      </div>

      <div className="space-y-3 px-4">
        <div className="flex items-center gap-2 rounded-full bg-white/85 py-1 pl-3.5 pr-1.5 ring-1 ring-line focus-within:ring-lilac/70">
          <Search size={15} className="text-ink-faint" aria-hidden />
          <label htmlFor="taste-search" className="sr-only">Search for anything you love</label>
          <input
            id="taste-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Coffee, jazz, vintage, a film, an artist…"
            className="h-9 min-w-0 flex-1 bg-transparent text-sm text-aubergine outline-none placeholder:text-ink-faint"
          />
          {state === "loading" && <span className="shimmer-text pr-2 text-[12px]">Searching</span>}
        </div>

        {q.trim().length >= 2 && (
          <ul className="scroll-soft max-h-64 overflow-y-auto rounded-[var(--radius-md)] bg-white/80 ring-1 ring-line" aria-live="polite">
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
            {!hits.length && state !== "loading" && (
              <li className="px-3 py-3 text-[12.5px] text-ink-soft">
                {state === "error" ? "Couldn't reach Qloo just now. Try again in a moment." : `No match for “${q}”. Try another spelling or a related name.`}
              </li>
            )}
          </ul>
        )}

        {!q && !signals.length && (
          <div className="space-y-3">
            {SUGGESTIONS.map((g) => (
              <div key={g.label}>
                <p className="mb-1.5 px-1 text-[11.5px] text-ink-faint">{g.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((s) => (
                    <button key={s} onClick={() => setQ(s)} className="rounded-full bg-white/70 px-2.5 py-1 text-[12px] text-plum ring-1 ring-line hover:bg-white">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 flex-1 px-4">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Active interests</p>
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
          {!signals.length && <li className="px-1 text-[12.5px] text-ink-soft">None yet. Results rank on practical fit alone.</li>}
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
