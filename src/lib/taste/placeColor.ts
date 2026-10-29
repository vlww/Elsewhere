/**
 * A place's own colour for the Taste Layer: the dominant colour of its photo (a logo, a storefront, the
 * food), softened into a pastel. Places without a usable photo get a stable pick from the sunset palette.
 */

export interface PlaceColor {
  fill: string;
  deep: string;
}

/** Sunset pastels (orange → pink → purple) for places with no photo colour. */
const SUNSET_FALLBACK: PlaceColor[] = [
  { fill: "#F6B98F", deep: "#B5643A" },
  { fill: "#F5B07A", deep: "#A85A26" },
  { fill: "#F2958A", deep: "#B24E45" },
  { fill: "#F2A7BC", deep: "#B04F78" },
  { fill: "#E9A5C9", deep: "#9A4C7E" },
  { fill: "#C9A8E6", deep: "#6E4A9E" },
];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Same place, same colour, every time. */
export function fallbackColor(placeId: string): PlaceColor {
  return SUNSET_FALLBACK[hash(placeId) % SUNSET_FALLBACK.length];
}

function hsl(h: number, s: number, l: number) {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** A pastel fill and a deeper shade for text and strokes, both at the photo's hue. */
export function pastelFromHue(hue: number, sat: number): PlaceColor {
  const s = Math.max(0.42, Math.min(0.78, sat));
  return { fill: hsl(hue, s, 0.79), deep: hsl(hue, Math.min(s, 0.62), 0.37) };
}

/**
 * Dominant hue of RGB(A) pixels: hues are bucketed, weighted toward saturated mid-tone pixels (so white
 * walls, black text and grey pavement don't win), and the winning bucket is averaged. Null when the
 * image is essentially colourless.
 */
export function dominantHue(px: Uint8Array | Uint8ClampedArray, channels: number): { hue: number; sat: number } | null {
  const BUCKETS = 24;
  const weight = new Float64Array(BUCKETS);
  const sx = new Float64Array(BUCKETS);
  const sy = new Float64Array(BUCKETS);
  const ss = new Float64Array(BUCKETS);
  let total = 0;
  for (let i = 0; i < px.length; i += channels) {
    if (channels === 4 && px[i + 3] < 128) continue;
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d < 0.08 || l < 0.12 || l > 0.93) continue;
    const s = d / (1 - Math.abs(2 * l - 1));
    if (s < 0.2) continue;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const w = s * (1 - Math.abs(l - 0.5) * 1.4);
    if (w <= 0) continue;
    const k = Math.floor(h / (360 / BUCKETS)) % BUCKETS;
    weight[k] += w;
    sx[k] += Math.cos((h * Math.PI) / 180) * w;
    sy[k] += Math.sin((h * Math.PI) / 180) * w;
    ss[k] += s * w;
    total += w;
  }
  if (total < 1) return null;
  // Neighbouring buckets count toward a peak, so a hue split across a boundary still wins.
  let best = 0, bestW = -1;
  for (let k = 0; k < BUCKETS; k++) {
    const w = weight[k] + 0.5 * (weight[(k + 1) % BUCKETS] + weight[(k + BUCKETS - 1) % BUCKETS]);
    if (w > bestW) {
      bestW = w;
      best = k;
    }
  }
  if (weight[best] / total < 0.06) return null;
  const hue = ((Math.atan2(sy[best], sx[best]) * 180) / Math.PI + 360) % 360;
  return { hue, sat: ss[best] / weight[best] };
}
