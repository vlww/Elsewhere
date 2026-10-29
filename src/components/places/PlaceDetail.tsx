"use client";

import { useEffect, useRef } from "react";
import { ArrowUpRight, Bookmark, ChevronLeft, Footprints, Globe, MessageCircle, Phone, Wifi, X } from "lucide-react";
import { useElsewhere } from "@/store/useElsewhere";
import { distanceM, formatDistance, walkMinutes } from "@/lib/geo";
import type { Recommendation, Verified } from "@/types";
import { Button, Chip, IconButton, cx } from "@/components/ui/primitives";
import { PlaceArt } from "./PlaceArt";
import { CATEGORY_LABEL, CATEGORY_META } from "./categoryMeta";
import { CulturalBlock, PracticalList, ScoreBars } from "./evidence";

const SOURCE_LABEL = { osm: "OpenStreetMap", google: "Google Places", qloo: "Qloo", "demo-snapshot": "OpenStreetMap snapshot" } as const;

function Amenity({ label, v }: { label: string; v: Verified }) {
  return (
    <li className="flex items-center justify-between py-1.5 text-[13px]">
      <span className="text-plum">{label}</span>
      <span className={cx("font-medium", v === "yes" ? "text-[#4E6446]" : v === "no" ? "text-[#8A4E2C]" : "text-ink-faint")}>
        {v === "yes" ? "Listed" : v === "no" ? "Listed as no" : "Not listed"}
      </span>
    </li>
  );
}

