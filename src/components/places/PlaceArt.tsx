"use client";

import { useState } from "react";
import type { Place } from "@/types";
import { CATEGORY_META } from "./categoryMeta";

/**
 * Real photo when the provider supplies one; otherwise an abstract, category-tinted illustration.
 * The fallback never imitates a photo of the place.
 */
export function PlaceArt({ place, className = "", showCredit = false }: { place: Place; className?: string; showCredit?: boolean }) {
  const [failed, setFailed] = useState(false);
  const meta = CATEGORY_META[place.category];
  const Icon = meta.icon;
  const [a, b, c] = meta.art;
  // Deterministic composition per place so cards don't look identical.
  const seed = [...place.id].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const cx = 20 + (seed % 60);
  const cy = 25 + ((seed >> 3) % 50);
  const tilt = (seed % 40) - 20;

  if (place.imageUrl && !failed) {
    return (
      <div className={`relative overflow-hidden bg-peach ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- provider images come from varied hosts */}
        <img src={place.imageUrl} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        {showCredit && place.imageCredit && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/35 px-2 py-0.5 text-[10px] text-white/90 backdrop-blur">{place.imageCredit}</span>
        )}
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className={`relative overflow-hidden ${className}`}
      style={{
        background: `radial-gradient(120% 90% at ${cx}% ${cy}%, ${a} 0%, ${b} 55%, ${c} 130%)`,
      }}
    >
      <div
        className="absolute -bottom-1/3 -right-1/4 h-[120%] w-[90%] rounded-[45%] opacity-40"
        style={{ background: `linear-gradient(${tilt + 140}deg, ${c}, transparent 70%)`, transform: `rotate(${tilt}deg)` }}
      />
      <div className="absolute inset-0 opacity-[0.09] mix-blend-multiply [background-image:radial-gradient(#302638_0.6px,transparent_0.6px)] [background-size:6px_6px]" />
      <Icon className="absolute left-4 bottom-3 h-7 w-7 text-aubergine/55" strokeWidth={1.4} />
      <span className="absolute right-4 top-2 font-serif text-5xl leading-none text-white/70 select-none">{place.name.trim()[0]}</span>
    </div>
  );
}
