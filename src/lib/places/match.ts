/**
 * Telling whether two listings name the same venue. Providers (Google, OSM nodes and building outlines)
 * often describe one place as separate records with slightly different names.
 */

const STOP = new Set(["the", "co", "company", "inc", "llc", "nyc", "and", "&", "of", "a", "cafe", "café"]);
const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t && !STOP.has(t)),
  );

const GENERIC = new Set(["books", "bookstore", "coffee", "tea", "library", "park", "garden", "gallery", "museum", "records", "bakery", "bar", "shop", "store", "studio"]);

export function namesMatch(a: string, b: string) {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  // A generic one-word name ("Books", "Coffee") says nothing about which venue it is.
  if (small.size === 1 && big.size > 1 && GENERIC.has([...small][0])) return false;
  let hit = 0;
  for (const t of small) if (big.has(t)) hit++;
  return hit / small.size >= 0.75;
}
