const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Walking estimate: 80 m/min with a 1.25 street-grid factor over straight-line distance. */
export function walkMinutes(meters: number) {
  return Math.max(1, Math.round((meters * 1.25) / 80));
}

export function formatDistance(m: number) {
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function roundCoord(n: number, places = 3) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
