![Elsewhere](https://findelsewhere.vercel.app/devpost/elsewhere-banner.webp)

**Live Demo:** https://findelsewhere.vercel.app  
**GitHub:** https://github.com/vlww/Elsewhere

---

![Inspiration](https://findelsewhere.vercel.app/devpost/section-inspiration.webp)

As a college student, I've gotten tired of going to the same library to study or the same coffee shop to work.

I'm not alone in this. According to an O2 Business survey, 47% of people who work from cafés do so because they enjoy the change of environment. Other times, you just want a quiet place to read, somewhere green to take photos, or a new spot to spend an afternoon.

The problem is that finding somewhere new doesn't necessarily mean finding somewhere you'll actually enjoy.

If you open Google Maps and search for "coffee shops near me", you'll get plenty of options, but those recommendations don't really know you. Google recommendations are prioritized for convenience, not taste, so they don't know that you might prefer a cozy bookstore over a trendy restaurant.

I wanted to build something that goes beyond finding what's nearby. Something that understands both what you need right now and what you love, without leading you to the same old café. Sometimes, you just want to go **Elsewhere**.

![47% enjoy a change of environment, 58% are frustrated by impersonal experiences, 150% growth in "near me" searches](https://findelsewhere.vercel.app/devpost/stats.webp?v=2)

---

![What It Does](https://findelsewhere.vercel.app/devpost/section-what-it-does.webp)

Elsewhere is a map discovery app that helps you find places you'll actually want to spend time in. You can describe what you're looking for in plain language, and the AI guide searches for real places, uses your cultural interests to personalize recommendations, and can even plan an entire outing.

## Explore
### Find Places That Fit You

Instead of just ranking places by distance, Elsewhere gives each location a practical score based on factors like activity fit, proximity, and available attributes. It also calculates a taste-aware score that incorporates cultural affinity from Qloo.

Every recommendation includes a breakdown of why it was selected, so you can understand what makes a place a good fit. You can filter by category, compare places side by side, save favorites, and give feedback that influences future results. You can also tell the guide what you need directly, in plain text.

![Explore mode with the Taste Layer and a "Why this place?" breakdown](https://findelsewhere.vercel.app/devpost/screens/explore-taste-layer.webp)

## Your Taste
### Recommendations That Know What You Love

Not everyone knows how to describe their taste, so Elsewhere gives you a few ways to express it. You can choose vibes like Cozy, Quiet, Artsy, Vintage, or Hidden Gem. You can also search for specific filmmakers, artists, authors, brands, shows, and other interests.

![Your Taste: vibe cards and interests](https://findelsewhere.vercel.app/devpost/screens/taste-panel.webp)

These signals feed into Qloo's cultural intelligence API, which helps identify places that may resonate with your interests.

**The Taste Layer** takes this a step further by transforming the map itself. In 2D Explore mode, relevant places receive colorful highlights and surrounding building tints. Switch to Immersive mode, and those same locations become detailed 3D buildings with custom facades, rooftop details and lighting.

The colors of highlighted places are even derived from their photos when available, making the map feel connected to the actual city.

![Immersive 3D: buildings around a taste match tinted in warm rings](https://findelsewhere.vercel.app/devpost/screens/immersive-taste-aura.webp)

## Taste Trails
### Turn a Free Afternoon Into an Adventure

Sometimes I don't just want one recommendation. I want an entire afternoon planned out.

With Taste Trails, I can ask Elsewhere to plan a creative afternoon, find three places to explore before dinner, or put together an outing with a bookstore, somewhere to sit outside, and somewhere inexpensive to eat.

The agent combines cultural relevance from Qloo with real places and geographic routing to build a route of two to five stops. It accounts for travel time, estimated arrival times, opening hours, and the time I have available.

The route appears directly on the map as an animated gradient line in 2D or a glowing path with stop beacons in 3D. Each stop includes its own details and explanation of why it belongs in the itinerary.

And the plan isn't set in stone. I can ask to make it cheaper, swap the last stop for something artsy, or spend more time at a particular location. Elsewhere updates the relevant parts of the trail while preserving the rest.

![A Taste Trail in in 2D Explore](https://findelsewhere.vercel.app/devpost/screens/trail-explore.webp)

---

![How I Built It](https://findelsewhere.vercel.app/devpost/section-how-i-built-it.webp)

I built Elsewhere from the ground up using Next.js, React, and TypeScript. The biggest challenge was getting several different systems to work together, including a conversational AI agent, cultural recommendations, real-world place data, geographic routing, and a map that looks and behaves differently depending on the viewing mode.

### The AI Agent

I used the Anthropic API to power Elsewhere's conversational guide. Rather than having the model simply generate recommendations in text, I gave it a collection of typed tools that execute real actions in the application.

The agent can search for places, find cultural entities, add interests, highlight locations, compare and save places, plan trails, and revise existing itineraries. These tools run server-side and return validated actions that update the shared application state, so the map and interface respond as the agent works.

I used Zod to validate tool inputs and API responses, which helps keep the agent grounded in actual data instead of letting it invent locations or facts.

### Cultural Intelligence with Qloo

Qloo is a core part of Elsewhere's recommendation system. I use its entity search, tag search, and Insights API to connect user interests to relevant places.

One interesting implementation detail was handling different kinds of interests separately. I query cultural entities and general tags independently, then combine the results because combining everything into one request sometimes caused specific interests to get overshadowed.

I also had to match Qloo's place results with places from Google Places and OpenStreetMap. These providers can represent the same venue as different records, so I match them using name tokens and geographic distance.

### Places, Ranking, and Routing

For real-world place data, I use Google Places API, with OpenStreetMap fallbacks. I built a deterministic ranking system that considers activity fit, proximity, available attributes, and user feedback. The taste-aware ranking adds cultural affinity from Qloo. This lets Elsewhere balance what someone wants to do with what they might enjoy.

For Taste Trails, I use OSRM for geographic routing. The planner evaluates combinations of stops, considers travel time and walkability, checks opening hours at estimated arrival times, and fits the itinerary to the user's time budget. When a user revises a trail, the planner locks untouched stops so it doesn't unnecessarily rebuild the entire outing.

### The Map

I used MapLibre GL for the map, with OpenFreeMap vector tiles and a custom sunset pastel map style. The 2D Taste Layer uses geographic data to render highlights, halos, ripple rings, and tinted building footprints. For Immersive mode, I integrated a custom Three.js layer directly into MapLibre. It extrudes highlighted buildings from real OpenStreetMap footprints and adds procedural facade textures, windows, awnings, rooftop details, and lighting.

I also built the trail visualization using a glowing 3D tube with stop beacons and a moving light effect. Both map modes share the same underlying locations and recommendations, so switching views doesn't change the actual itinerary.

One small but important detail was extracting colors from place photos. I use `sharp` on the server to find dominant colors and convert them into softer pastel shades for the map. This also avoids browser restrictions when accessing images from certain providers.

## Tech Stack

| Technology | Purpose |
|---|---|
| Next.js 16, React 19, TypeScript | Application and server-side API routes |
| Anthropic API | Conversational agent and tool execution |
| Qloo Insights API | Cultural intelligence and taste-aware recommendations |
| Google Places API (New) | Real-world place search and details |
| OpenStreetMap, OpenFreeMap | Geographic data and map tiles |
| MapLibre GL | Interactive 2D map and geographic rendering |
| Three.js | Immersive 3D buildings and route effects |
| OSRM | Route geometry, distances, and travel-time estimates |
| Zustand | Shared state across the agent, map, and interface |
| Zod | Input and response validation |
| Tailwind CSS | Styling and responsive layouts |
| sharp | Server-side image color extraction |
| Vercel | Deployment |

---

![Challenges](https://findelsewhere.vercel.app/devpost/section-challenges.webp)

**Making sure taste doesn't override what the user actually asked for**

One early version of the planner interpreted a request for milk tea followed by a nature photography stop too loosely. Because the planner treated the first stop as a generic café, cultural ranking could select an unrelated venue.

I fixed this by resolving literal requests through place search first, using synonyms where appropriate, and allowing taste to choose between actual matches rather than override the requested category.

**Working with noisy cultural search results**

Searching for a simple interest sometimes returned unrelated entities, individual menu items, or names that happened to contain similar words. I added stricter filtering, tag-family checks, popularity thresholds, and a fallback that translates free-typed interests into Qloo's vocabulary.

**Making the 3D map work with real geography**

Integrating Three.js into MapLibre required keeping the 3D scene synchronized with the map camera and rendering lifecycle. I also had to work through layer-ordering issues and redesign the building highlights so their glow followed geographic relationships rather than appearing randomly across map tiles.

**Planning realistic outings**

A route that looks good on a map isn't necessarily a good itinerary. I added arrival-time opening-hours checks, travel-time calculations, time-budget fitting, and logic that preserves stops the user hasn't asked to change.

---

![Accomplishments](https://findelsewhere.vercel.app/devpost/section-accomplishments.webp)

Here are some things I'm really proud of after building this project:

- Creating a taste-aware map that works in both 2D and immersive 3D, with the same recommendations and explanations in both modes
- Integrated Qloo into the actual recommendation pipeline rather than using it as a superficial add-on
- Built editable, multi-stop itineraries with real places, geographic routes, travel estimates, and opening-hours checks
- Made taste input flexible enough to support both predefined vibes and unusual interests entered in free text
- Made recommendations explainable and clearly labeled estimates and missing information instead of inventing details
- Built a demo that still works without API keys using a real OpenStreetMap snapshot of the demo area, with simulated taste signals clearly labeled when Qloo is unavailable

---

![What I Learned](https://findelsewhere.vercel.app/devpost/section-what-i-learned.webp)

The biggest lesson was that personalization should shape recommendations without overriding what someone actually needs. A person asking for something specific should get what they want, with cultural taste helping decide which real option to choose.

I also learned how much work goes into connecting real-world data sources. Matching places across providers, filtering noisy search results, handling missing hours, and keeping routes realistic turned out to be just as important as the AI itself.

On the technical side, I learned a lot about building tool-using agents, integrating Qloo's Insights API, rendering custom Three.js scenes inside a geographic map, and keeping API costs manageable with prompt caching and limits on tool execution.

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