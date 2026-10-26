"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin, Search, Sparkles } from "lucide-react";
import { useElsewhere } from "@/store/useElsewhere";
import { Button } from "@/components/ui/primitives";
import type { UserLocation } from "@/types";

export function LocationSearch({ onDone, compact = false }: { onDone?: () => void; compact?: boolean }) {
  const setLocation = useElsewhere((s) => s.setLocation);
  const requestDeviceLocation = useElsewhere((s) => s.requestDeviceLocation);
  const geoState = useElsewhere((s) => s.geoState);
  const status = useElsewhere((s) => s.status);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<UserLocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (compact) inputRef.current?.focus();
  }, [compact]);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setHits(json.results ?? []);
      if (!json.results?.length) setError(json.error ? "Location search is unavailable right now." : "Nothing found — try a neighbourhood or campus name.");
    } catch {
      setError("Location search is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }

  const pick = (loc: UserLocation) => {
    setLocation(loc);
    setHits([]);
    setQ("");
    onDone?.();
  };

  const demo = status?.demoArea;
  return (
    <div className="space-y-2.5">
      <form onSubmit={search} className="flex items-center gap-2 rounded-full bg-white/80 py-1 pl-3.5 pr-1 ring-1 ring-line focus-within:ring-rose/60">
        <Search size={15} className="text-ink-faint" aria-hidden />
        <label className="sr-only" htmlFor="loc-search">Neighbourhood, campus or address</label>
        <input
          id="loc-search"
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Neighbourhood, campus or address"
          className="h-8 min-w-0 flex-1 bg-transparent text-sm text-aubergine outline-none placeholder:text-ink-faint"
        />
        <Button type="submit" size="sm" variant="solid" disabled={busy || q.trim().length < 2}>
          {busy ? "…" : "Go"}
        </Button>
      </form>
      {hits.length > 0 && (
        <ul className="overflow-hidden rounded-[var(--radius-md)] bg-white/80 ring-1 ring-line">
          {hits.map((h, i) => (
            <li key={i}>
              <button onClick={() => pick(h)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-plum hover:bg-peach/60">
                <MapPin size={14} className="shrink-0 text-rose" /> {h.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="px-1 text-[12.5px] text-ink-soft">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          icon={<LocateFixed size={14} />}
          onClick={() => {
            requestDeviceLocation();
            onDone?.();
          }}
          disabled={geoState === "asking"}
        >
          {geoState === "asking" ? "Asking…" : "Use my location"}
        </Button>
        {demo && (
          <Button size="sm" variant="soft" icon={<Sparkles size={14} />} onClick={() => pick({ ...demo.center, label: "Washington Square, New York", source: "demo" })}>
            Try the demo area
          </Button>
        )}
      </div>
      {geoState === "denied" && <p className="px-1 text-[12.5px] text-ink-soft">Location is off for this site — no problem, search for a place instead.</p>}
      {geoState === "unavailable" && <p className="px-1 text-[12.5px] text-ink-soft">Couldn&apos;t get your location. Search for a place instead.</p>}
    </div>
  );
}

/** First-run card: explains why location helps, never auto-prompts. */
export function LocationGate() {
  const location = useElsewhere((s) => s.location);
  if (location) return null;
  return (
    <div className="pointer-events-auto w-[min(440px,calc(100vw-32px))] rounded-[var(--radius-xl)] surface p-6 animate-rise">
      <p className="font-serif text-[34px] leading-[1.05] text-aubergine">
        Let&apos;s see what&apos;s <em>around.</em>
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
        Places to study, read, think, or meet a friend — chosen for what you need and, if you like, what you love. Your location is only used to search nearby; it isn&apos;t stored.
      </p>
      <div className="mt-5">
        <LocationSearch />
      </div>
    </div>
  );
}
