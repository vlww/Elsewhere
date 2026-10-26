"use client";

import { Bookmark, Eye, Sparkles, X } from "lucide-react";
import { useElsewhere } from "@/store/useElsewhere";
import { IconButton } from "@/components/ui/primitives";
import { CATEGORY_LABEL } from "./categoryMeta";
import { PlaceArt } from "./PlaceArt";

export function SavedPanel() {
  const saved = useElsewhere((s) => s.saved);
  const agentReady = useElsewhere((s) => s.status?.agent.configured ?? false);
  const { toggleSave, select, sendMessage, setMobileTab, setPanel, runSearch } = useElsewhere.getState();
  const list = Object.values(saved).sort((a, b) => b.savedAt.localeCompare(a.savedAt));

  return (
    <section aria-label="Saved places" className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pb-3 pt-4">
        <h2 className="font-serif text-[26px] leading-none text-aubergine">Saved</h2>
        <p className="mt-1.5 text-[12px] text-ink-faint">Kept on this device only — no account needed.</p>
      </div>
      <div className="scroll-soft min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
        {!list.length && (
          <div className="rounded-[var(--radius-lg)] bg-white/60 p-5 text-center ring-1 ring-line">
            <Bookmark className="mx-auto text-rose" size={20} />
            <p className="mt-2 text-[13.5px] text-plum">Nothing saved yet. Tap the bookmark on any place to keep it here.</p>
          </div>
        )}
        {list.map(({ place }) => (
          <article key={place.id} className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-white/75 p-2.5 ring-1 ring-line">
            <PlaceArt place={place} className="h-14 w-14 shrink-0 rounded-[12px]" />
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-serif text-[18px] leading-tight text-aubergine">{place.name}</h3>
              <p className="text-[12px] text-ink-soft">
                {CATEGORY_LABEL[place.category]}
                {place.address ? ` · ${place.address}` : ""}
              </p>
            </div>
            <IconButton
              label={`Show ${place.name} on map`}
              onClick={() => {
                setPanel("results");
                select(place.id, { focus: true });
              }}
            >
              <Eye size={15} />
            </IconButton>
            <IconButton
              label={`Find places like ${place.name}`}
              onClick={() => {
                setPanel("results");
                if (agentReady) {
                  setMobileTab("guide");
                  void sendMessage(`Find me more places like ${place.name} (a ${CATEGORY_LABEL[place.category].toLowerCase()}) nearby.`);
                } else void runSearch({ includeCategories: [place.category] });
              }}
            >
              <Sparkles size={15} />
            </IconButton>
            <IconButton label={`Remove ${place.name}`} onClick={() => toggleSave(place)}>
              <X size={15} />
            </IconButton>
          </article>
        ))}
      </div>
    </section>
  );
}
