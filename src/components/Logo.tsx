import { useId } from "react";

/** Orange → sunset rose → dark purple, shared by the mark and the wordmark. */
const SUNSET = ["#F97316", "#F0563A", "#E0457B", "#8B2F8F", "#3F1C5C"];

/**
 * A sun on the horizon: a solid dome on top, and below it three stripes that form an E. The E's spine
 * is the lower-left curve of the circle, and its middle arm stops halfway.
 */
function SunsetMark({ size = 30 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  const stroke = { stroke: `url(#${id}-sun)`, strokeWidth: 2.9, strokeLinecap: "round" as const, fill: "none" };
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}-sun`} gradientUnits="userSpaceOnUse" x1="0" y1="3" x2="0" y2="29">
          <stop offset="0" stopColor="#FFC94D" />
          <stop offset="0.38" stopColor={SUNSET[0]} />
          <stop offset="0.7" stopColor={SUNSET[2]} />
          <stop offset="1" stopColor={SUNSET[3]} />
        </linearGradient>
      </defs>
      {/* Circle: centre (16, 15.5), radius 13. */}
      <path d="M3 15.5 A13 13 0 0 1 29 15.5 Z" fill={`url(#${id}-sun)`} />
      <path d="M3.6 19.6 L28.3 19.6" {...stroke} />
      <path d="M5.8 23.6 L19.5 23.6" {...stroke} />
      <path d="M10.6 27.6 L25 27.6" {...stroke} />
      <path d="M3.6 19.6 A13 13 0 0 0 10.6 27.6" {...stroke} />
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
