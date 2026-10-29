import { useId } from "react";

/** Orange → sunset rose → dark purple, shared by the mark and the wordmark. */
const SUNSET = ["#F97316", "#F0563A", "#E0457B", "#8B2F8F", "#3F1C5C"];

/**
 * A sun on the horizon: a solid dome on top, and below it three stripes that form an E. The E's spine
 * is the lower-left curve of the circle, and its middle arm stops halfway.
 */
function SunsetMark({ size = 30 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  const stroke = { stroke: `url(#${id}-sun)`, strokeWidth: 2.6, strokeLinecap: "round" as const, fill: "none" };
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}-sun`} gradientUnits="userSpaceOnUse" x1="0" y1="3" x2="0" y2="28">
          <stop offset="0" stopColor="#FFC94D" />
          <stop offset="0.4" stopColor={SUNSET[0]} />
          <stop offset="0.72" stopColor={SUNSET[2]} />
          <stop offset="1" stopColor={SUNSET[3]} />
        </linearGradient>
      </defs>
      {/* One circle: centre (16, 15.5), radius 13. The stripes run on a circle of radius 11.7 so their round ends stay inside it. */}
      <path d="M3 15.5 A13 13 0 0 1 29 15.5 Z" fill={`url(#${id}-sun)`} />
      <path d="M4.62 18.2 L27.38 18.2" {...stroke} />
      <path d="M6.37 22.15 L16.6 22.15" {...stroke} />
      <path d="M11.05 26.1 L20.95 26.1" {...stroke} />
      <path d="M4.62 18.2 A11.7 11.7 0 0 0 11.05 26.1" {...stroke} />
    </svg>
  );
}

/** Elsewhere's logo: the sunset mark and a bold, sunset-gradient blackletter wordmark. */
export function Logo() {
  return (
    <span className="mr-2 inline-flex items-center gap-1.5">
      <SunsetMark />
      <h1
        className="font-serif text-[29px] leading-none tracking-[0.005em]"
        style={{
          backgroundImage: `linear-gradient(100deg, ${SUNSET[0]} 0%, ${SUNSET[1]} 25%, ${SUNSET[2]} 50%, ${SUNSET[3]} 76%, ${SUNSET[4]} 100%)`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          // Pirata One has one weight; a stroke that takes the clipped gradient makes it bold.
          WebkitTextStroke: "1.3px transparent",
          filter: "drop-shadow(0 1px 0.5px rgb(63 28 92 / 0.18))",
        }}
      >
        Elsewhere
      </h1>
    </span>
  );
}
