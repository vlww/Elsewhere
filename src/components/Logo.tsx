import { useId } from "react";

/** Dark orange → sunset rose → dark purple, shared by the mark and the wordmark. */
const SUNSET = ["#C2410C", "#E2531F", "#D9467A", "#8B2F8F", "#3F1C5C"];

/** A sun setting into banded water: the half sun is cut by horizon stripes, with short rays above. */
function SunsetMark({ size = 30 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}-sun`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F7B267" />
          <stop offset="0.45" stopColor={SUNSET[1]} />
          <stop offset="1" stopColor={SUNSET[2]} />
        </linearGradient>
        <linearGradient id={`${id}-ray`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={SUNSET[0]} />
          <stop offset="1" stopColor={SUNSET[3]} />
        </linearGradient>
        <mask id={`${id}-bands`}>
          <rect width="32" height="32" fill="#fff" />
          <rect x="0" y="19.2" width="32" height="1.6" fill="#000" />
          <rect x="0" y="22.6" width="32" height="1.3" fill="#000" />
          <rect x="0" y="25.6" width="32" height="1" fill="#000" />
        </mask>
      </defs>
      <g stroke={`url(#${id}-ray)`} strokeWidth="1.8" strokeLinecap="round">
        <line x1="16" y1="2.5" x2="16" y2="5.5" />
        <line x1="6.3" y1="6.6" x2="8.4" y2="8.7" />
        <line x1="25.7" y1="6.6" x2="23.6" y2="8.7" />
        <line x1="2.4" y1="15.6" x2="5.3" y2="15.6" />
        <line x1="29.6" y1="15.6" x2="26.7" y2="15.6" />
      </g>
      <path d="M5 27.5 A11 11 0 0 1 27 27.5 Z" fill={`url(#${id}-sun)`} mask={`url(#${id}-bands)`} transform="translate(0 -1.5)" />
      <line x1="3.5" y1="28.6" x2="28.5" y2="28.6" stroke={SUNSET[4]} strokeWidth="1.8" strokeLinecap="round" />
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
          backgroundImage: `linear-gradient(100deg, ${SUNSET[0]} 0%, ${SUNSET[1]} 22%, ${SUNSET[2]} 48%, ${SUNSET[3]} 74%, ${SUNSET[4]} 100%)`,
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