export function PlaceDetail() {
  const id = useElsewhere((s) => s.selectedPlaceId);
  const open = useElsewhere((s) => s.detailOpen);
  const result = useElsewhere((s) => s.result);
  const trail = useElsewhere((s) => s.trail);
  const saved = useElsewhere((s) => s.saved);
  const tasteOn = useElsewhere((s) => s.lensMode === "taste" && s.tasteSignals.length > 0);
  const { closeDetail, select, toggleSave, sendMessage, setMobileTab } = useElsewhere.getState();
  const closeRef = useRef<HTMLButtonElement>(null);

  const rec: Recommendation | undefined =
    result?.recommendations.find((r) => r.place.id === id) ?? trail?.stops.find((s) => s.placeId === id)?.rec;
  const place = rec?.place ?? (id ? saved[id]?.place : undefined);

  const nearby =
    place && result
      ? result.recommendations
          .filter((r) => r.place.id !== place.id)
          .map((r) => ({ r, d: distanceM(place, r.place) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, 3)
      : [];

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDetail();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, id, closeDetail]);

  if (!open || !place) return null;
  const isSaved = !!saved[place.id];
  const meta = CATEGORY_META[place.category];
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}&travelmode=walking`;
  const hoursLines = place.openingHoursText ?? (place.openingHoursRaw ? place.openingHoursRaw.split(/;\s*/) : []);

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="detail-title"
      className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-[inherit] bg-ivory animate-rise"
    >
      <div className="relative shrink-0">
        <PlaceArt place={place} className="h-48 w-full" showCredit />
        <div className="absolute inset-x-0 top-0 flex justify-between p-2.5">
          <button
            ref={closeRef}
            onClick={closeDetail}
            className="inline-flex h-9 items-center gap-1 rounded-full bg-ivory/90 pl-2 pr-3 text-[13px] font-medium text-aubergine shadow-[var(--shadow-card)] backdrop-blur"
          >
            <ChevronLeft size={16} /> Results
          </button>
          <IconButton label="Close details" onClick={closeDetail} className="bg-ivory/90 text-aubergine shadow-[var(--shadow-card)] backdrop-blur">
            <X size={16} />
          </IconButton>
        </div>
      </div>

      <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        <div className="-mt-1 pt-4">
          <p className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.12em] text-ink-faint">
            <meta.icon size={13} /> {CATEGORY_LABEL[place.category]}
            {rec && <> · {formatDistance(rec.distanceM)} away</>}
          </p>
          <h2 id="detail-title" className="mt-1 font-serif text-[34px] leading-[1.02] text-aubergine">
            {place.name}
          </h2>
          {place.address && <p className="mt-1.5 text-[13.5px] text-ink-soft">{place.address}</p>}
          {place.description && <p className="mt-3 text-[14px] leading-relaxed text-plum">{place.description}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant={isSaved ? "solid" : "soft"} size="sm" icon={<Bookmark size={14} fill={isSaved ? "currentColor" : "none"} />} onClick={() => toggleSave(place)}>
              {isSaved ? "Saved" : "Save"}
            </Button>
            <a href={directions} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-aubergine ring-1 ring-line-strong hover:bg-white/70">
              <Footprints size={14} /> Directions {rec && <span className="text-ink-faint">· {rec.walkMin} min</span>}
            </a>
            {place.url && (
              <a href={place.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-aubergine ring-1 ring-line-strong hover:bg-white/70">
                <Globe size={14} /> Website
              </a>
            )}
            {place.phone && (
              <a href={`tel:${place.phone}`} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-aubergine ring-1 ring-line-strong hover:bg-white/70">
                <Phone size={14} /> Call
              </a>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={<MessageCircle size={14} />}
              onClick={() => {
                setMobileTab("guide");
                void sendMessage(`Why ${place.name}? Anything I should know before going?`);
              }}
            >
              Ask the guide
            </Button>
          </div>
        </div>

        {rec ? (
          <>
            <section className="mt-6">
              <h3 className="font-serif text-[22px] text-aubergine">Why this place?</h3>
              <p className="mt-1 text-[12.5px] text-ink-soft">{rec.summary}</p>
              <div className="mt-3 rounded-[var(--radius-lg)] bg-white/70 p-4 ring-1 ring-line">
                <h4 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Practical fit</h4>
                <PracticalList items={rec.practical} />
              </div>
              <div className="mt-2.5 rounded-[var(--radius-lg)] bg-gradient-to-br from-lavender/35 to-sunset/20 p-4 ring-1 ring-lilac/25">
                <h4 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5A4791]/80">Cultural fit</h4>
                <CulturalBlock ev={rec.cultural} />
              </div>
              {rec.tradeoffs.length > 0 && (
                <div className="mt-2.5 rounded-[var(--radius-lg)] bg-apricot/15 p-4 ring-1 ring-apricot/30">
                  <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A4E2C]/80">Trade-offs</h4>
                  <ul className="list-disc space-y-0.5 pl-4 text-[13px] text-plum">
                    {rec.tradeoffs.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              <details className="mt-2.5 rounded-[var(--radius-lg)] bg-white/50 p-4 ring-1 ring-line">
                <summary className="cursor-pointer text-[12.5px] font-medium text-plum">How this was ranked</summary>
                <div className="mt-3">
                  <ScoreBars score={tasteOn ? rec.tasteScore : rec.practicalScore} />
                  <p className="mt-2 text-[11.5px] text-ink-faint">
                    Rank {rec.practicalRank} practical · rank {rec.tasteRank} taste-aware.
                  </p>
                </div>
              </details>
            </section>

            <section className="mt-6">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Hours</h3>
              <p className="mt-1.5 text-[13.5px] text-aubergine">
                <Chip tone={rec.openState.status === "open" ? "good" : rec.openState.status === "closed" ? "warn" : "muted"}>{rec.openState.detail}</Chip>
              </p>
              {hoursLines.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[12.5px] text-plum">
                  {hoursLines.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <p className="mt-6 rounded-[var(--radius-md)] bg-white/60 p-3 text-[13px] text-ink-soft ring-1 ring-line">
            Saved place. Run a search nearby to see how it fits right now.
          </p>
        )}

        <section className="mt-6">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Amenities</h3>
          <ul className="mt-1 divide-y divide-line/70">
            <Amenity label="Wi-Fi" v={place.wifi} />
            <Amenity label="Outdoor seating" v={place.outdoorSeating} />
            <Amenity label="Step-free access" v={place.wheelchair} />
          </ul>
          {place.rating !== undefined && (
            <p className="mt-2 text-[12.5px] text-plum">
              Rating {place.rating}
              {place.ratingCount ? ` from ${place.ratingCount} reviews` : ""} · {SOURCE_LABEL[place.source]}
            </p>
          )}
        </section>

        {nearby.length > 0 && (
          <section className="mt-6">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Nearby alternatives</h3>
            <ul className="mt-2 space-y-1.5">
              {nearby.map(({ r, d }) => {
                const Icon = CATEGORY_META[r.place.category].icon;
                return (
                  <li key={r.place.id}>
                    <button onClick={() => select(r.place.id, { focus: true })} className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] bg-white/60 px-3 py-2.5 text-left ring-1 ring-line hover:bg-white">
                      <Icon size={15} className="text-rose-deep" />
                      <span className="flex-1 truncate text-[13.5px] font-medium text-aubergine">{r.place.name}</span>
                      <span className="text-[12px] text-ink-faint">{walkMinutes(d)} min from here</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <footer className="mt-8 space-y-1 border-t border-line pt-3 text-[11px] leading-snug text-ink-faint">
          <p>
            Data: {SOURCE_LABEL[place.source]}
            {place.dataNote ? ` · ${place.dataNote}` : ""}.
            {place.providerUrl && (
              <>
                {" "}
                <a href={place.providerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline">
                  View source <ArrowUpRight size={10} />
                </a>
              </>
            )}
          </p>
          {place.wifi === "yes" && (
            <p className="flex items-center gap-1">
              <Wifi size={10} /> Listed amenities reflect the source, not current conditions.
            </p>
          )}
        </footer>
      </div>
    </section>
  );
}
