import { useId } from "react";

/** Orange → sunset rose → dark purple, shared by the mark and the wordmark. */
const SUNSET = ["#F97316", "#F0563A", "#E0457B", "#8B2F8F", "#3F1C5C"];

/**
 * A full retro sun. An E is carved out of it: its arms are the horizon stripes of an 80s sunset, running
 * out through the open right side, and below it the stripes keep going, thickening as the sun fades out.
 */
function SunsetMark({ size = 30 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}-sun`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFC94D" />
          <stop offset="0.35" stopColor={SUNSET[0]} />
          <stop offset="0.68" stopColor={SUNSET[2]} />
          <stop offset="1" stopColor={SUNSET[3]} />
        </linearGradient>
        <mask id={`${id}-carve`}>
          <rect width="32" height="32" fill="#fff" />
          <g fill="#000">
            {/* The E: spine, then three arms that thicken downward like sunset stripes. */}
            <rect x="9.6" y="7" width="2.6" height="15" />
            <rect x="9.6" y="7" width="23" height="2.1" />
            <rect x="9.6" y="13.25" width="23" height="2.35" />
            <rect x="9.6" y="19.4" width="23" height="2.6" />
            {/* The fade below. */}
            <rect x="0" y="24.6" width="32" height="1.5" />
            <rect x="0" y="27.5" width="32" height="2.2" />
          </g>
        </mask>
      </defs>
      <circle cx="16" cy="16" r="14.2" fill={`url(#${id}-sun)`} mask={`url(#${id}-carve)`} />
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
