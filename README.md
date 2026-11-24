---

![Elsewhere](https://findelsewhere.vercel.app/devpost/elsewhere-banner.webp)

### **Live Demo:** https://findelsewhere.vercel.app  
### **GitHub:** https://github.com/vlww/Elsewhere

---

## Project Overview

**Elsewhere** is an AI map guide that helps you find places you'll actually enjoy, not just places that are nearby.

Tell it what you love (filmmakers, music artists, food, architecture) and what you need right now (for example, "somewhere quiet to read for an hour"). Elsewhere ranks real places around you, lights up the ones that match your taste on a 2D or immersive 3D map, explains every match in plain language, and can plan a routed, timed outing through several stops that you can edit by chatting.

At its core is the **Elsewhere Taste Engine**, which uses the Anthropic API to turn anything you type into a taste profile and to read nearby place listings into the same vocabulary, so it can show *why* a place fits you.

## Problem and Solution

**The problem.** Map apps answer "what's near me?", but not "where would I enjoy spending time?". If you search for coffee shops near you, you get a list sorted by distance and stars. However, it doesn't know if you'd rather sit in a cozy bookstore or a polished chain café. Many people feel this: 47% of people who work from cafés do it for a change of scene, yet most of us end up rotating through the same two or three places. And people rarely know how to describe their taste in the terms a search box understands.

**Who it's for.** Students and young adults who study, work, read or meet friends outside home and want somewhere new, plus anyone exploring an unfamiliar neighborhood with a free afternoon.

**The solution.** Elsewhere lets you describe your taste in your own words and connects it to real places:

- **Taste in your own words.** Pick vibes (Cozy, Quiet, Vintage, Hidden gem) or type anything you love. The Anthropic API reads it into a taste profile, so "Murakami" leads to bookstores and record shops, and "brutalism" leads to architecture and galleries.
- **Explainable recommendations.** Every place has a practical score (distance, listed hours, amenities, fit for what you're doing) and a taste score. "Why this place?" shows the shared facets and the listing words behind a match. For example: *"Shares Haruki Murakami's bookish and musical side; the listing mentions 'records'."*
- **A map that shows your taste.** The Taste Layer highlights matching places in 2D, or turns them into lit 3D buildings in Immersive mode.
- **Taste Trails.** Ask for "a bookstore, somewhere green, then cheap food before 6" and the guide builds a routed itinerary with travel times and opening-hours checks. You can then revise it by chatting ("make it cheaper", "swap the last stop for something artsy").
- **What you asked for comes first.** A request for ramen gets ramen; taste only chooses between real matches.

## AI Implementation

Elsewhere uses Claude through the **Anthropic API** (`@anthropic-ai/sdk`) in three roles, all server-side in Next.js API routes.

**1. Taste Engine: understanding interests** (`src/lib/taste/ai.ts`, Claude Haiku 5.5)
When you type an interest, the Anthropic API returns **structured output** (validated with Zod via `messages.parse` + `zodOutputFormat`): the real things you might mean (e.g. *Haruki Murakami, Japanese novelist*), each with weights over 16 taste facets (quiet, bookish, nostalgic, design-minded, offbeat…), words a matching place might list (*jazz, vinyl, books*), and the kinds of place a fan would enjoy. A second reading treats the text "as typed", so free-form interests like "rainy day jazz" work too. The prompt tells the API to list only things it's confident exist, never to invent details, and to make no assumptions about the person's demographics.

**2. Taste Engine: reading place listings** (Claude Haiku 5.5)
The API reads nearby listings (name, kind, tags, description from Google Places / OpenStreetMap) in parallel batches and describes each in the same 16 facets. It also **flags listings that look miscategorised**: Google files some offices as "bookstores", and those are never shown as taste matches. Readings are cached per place, start in the background before you add any interest, and are time-boxed (1.5 s), so the model never slows results down.

**3. The guide: a tool-using agent** (`src/lib/agent/`, Claude Opus 5.5)
The chat guide is an agent with **15 typed tools**: search places, look up and add interests, compare, save, toggle the Taste Layer, and plan or revise Taste Trails. Its tool calls change the shared app state, so the map responds as it works. Tool inputs are validated with Zod, the system prompt and conversation are **prompt-cached**, and tool rounds and output are capped to keep turns fast and cheap.

**How the pieces combine.** Matching is deliberately not a black box. Each place gets a profile built from its listed facts (24 transparent word rules plus its category, amenities, price and rating), blended with the API's reading. Affinity is the facet similarity between your interests and the place, plus keyword hits in the listing, plus kind-of-place fit. Each match carries the interest that led, the shared facets, the matched words and a one-line reason. A deterministic ranker then blends taste with practical fit, and OSRM routing plus opening-hours checks turn matches into realistic trails.

**Responsible use of AI**
- Every fact comes from a place provider, and missing data is labelled as unlisted.
- Taste matches are labelled as estimates and always shown with their reasons.
- Profiles describe places, not people: no demographic inference.
- No accounts: interests and saved places stay in your browser.
- Without an API key, the same engine runs on a hand-written lexicon of 49 interests and the listing rules, so the app degrades gracefully.

**Stack:** Anthropic API (Claude Opus 5.5 and Haiku 5.5), Next.js 16, React 19, TypeScript, Zod, Zustand, MapLibre GL, Three.js, Google Places API, OpenStreetMap / OpenFreeMap, OSRM, sharp, Vitest, Vercel.

---

![Inspiration](https://findelsewhere.vercel.app/devpost/section-inspiration.webp)

As a college student, I've gotten tired of going to the same library to study or the same coffee shop to work.

I'm not alone in this. According to an O2 Business survey, 47% of people who work from cafés do so because they enjoy the change of environment. Other times, you just want a quiet place to read, somewhere green to take photos, or a new spot to spend an afternoon.

The problem is that finding somewhere new doesn't necessarily mean finding somewhere you'll actually enjoy.

If you open Google Maps and search for "coffee shops near me", you'll get plenty of options, but those recommendations don't really know you. Google prioritizes convenience, not taste, so it doesn't know that you might prefer a cozy bookstore over a trendy restaurant.

I wanted to build something that goes beyond finding what's nearby. Something that understands both what you need right now and what you love, without leading you to the same old café. Sometimes, you just want to go **Elsewhere**.

![47% enjoy a change of environment, 58% are frustrated by impersonal experiences, 150% growth in "near me" searches](https://findelsewhere.vercel.app/devpost/stats.webp?v=2)

---

![What It Does](https://findelsewhere.vercel.app/devpost/section-what-it-does.webp)

Elsewhere is a map discovery app that helps you find places you'll actually want to spend time in. You can describe what you're looking for in plain language, and the AI guide searches for real places, uses your interests to personalize recommendations, and can even plan an entire outing.

## Explore
### Find Places That Fit You

Instead of just ranking places by distance, Elsewhere gives each location a practical score based on factors like activity fit, proximity, and available attributes. It also calculates a taste-aware score from the Elsewhere Taste Engine, which compares your interests with each place's own taste profile.

Every recommendation includes a breakdown of why it was selected, so you can understand what makes a place a good fit: the facets it shares with your interests (bookish, nostalgic, design-minded…) and any words in its listing that match. You can filter by category, compare places side by side, save favorites, and give feedback that influences future results. You can also tell the guide what you need directly, in plain text.

![Explore mode with the Taste Layer and a "Why this place?" breakdown](https://findelsewhere.vercel.app/devpost/screens/explore-taste-layer.webp)

## Your Taste
### Recommendations That Know What You Love

Not everyone knows how to describe their taste, so Elsewhere gives you a few ways to express it. You can choose vibes like Cozy, Quiet, Artsy, Vintage, or Hidden Gem. You can also type anything you love: filmmakers, artists, authors, brands, foods, hobbies, or even a mood like "rainy day jazz".

![Your Taste: vibe cards and interests](https://findelsewhere.vercel.app/devpost/screens/taste-panel.webp)

The Anthropic API reads each of these into a taste profile over 16 facets, such as quiet, bookish, nostalgic and offbeat. The Taste Engine then finds the nearby places whose own profiles line up. If what you typed could mean more than one thing, Elsewhere asks: "Murakami" offers both the novelist Haruki Murakami and the artist Takashi Murakami.

**The Taste Layer** takes this a step further by transforming the map itself. In 2D Explore mode, relevant places receive colorful highlights and surrounding building tints. Switch to Immersive mode, and those same locations become detailed 3D buildings with custom facades, rooftop details and lighting.

The colors of highlighted places are even derived from their photos when available, making the map feel connected to the actual city.

![Immersive 3D: buildings around a taste match tinted in warm rings](https://findelsewhere.vercel.app/devpost/screens/immersive-taste-aura.webp)

## Taste Trails
### Turn a Free Afternoon Into an Adventure

Sometimes I don't just want one recommendation. I want an entire afternoon planned out.

With Taste Trails, I can ask Elsewhere to plan a creative afternoon, find three places to explore before dinner, or put together an outing with a bookstore, somewhere to sit outside, and somewhere inexpensive to eat.

The agent combines Taste Engine matches with real places and geographic routing to build a route of two to five stops. It accounts for travel time, estimated arrival times, opening hours, and the time I have available.

The route appears directly on the map as an animated gradient line in 2D or a glowing path with stop beacons in 3D. Each stop includes its own details and explanation of why it belongs in the itinerary.

And the plan isn't set in stone. I can ask to make it cheaper, swap the last stop for something artsy, or spend more time at a particular location. Elsewhere updates the relevant parts of the trail while preserving the rest.

![A Taste Trail in 2D Explore](https://findelsewhere.vercel.app/devpost/screens/trail-explore.webp)

---

![How I Built It](https://findelsewhere.vercel.app/devpost/section-how-i-built-it.webp)

I built Elsewhere from the ground up using Next.js, React, and TypeScript. The biggest challenge was getting several different systems to work together, including a conversational AI agent, a taste-matching engine, real-world place data, geographic routing, and a map that looks and behaves differently depending on the viewing mode.

### The AI Agent

I used the Anthropic API to power Elsewhere's conversational guide. Rather than having the model simply generate recommendations in text, I gave it a collection of typed tools that execute real actions in the application.

The agent can search for places, look up and add interests, highlight locations, compare and save places, plan trails, and revise existing itineraries. These tools run server-side and return validated actions that update the shared application state, so the map and interface respond as the agent works.

I used Zod to validate tool inputs and API responses, which helps keep the agent grounded in actual data instead of letting it invent locations or facts.

### The Taste Engine

The Taste Engine is how Elsewhere connects what you love to where you might go. Interests and places are both described with the same 16 taste facets, so any match can be explained by the facets they share.

When you add an interest, the Anthropic API returns structured output: what you most likely mean, a weight for each facet, words a matching place might list, and the kinds of place a fan would enjoy. For places, a set of transparent rules builds a profile from each listing's facts: its kind, name, tags, description, outdoor seating, price, and whether it's highly rated but little known. The API also reads the same listings in batches and its reading is blended in. While reading, it flags listings filed under the wrong kind of place.

Affinity combines facet similarity, keyword hits in the listing (a record shop for someone who loves Murakami), and kind-of-place fit. Every match records which interest led, which facets it shares and which listing words matched, so the app and the guide can always explain it in a sentence.

I treated the model as a reader, not an oracle. It translates text Elsewhere already has into a shared vocabulary and never adds places or facts. When no API key is configured, the same engine runs on a hand-written lexicon of 49 interests.

### Places, Ranking, and Routing

For real-world place data, I use Google Places API, with OpenStreetMap fallbacks. I built a deterministic ranking system that considers activity fit, proximity, available attributes, and user feedback. The taste-aware ranking adds the Taste Engine's affinity. This lets Elsewhere balance what someone wants to do with what they might enjoy.

For Taste Trails, I use OSRM for geographic routing. The planner evaluates combinations of stops, considers travel time and walkability, checks opening hours at estimated arrival times, and fits the itinerary to the user's time budget. When a user revises a trail, the planner locks untouched stops so it doesn't unnecessarily rebuild the entire outing.

### The Map

I used MapLibre GL for the map, with OpenFreeMap vector tiles and a custom sunset pastel map style. The 2D Taste Layer uses geographic data to render highlights, halos, ripple rings, and tinted building footprints. For Immersive mode, I integrated a custom Three.js layer directly into MapLibre. It extrudes highlighted buildings from real OpenStreetMap footprints and adds procedural facade textures, windows, awnings, rooftop details, and lighting.

I also built the trail visualization using a glowing 3D tube with stop beacons and a moving light effect. Both map modes share the same underlying locations and recommendations, so switching views doesn't change the actual itinerary.

One small but important detail was extracting colors from place photos. I use `sharp` on the server to find dominant colors and convert them into softer pastel shades for the map. This also avoids browser restrictions when accessing images from certain providers.

## Tech Stack

| Technology | Purpose |
|---|---|
| Next.js 16, React 19, TypeScript | Application and server-side API routes |
| Anthropic API (Claude Opus 5.5) | Conversational agent and tool execution |
| Anthropic API (Claude Haiku 5.5, structured outputs) | Taste Engine: interest profiles and listing reads |
| Google Places API (New) | Real-world place search and details |
| OpenStreetMap, OpenFreeMap | Geographic data and map tiles |
| MapLibre GL | Interactive 2D map and geographic rendering |
| Three.js | Immersive 3D buildings and route effects |
| OSRM | Route geometry, distances, and travel-time estimates |
| Zustand | Shared state across the agent, map, and interface |
| Zod | Input and response validation |
| Tailwind CSS | Styling and responsive layouts |
| sharp | Server-side image color extraction |
| Vitest, GitHub Actions | Tests and continuous integration |
| Vercel | Deployment |

---

![Challenges](https://findelsewhere.vercel.app/devpost/section-challenges.webp)

**Making sure taste doesn't override what the user actually asked for**

One early version of the planner interpreted a request for milk tea followed by a nature photography stop too loosely. Because the planner treated the first stop as a generic café, taste ranking could select an unrelated venue.

I fixed this by resolving literal requests through place search first, using synonyms where appropriate, and allowing taste to choose between actual matches rather than override the requested category.

**Making taste matching honest**

It's easy for a taste system to call everything a match, or to sound more certain than it is. Early versions lit up most of the map, and some "bookstores" from the places API turned out to be offices. I added a selectivity threshold so weak overlaps aren't called matches, required every match to carry its reasons, and had the model flag listings filed under the wrong kind of place so they're never passed off as taste matches.

**Keeping the AI fast**

Reading dozens of place listings with a model takes several seconds, too slow for a map that should respond instantly. Now Elsewhere starts reading nearby listings in the background as soon as you open an area, before you add any interest. Readings are cached per place, and a search waits at most 1.5 seconds for the model. Anything not read in time keeps its rule-based profile until the next search.

**Making the 3D map work with real geography**

Integrating Three.js into MapLibre required keeping the 3D scene synchronized with the map camera and rendering lifecycle. I also had to work through layer-ordering issues and redesign the building highlights so their glow followed geographic relationships rather than appearing randomly across map tiles.

**Planning realistic outings**

A route that looks good on a map isn't necessarily a good itinerary. I added arrival-time opening-hours checks, travel-time calculations, time-budget fitting, and logic that preserves stops the user hasn't asked to change.

---

![Accomplishments](https://findelsewhere.vercel.app/devpost/section-accomplishments.webp)

Here are some things I'm really proud of after building this project:

- Creating a taste-aware map that works in both 2D and immersive 3D, with the same recommendations and explanations in both modes
- Building my own explainable Taste Engine, where the Anthropic API reads both interests and place listings into one shared vocabulary, and every match comes with its reasons
- Building editable, multi-stop itineraries with real places, geographic routes, travel estimates, and opening-hours checks
- Making taste input flexible enough to support both predefined vibes and unusual interests entered in free text
- Making recommendations explainable, clearly labeling estimates and missing information instead of inventing details, and adding a "How AI is used" panel that explains all of this inside the app
- Building a demo that still works without API keys, using a real OpenStreetMap snapshot of the demo area and a built-in taste lexicon
- Covering the Taste Engine and ranking with tests that run automatically on every push

---

![What I Learned](https://findelsewhere.vercel.app/devpost/section-what-i-learned.webp)

The biggest lesson was that personalization should shape recommendations without overriding what someone actually needs. A person asking for something specific should get what they want, with their taste helping decide which real option to choose.

I also learned how much work goes into connecting real-world data sources. Matching places across providers, catching miscategorised listings, handling missing hours, and keeping routes realistic turned out to be just as important as the AI itself.

On the technical side, I learned a lot about building tool-using agents, using structured outputs to turn free text into data an engine can reason about, rendering custom Three.js scenes inside a geographic map, and keeping AI fast and affordable with caching, background work, time limits, and prompt caching.

Most importantly, I learned that people don't always know how to describe what they like. Giving them a few options to choose from and letting them type whatever comes to mind can be much more natural than asking them to build a detailed taste profile from scratch.

---

![What's Next](https://findelsewhere.vercel.app/devpost/section-whats-next.webp)

Here are a few ideas I have that might further improve Elsewhere:

- **Group Taste Trails:** Combine multiple people's interests to plan an outing everyone can enjoy
- **Shareable trails:** Let users share an itinerary through a link and eventually sync saved places and interests across devices with accounts
- **Better transportation support:** Add proper public transit routing instead of falling back to walking estimates
- **Events and pop-ups:** Expand discovery beyond permanent places to include local events and temporary experiences
- **Mobile app and offline maps:** Make Elsewhere useful for exploring new cities without needing to stay connected

I want Elsewhere to make exploring a city feel a little more personal. Instead of endlessly scrolling through places and hoping something looks interesting, you should be able to describe the kind of experience you want and let Elsewhere help you find it.

---

## Run It Yourself

```bash
git clone https://github.com/vlww/Elsewhere && cd Elsewhere
npm install
cp .env.example .env.local   # every key is optional
npm run dev                  # http://localhost:3000
```

- **No keys:** choose "Try the demo area" for Washington Square, New York, from a real OpenStreetMap snapshot. Taste matching uses the built-in lexicon.
- **`ANTHROPIC_API_KEY`:** turns on the guide and Claude in the Taste Engine.
- **`GOOGLE_PLACES_API_KEY`:** searches anywhere.

```bash
npm test            # Taste Engine and ranking tests (offline)
npm run typecheck
npm run lint
```

MIT licensed.
