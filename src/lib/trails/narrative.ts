import type { CulturalEvidence, PlaceCategory, TrailSpec } from "@/types";
import { CATEGORY_LABEL } from "@/lib/recommendations/activities";

/**
 * Elsewhere's editorial layer for trails: how long people tend to spend at a kind of place, what you
 * can do there, and how a stop's role reads in the arc. All of it is presented as estimate or synthesis,
 * never as a fact about a specific venue.
 */

/** Typical minutes at each kind of place (estimate). */
export const STAY_MIN: Record<PlaceCategory, number> = {
  cafe: 30,
  tea: 35,
  library: 40,
  bookstore: 25,
  park: 30,
  garden: 30,
  gallery: 35,
  museum: 70,
  arts_centre: 45,
  coworking: 60,
  cinema: 110,
  music: 25,
  community: 30,
  plaza: 15,
  food: 50,
  other: 25,
};
export const MIN_STAY = 12;

/** What you can do there, phrased as typical for the kind of place. */
export const ACTIVITY: Record<PlaceCategory, string> = {
  cafe: "grab a coffee and a seat",
  tea: "slow down with something to sip",
  library: "read or browse somewhere quiet",
  bookstore: "browse the shelves",
  park: "walk or sit outside",
  garden: "sit among the plants",
  gallery: "look at whatever's on the walls",
  museum: "take in a collection",
  arts_centre: "see what's on or making things",
  coworking: "settle in and get something done",
  cinema: "catch a screening",
  music: "dig through records",
  community: "see what the neighbourhood's up to",
  plaza: "people-watch for a few minutes",
  food: "eat",
  other: "have a look around",
};

const ROLE = { first: "Start here", middle: "Then", last: "Finish" } as const;

export function roleLine(i: number, n: number, cat: PlaceCategory) {
  const role = i === 0 ? ROLE.first : i === n - 1 ? ROLE.last : ROLE.middle;
  const what = ACTIVITY[cat];
  if (i === 0) return `${role}: ${what} to set the tone.`;
  if (i === n - 1) return `${role} by taking time to ${what}.`;
  return `${role} ${what}, a change of pace from the last stop.`;
}

/** Evidence-grounded cultural line, or undefined when there's no signal for this place. */
export function culturalLine(ev: CulturalEvidence | undefined, interestNames: string[]): string | undefined {
  if (!ev) return undefined;
  const top = [...ev.contributions].sort((a, b) => b.score - a.score)[0];
  const who = top?.entityName ?? (interestNames.length === 1 ? interestNames[0] : undefined);
  const aff = ev.affinity !== undefined ? ` (affinity ${ev.affinity.toFixed(2)})` : "";
  if (ev.provenance === "demo") return `Simulated in demo mode: leans toward ${who ?? "your interests"}${aff}.`;
  const how = ev.match === "name-proximity" ? " Matched to this listing by name and location." : ev.match === "qloo-place" ? " Surfaced by Qloo." : "";
  return `Qloo predicts affinity here among people who like ${who ?? "your interests"}${aff}.${how}`;
}

const OUTSIDE: PlaceCategory[] = ["park", "garden", "plaza"];

const an = (word: string) => (/^[aeiou]/i.test(word) ? "An" : "A");

function partOfDay(hhmm: string) {
  const h = Number(hhmm.slice(0, 2));
  return h < 11 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
}

/** A short, honest title and theme from what the trail actually contains. */
export function titleAndTheme(cats: PlaceCategory[], spec: TrailSpec, startAt: string, interests: string[]) {
  const when = partOfDay(startAt);
  const has = (list: PlaceCategory[]) => cats.some((c) => list.includes(c));
  const mood = spec.mood.join(" ").toLowerCase();
  let title: string;
  if (spec.surprise) title = "The Unexpected City";
  else if (spec.maxPriceLevel === 1) title = `The Budget ${when === "Evening" ? "Evening" : "Reset"}`;
  else if (/\b(creative|art|inspir)/.test(mood) && has(["gallery", "museum", "arts_centre", "bookstore", "music"])) title = `The Creative ${when}`;
  else if (cats.includes("cinema")) title = "The Film Walk";
  else if (/date|romantic/.test(mood)) title = `${an(when)} ${when} for Two`;
  else if (has(["gallery", "museum", "arts_centre"]) && has(OUTSIDE)) title = `The Creative ${when}`;
  else if (has(["bookstore", "library"]) && (has(OUTSIDE) || has(["tea", "cafe"]))) title = `The Slow ${when}`;
  else if (/\b(nature|photo|shoot|green|outdoor)/.test(mood) && has(OUTSIDE)) title = `The Green ${when}`;
  else if (cats.includes("music")) title = "Crates & Corners";
  else if (cats[cats.length - 1] === "food") title = `${when} into Dinner`;
  else title = `${an(when)} ${when} Wander`;

  const parts = [
    has(["gallery", "museum", "arts_centre"]) ? "art" : has(["bookstore", "library"]) ? "books" : has(["music"]) ? "records" : cats.includes("cinema") ? "a film" : null,
    has(OUTSIDE) ? "open air" : null,
    cats.includes("food") ? "a proper meal" : has(["cafe", "tea"]) ? "a slow coffee" : null,
  ].filter((x): x is string => !!x);
  const kinds = cats.map((c) => CATEGORY_LABEL[c].toLowerCase());
  const list = parts.length ? parts : kinds;
  const theme = list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0];
  return {
    title,
    theme: interests.length ? `${capital(theme)}, leaning on ${interests.slice(0, 3).join(", ")}` : capital(theme),
  };
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "14:05" → "2:05 PM". */
export function fmtClock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function fmtDuration(min: number) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

const MODE_WORD = { walking: "on foot", cycling: "by bike", driving: "by car" } as const;

export function summaryLine(names: string[], cats: PlaceCategory[], totalMin: number, mode: keyof typeof MODE_WORD) {
  const n = names.length;
  const nums = ["", "One", "Two", "Three", "Four", "Five"];
  const parts = names.map((name, i) => `${name} to ${ACTIVITY[cats[i]]}`);
  const flow = n > 2 ? `start at ${parts[0]}, then ${parts.slice(1, -1).join(", then ")}, and finish at ${parts[n - 1]}` : `start at ${parts[0]} and finish at ${parts[1]}`;
  return `${nums[n] ?? n} stops, about ${fmtDuration(totalMin)} ${MODE_WORD[mode]}: ${flow}.`;
}
