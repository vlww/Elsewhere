# Elsewhere

A map-first place-discovery app for students and young adults. You say what you're after ("two hours to lock in, but not a sterile library") and a Claude-powered guide searches real places nearby, ranks them on practical fit, and, if you share a few films, artists or authors you love, on cultural fit from Qloo. Results land on an interactive map that can switch to an immersive 3D city view.

```bash
npm install          # also copies MapLibre's web worker into public/maplibre/
cp .env.example .env.local   # every key is optional
npm run dev          # http://localhost:3000
```

With no keys at all you can still explore the **demo area** (Washington Square / Greenwich Village, NYC). It uses a real OpenStreetMap snapshot and simulated taste signals, and both are labelled as such in the UI.

## What runs where

| Capability | Live source | Without a key |
|---|---|---|
| Conversational guide | Claude (`claude-opus-5-5`) with tool use, `ANTHROPIC_API_KEY` | Guide panel says it isn't configured; map, filters, Taste Lens and saving still work |
| Cultural intelligence | Qloo `/search` + `/v2/insights` (`QLOO_API_KEY`) | "Taste: demo": a small hand-written fixture; every signal is badged *Simulated* |
| Place inventory | Google Places (New) → Overpass (`OVERPASS_URL`) → demo snapshot | OSM snapshot of the demo area only; searches elsewhere say why they can't run |
| Geocoding | OSM Nominatim | — |
| Map | MapLibre GL + OpenFreeMap vector tiles, recoloured; three.js layer in Immersive mode | — |

All third-party keys stay on the server. Google photos go through `/api/photo` so the key never reaches the browser.

## Architecture

```
src/
  app/api/            chat (streaming agent) · recommend · entities · geocode · photo · status
  lib/agent/          system prompt, typed tool layer (zod-validated), streaming tool loop
  lib/qloo/           API client, entity resolution, insights → evidence adapter, demo fixture
  lib/places/         provider chain (google / overpass / demo), OSM normalisation, opening hours
  lib/recommendations activity-fit table, deterministic ranking, pipeline, taste trails
  store/              zustand store shared by the map, panels and agent
  components/map      MapLibre canvas, recoloured style, three.js immersive layer, controls
  components/chat     guide panel + composer
  components/places   cards, detail, compare, saved
  components/taste    interest search + chips
  types/              shared models + zod schemas
```

**The agent and the map share state.** The browser sends the session (location, constraints, interests, lens, feedback, the visible results) with each message. Server-side tools run the real pipeline and emit typed actions (`results`, `focus`, `save`, `add_taste`, `compare`, `trail`…) that the client store applies, so the cards and markers update as the agent works. The full API transcript, thinking blocks included, is kept client-side and resent append-only each turn. The agent can only add interests whose IDs came back from `find_cultural_entities` in the same conversation.

## Ranking (deterministic, inspectable)

1. **Hard constraints**, applied only where the data is trustworthy: radius, excluded kinds, listed price above budget, *listed* hours say closed (when "open now" is required), listed "no Wi-Fi" (when required). Unknown values never exclude a place; they show up as trade-offs.
2. **Weighted score**, computed in both modes over the *same* candidate set (`src/lib/recommendations/rank.ts`):

| Factor | Practical | Taste-aware | What it is |
|---|---|---|---|
| activity | 0.45 | 0.30 | Place-type fit for the activity (Elsewhere's editorial table, labelled as an estimate) |
| proximity | 0.30 | 0.20 | `exp(−d / 0.6·radius)` |
| attributes | 0.20 | 0.14 | Listed hours/amenities vs the request, keyword hits |
| cultural | 0 | 0.32 | Qloo affinity, rank-normalised within the result set to 0.4–1.0; 0 when Qloo returned nothing for the place |
| feedback | 0.05 | 0.04 | In-session "more like this" / "not for me" |

Qloo's affinity is shown raw and never as a percentage. The total is labelled as Elsewhere's estimate, not a Qloo score. The **Taste Lens** flips between the two orders and shows how far each place moved. If the top five don't really change, it says so.

**Matching Qloo to places:** Insights is called with `filter.type=urn:entity:place`, `signal.interests.entities`, a WKT `POINT` + radius and `feature.explainability=true`. Each Qloo place is matched to the inventory by name tokens and distance under 150 m. Unmatched Qloo places in a supported category join the shared candidate pool for *both* lenses, so the comparison isn't rigged. Per-interest contributions come from `query.explainability`.

**Taste Trails** greedily chain 2–4 distinct kinds of open places within walking limits. The route is labelled as Elsewhere's synthesis; only each stop's own evidence is presented as cultural signal.

## Data honesty

- Nothing is invented: hours, prices, Wi-Fi, outdoor seating and ratings appear only when a source lists them, and are otherwise shown as "not listed".
- "Open now" is evaluated from listed hours (OSM syntax; Google periods are converted to it) at the user's local time.
- Interests mentioned in chat are session-only and marked "this chat"; interests picked in the Taste panel and saved places persist in `localStorage` on this device only. Device location is never persisted.

## Notes

- **Overpass:** the public `overpass-api.de` server now refuses automated traffic, so it's opt-in via `OVERPASS_URL` (self-hosted recommended).
- **Demo snapshot:** rebuild with `scripts/build-demo-snapshot.mjs` (instructions in the file). Data © OpenStreetMap contributors, ODbL.
- **Refusal fallback:** agent requests use Claude's server-side `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`), so a safety-classifier decline is retried on the recommended fallback model.
- **Accessibility:** markers are real buttons with labels; marker kinds differ by icon and shape, not just colour; panels support keyboard and Escape; `prefers-reduced-motion` disables camera flights and 3D animation.
