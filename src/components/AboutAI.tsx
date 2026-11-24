"use client";

import { useEffect, useMemo, useRef } from "react";
import { BrainCircuit, Database, EyeOff, ShieldCheck, Sparkles, X } from "lucide-react";
import { useElsewhere } from "@/store/useElsewhere";
import { FACET_LABEL, type FacetVec } from "@/lib/taste/facets";
import { lexiconById } from "@/lib/taste/lexicon";
import { FACETS } from "@/types";
import { Chip } from "@/components/ui/primitives";

/**
 * "How Elsewhere uses AI": what Claude does, what it never does, where data lives, and a live view of
 * how the Taste Engine is reading the person's current interests. Opened from the top bar.
 */
export function AboutAI({ onClose }: { onClose: () => void }) {
  const status = useElsewhere((s) => s.status);
  const signals = useElsewhere((s) => s.tasteSignals);
  const ref = useRef<HTMLDivElement>(null);
  const ai = status?.taste === "ai";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The combined taste profile: the average of the active interests' facets.
  const profile = useMemo(() => {
    const vecs = signals.map((s) => s.profile?.facets ?? lexiconById(s.id)?.facets).filter((v): v is FacetVec => !!v);
    const sum: FacetVec = {};
    for (const v of vecs) for (const f of FACETS) sum[f] = (sum[f] ?? 0) + (v[f] ?? 0) / vecs.length;
    return FACETS.map((f) => [f, sum[f] ?? 0] as const)
      .filter(([, v]) => v > 0.05)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [signals]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-aubergine/25 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-ai-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="surface-solid scroll-soft max-h-[88vh] w-full max-w-[560px] overflow-y-auto rounded-[var(--radius-lg)] p-5 outline-none animate-rise sm:p-6"
      >
        <div className="flex items-start gap-3">
          <h2 id="about-ai-title" className="flex-1 font-serif text-[26px] leading-tight text-aubergine">
            How Elsewhere uses <em>AI</em>
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-ink-soft hover:bg-aubergine/[0.06]">
            <X size={18} />
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {ai ? <Chip tone="taste">Claude is on</Chip> : <Chip tone="demo">Built-in mode: no Claude key configured</Chip>}
          {status?.agent.configured && <Chip tone="neutral">Guide: {status.agent.model}</Chip>}
          {ai && status?.tasteModel && <Chip tone="neutral">Taste Engine: {status.tasteModel}</Chip>}
        </div>

        <Section icon={<BrainCircuit size={15} />} title="What Claude does">
          <li>
            <b>Understands your taste.</b> Type anything you love (a director, boba, brutalism) and Claude describes it as a taste profile: weights on
            16 facets like quiet, bookish or nostalgic, plus words a matching place might list.
          </li>
          <li>
            <b>Reads place listings.</b> Claude reads each nearby listing&apos;s name, kind and description into the same facets, and flags listings
            that look miscategorised so they aren&apos;t passed off as matches.
          </li>
          <li>
            <b>Guides you.</b> The chat guide is a Claude agent with typed tools: it searches, adds interests, compares, saves and plans routed Taste
            Trails by changing what&apos;s on the map, not by writing lists from memory.
          </li>
        </Section>

        <Section icon={<ShieldCheck size={15} />} title="What it never does">
          <li>Invent places, hours, prices or amenities. Every place and fact comes from Google Places or OpenStreetMap; missing details say &ldquo;not listed&rdquo;.</li>
          <li>
            Decide on its own. Matching is a transparent calculation (profile overlap plus listing words) that you can inspect on every place under
            &ldquo;Why this place?&rdquo;, with the shared facets that led to it.
          </li>
          <li>Guess who you are. Profiles describe places, not people: no inferences about age, gender, ethnicity or income.</li>
          <li>Override what you asked for. A request for ramen gets ramen; taste only chooses between real matches.</li>
        </Section>

        <Section icon={<Database size={15} />} title="Your data">
          <li>No account. Interests, saved places and map settings stay in this browser; interests mentioned only in chat aren&apos;t saved.</li>
          <li>
            The Taste Engine sends Claude only the words of your interests and public place listings. When you chat, the guide also sees your
            messages, the area name and the places on screen, nothing else.
          </li>
          <li>Without a Claude key, the same engine runs on a hand-written lexicon and word rules, so the app still works offline from AI.</li>
        </Section>

        <section className="mt-5 rounded-[var(--radius-lg)] bg-gradient-to-br from-lavender/35 to-sunset/20 p-4 ring-1 ring-lilac/25">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5A4791]/80">
            <Sparkles size={13} /> How Elsewhere reads your taste right now
          </h3>
          {profile.length ? (
            <ul className="mt-3 space-y-1.5">
              {profile.map(([f, v]) => (
                <li key={f} className="grid grid-cols-[88px_1fr] items-center gap-2 text-[12.5px] text-plum">
                  <span>{FACET_LABEL[f]}</span>
                  <span className="h-1.5 rounded-full bg-white/70">
                    <span className="block h-full rounded-full bg-gradient-to-r from-sunset to-lilac" style={{ width: `${Math.round(v * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-soft">
              <EyeOff size={13} /> No interests yet. Add some in the Taste tab, or tell the guide what you love.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {icon} {title}
      </h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-plum marker:text-rose/60">{children}</ul>
    </section>
  );
}
