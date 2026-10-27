"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { SearchConstraintsSchema } from "@/types";
import type {
  AgentEvent,
  AgentSession,
  ClientAction,
  CulturalEntity,
  FeedbackEntry,
  FeedbackReason,
  Place,
  PlaceCategory,
  Recommendation,
  SearchConstraints,
  SearchResult,
  TasteTrail,
  UserLocation,
} from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppStatus {
  taste: "live" | "demo";
  places: string[];
  agent: { model: string; configured: boolean };
  demoArea: { name: string; center: { lat: number; lon: number }; bbox: [number, number, number, number]; snapshotDate: string; license: string };
}

export interface ChatNote {
  kind: "results" | "taste" | "saved" | "focus" | "compare" | "trail" | "location" | "lens" | "feedback" | "layer";
  text: string;
  entityId?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  notes: ChatNote[];
  choices?: { query: string; entities: CulturalEntity[] };
  error?: { message: string; recoverable: boolean; retryText?: string };
  pending?: boolean;
}

export interface SavedPlace {
  place: Place;
  savedAt: string;
}

export type MapMode = "explore" | "immersive";
export type Panel = "results" | "saved" | "taste" | null;
export type MobileTab = "map" | "guide" | "places";

interface State {
  status: AppStatus | null;
  location: UserLocation | null;
  geoState: "idle" | "asking" | "denied" | "unavailable";
  constraints: SearchConstraints;
  tasteSignals: CulturalEntity[];
  knownEntities: CulturalEntity[];
  lensMode: "practical" | "taste";
  result: SearchResult | null;
  searching: boolean;
  searchStartedAt: number;
  searchError: string | null;
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  detailOpen: boolean;
  hiddenCategories: PlaceCategory[];
  sortMode: "fit" | "distance";
  saved: Record<string, SavedPlace>;
  feedback: FeedbackEntry[];
  compareIds: string[];
  compareOpen: boolean;
  trail: TasteTrail | null;
  mapMode: MapMode;
  /** Taste Layer: a presentation over the same results, drawn by whichever map mode is active. */
  tasteLayer: boolean;
  focusRequest: { placeId: string; nonce: number } | null;
  fitRequest: number;
  panel: Panel;
  mobileTab: MobileTab;
  // chat
  messages: ChatMessage[];
  transcript: unknown[];
  agentBusy: boolean;
  agentStatus: string | null;
  draft: string;
}

interface Actions {
  loadStatus(): Promise<void>;
  setLocation(loc: UserLocation, search?: boolean): void;
  requestDeviceLocation(): void;
  runSearch(patch?: Partial<SearchConstraints>): Promise<void>;
  select(id: string | null, opts?: { focus?: boolean; detail?: boolean }): void;
  hover(id: string | null): void;
  closeDetail(): void;
  setLens(mode: "practical" | "taste"): void;
  toggleCategory(c: PlaceCategory): void;
  setSortMode(m: "fit" | "distance"): void;
  toggleSave(place: Place): void;
  giveFeedback(rec: Recommendation, reason: FeedbackReason): void;
  addTaste(e: CulturalEntity): void;
  removeTaste(id: string): void;
  clearTaste(): void;
  toggleCompare(id: string): void;
  setCompareOpen(v: boolean): void;
  clearTrail(): void;
  setMapMode(m: MapMode): void;
  setTasteLayer(on: boolean): void;
  setPanel(p: Panel): void;
  setMobileTab(t: MobileTab): void;
  setDraft(t: string): void;
  sendMessage(text: string): Promise<void>;
  resetChat(): void;
  orderedRecommendations(): Recommendation[];
  findPlace(id: string): Place | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const uid = () => Math.random().toString(36).slice(2, 10);

export function clientNow() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const LENS_LABEL = { practical: "Practical", taste: "Taste-aware" } as const;

let searchSeq = 0;
let chatAbort: AbortController | null = null;
let tasteRerunTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useElsewhere = create<State & Actions>()(
  persist(
    (set, get) => {
      /** Applies an action emitted by the agent's tools, and returns a chat note describing it. */
      const applyAction = (a: ClientAction): ChatNote | null => {
        switch (a.type) {
          case "set_location":
            set({ location: a.location, trail: null });
            return { kind: "location", text: `Moved to ${a.location.label.split(",")[0]}` };
          case "set_constraints":
            set({ constraints: a.constraints });
            return null;
          case "results": {
            set({
              result: a.result,
              searchError: null,
              searchStartedAt: Date.now(),
              fitRequest: Date.now(),
              trail: null,
              compareIds: get().compareIds.filter((id) => a.result.recommendations.some((r) => r.place.id === id)),
              hiddenCategories: [],
            });
            const n = a.result.recommendations.length;
            return { kind: "results", text: n ? `${n} place${n === 1 ? "" : "s"} on the map` : "Nothing fit those constraints" };
          }
          case "focus":
            get().select(a.placeId, { focus: true, detail: false });
            return { kind: "focus", text: `Showing ${get().findPlace(a.placeId)?.name ?? "place"}` };
          case "save": {
            set({ saved: { ...get().saved, [a.placeId]: { place: a.place, savedAt: new Date().toISOString() } } });
            return { kind: "saved", text: `Saved ${a.place.name}` };
          }
          case "unsave": {
            const name = get().saved[a.placeId]?.place.name;
            const rest = { ...get().saved };
            delete rest[a.placeId];
            set({ saved: rest });
            return { kind: "saved", text: `Removed ${name ?? "place"} from Saved` };
          }
          case "add_taste":
            if (!get().tasteSignals.some((e) => e.id === a.entity.id)) set({ tasteSignals: [...get().tasteSignals, a.entity] });
            return { kind: "taste", text: `Using ${a.entity.name} as an interest`, entityId: a.entity.id };
          case "remove_taste":
            set({ tasteSignals: get().tasteSignals.filter((e) => e.id !== a.entityId) });
            return { kind: "taste", text: "Removed an interest" };
          case "set_lens":
            set({ lensMode: a.mode });
            return { kind: "lens", text: `${LENS_LABEL[a.mode]} ranking` };
          case "taste_layer":
            get().setTasteLayer(a.on);
            return { kind: "layer", text: a.on ? "Taste Layer on" : "Taste Layer off" };
          case "compare":
            set({ compareIds: a.placeIds, compareOpen: true });
            return { kind: "compare", text: `Comparing ${a.placeIds.length} places` };
          case "trail":
            set({ trail: a.trail, fitRequest: Date.now() });
            return { kind: "trail", text: `Trail: ${a.trail.stops.length} stops, ${a.trail.totalWalkMin} min walking` };
          case "entity_choices":
            set({ knownEntities: [...get().knownEntities, ...a.entities].slice(-60) });
            return null;
          case "need_location":
            return { kind: "location", text: "Needs a location" };
        }
      };

      const patchLastAssistant = (fn: (m: ChatMessage) => ChatMessage) =>
        set({
          messages: get().messages.map((m, i, arr) => (i === arr.length - 1 && m.role === "assistant" ? fn(m) : m)),
        });

      const scheduleTasteRerun = () => {
        if (tasteRerunTimer) clearTimeout(tasteRerunTimer);
        tasteRerunTimer = setTimeout(() => {
          if (get().result && !get().agentBusy) void get().runSearch();
        }, 450);
      };

      return {
        status: null,
        location: null,
        geoState: "idle",
        constraints: SearchConstraintsSchema.parse({}),
        tasteSignals: [],
        knownEntities: [],
        lensMode: "practical",
        result: null,
        searching: false,
        searchStartedAt: 0,
        searchError: null,
        selectedPlaceId: null,
        hoveredPlaceId: null,
        detailOpen: false,
        hiddenCategories: [],
        sortMode: "fit",
        saved: {},
        feedback: [],
        compareIds: [],
        compareOpen: false,
        trail: null,
        mapMode: "explore",
        tasteLayer: false,
        focusRequest: null,
        fitRequest: 0,
        panel: "results",
        mobileTab: "map",
        messages: [],
        transcript: [],
        agentBusy: false,
        agentStatus: null,
        draft: "",

        async loadStatus() {
          try {
            const res = await fetch("/api/status");
            set({ status: await res.json() });
          } catch {
            /* status is informational */
          }
        },

        setLocation(loc, search = true) {
          set({ location: loc, trail: null, selectedPlaceId: null, detailOpen: false });
          if (search) void get().runSearch();
        },

        requestDeviceLocation() {
          if (!("geolocation" in navigator)) {
            set({ geoState: "unavailable" });
            return;
          }
          set({ geoState: "asking" });
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              set({ geoState: "idle" });
              get().setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "Near you", source: "device" });
            },
            (err) => set({ geoState: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" }),
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
          );
        },

        async runSearch(patch) {
          const { location } = get();
          if (!location) return;
          const constraints = SearchConstraintsSchema.parse({ ...get().constraints, ...patch });
          const seq = ++searchSeq;
          set({ searching: true, searchError: null, constraints, searchStartedAt: Date.now() });
          try {
            const res = await fetch("/api/recommend", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                location,
                constraints,
                tasteSignals: get().tasteSignals,
                feedback: get().feedback.slice(-50),
                clientNow: clientNow(),
              }),
            });
            const json = await res.json();
            if (seq !== searchSeq) return;
            if (!res.ok) {
              set({ searching: false, searchError: json.error ?? "Search failed." });
              return;
            }
            applyAction({ type: "results", result: json as SearchResult });
            set({ searching: false });
          } catch {
            if (seq === searchSeq) set({ searching: false, searchError: "Couldn't reach Elsewhere's server. Check your connection." });
          }
        },

        select(id, opts = {}) {
          const { focus = false, detail = true } = opts;
          set({
            selectedPlaceId: id,
            detailOpen: id ? detail : false,
            ...(id && focus ? { focusRequest: { placeId: id, nonce: Date.now() } } : {}),
            ...(id && detail ? { panel: "results" as Panel, mobileTab: "places" as MobileTab } : {}),
          });
        },
        hover: (id) => set({ hoveredPlaceId: id }),
        closeDetail: () => set({ detailOpen: false }),

        setLens(mode) {
          set({ lensMode: mode });
        },

        toggleCategory(c) {
          const h = get().hiddenCategories;
          set({ hiddenCategories: h.includes(c) ? h.filter((x) => x !== c) : [...h, c] });
        },
        setSortMode: (m) => set({ sortMode: m }),

        toggleSave(place) {
          const saved = { ...get().saved };
          if (saved[place.id]) delete saved[place.id];
          else saved[place.id] = { place, savedAt: new Date().toISOString() };
          set({ saved });
        },

        giveFeedback(rec, reason) {
          const entry: FeedbackEntry = {
            placeId: rec.place.id,
            placeName: rec.place.name,
            category: rec.place.category,
            reason,
            at: new Date().toISOString(),
          };
          set({ feedback: [...get().feedback, entry].slice(-50) });
          const c = get().constraints;
          let patch: Partial<SearchConstraints> | undefined;
          let note = "";
          switch (reason) {
            case "too-far":
              patch = { radiusM: Math.max(250, Math.round(Math.min(c.radiusM, rec.distanceM) * 0.75)) };
              note = `Tightened the range to ${patch.radiusM} m`;
              break;
            case "too-expensive":
              if (rec.place.priceLevel && rec.place.priceLevel > 1) {
                patch = { maxPriceLevel: rec.place.priceLevel - 1 };
                note = `Capped price at ${"$".repeat(rec.place.priceLevel - 1)} (only applies where prices are listed)`;
              } else note = "Noted — its price isn't listed, so I can only drop this one";
              break;
            case "more-like-this":
              note = `Leaning toward more ${rec.place.category.replace("_", " ")}s like ${rec.place.name}`;
              break;
            case "not-for-me":
              note = `Dropped ${rec.place.name} for this search`;
              break;
            case "too-busy":
              note = `Dropped ${rec.place.name}; chains rank a little lower now`;
              break;
            case "already-been":
              note = `Dropped ${rec.place.name} — looking for somewhere new`;
              break;
          }
          if (get().selectedPlaceId === rec.place.id) set({ selectedPlaceId: null, detailOpen: false });
          set({
            messages: [...get().messages, { id: uid(), role: "system", text: "", notes: [{ kind: "feedback", text: note }] }],
          });
          void get().runSearch(patch);
        },

        addTaste(e) {
          if (get().tasteSignals.some((x) => x.id === e.id)) return;
          set({ tasteSignals: [...get().tasteSignals, e], lensMode: "taste", knownEntities: [...get().knownEntities, e].slice(-60) });
          scheduleTasteRerun();
        },
        removeTaste(id) {
          const next = get().tasteSignals.filter((e) => e.id !== id);
          set({ tasteSignals: next, ...(next.length ? {} : { lensMode: "practical" as const }) });
          scheduleTasteRerun();
        },
        clearTaste() {
          set({ tasteSignals: [], lensMode: "practical" });
          scheduleTasteRerun();
        },

        toggleCompare(id) {
          const c = get().compareIds;
          set({ compareIds: c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-3) });
        },
        setCompareOpen: (v) => set({ compareOpen: v }),
        clearTrail: () => set({ trail: null }),
        setMapMode: (m) => set({ mapMode: m }),
        setTasteLayer(on) {
          // Turning the layer on also ranks by taste, so the numbered markers lead with what's highlighted.
          set({ tasteLayer: on, ...(on && get().tasteSignals.length ? { lensMode: "taste" as const } : {}) });
        },
        setPanel: (p) => set({ panel: p }),
        setMobileTab: (t) => set({ mobileTab: t }),
        setDraft: (t) => set({ draft: t }),

        async sendMessage(text) {
          const trimmed = text.trim();
          if (!trimmed || get().agentBusy) return;
          chatAbort?.abort();
          chatAbort = new AbortController();
          const s = get();
          const session: AgentSession = {
            location: s.location,
            constraints: s.constraints,
            tasteSignals: s.tasteSignals,
            lensMode: s.lensMode,
            mapMode: s.mapMode,
            tasteLayer: s.tasteLayer,
            selectedPlaceId: s.selectedPlaceId,
            visibleResultIds: s.orderedRecommendations().slice(0, 40).map((r) => r.place.id),
            savedPlaceIds: Object.keys(s.saved).slice(0, 200),
            feedback: s.feedback.slice(-50),
            clientNow: clientNow(),
            lastSearchId: s.result?.id ?? null,
          };
          // Send only the slice of results the agent can act on.
          const result = s.result ? { ...s.result, recommendations: s.orderedRecommendations().slice(0, 24), filteredOut: [] } : null;

          set({
            draft: "",
            agentBusy: true,
            agentStatus: "Thinking it over…",
            mobileTab: get().mobileTab === "map" ? "guide" : get().mobileTab,
            messages: [
              ...s.messages,
              { id: uid(), role: "user", text: trimmed, notes: [] },
              { id: uid(), role: "assistant", text: "", notes: [], pending: true },
            ],
          });

          try {
            const res = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: trimmed,
                history: s.transcript,
                session,
                result,
                knownEntities: s.knownEntities.slice(-60),
              }),
              signal: chatAbort.signal,
            });
            if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              let nl: number;
              while ((nl = buf.indexOf("\n")) >= 0) {
                const line = buf.slice(0, nl).trim();
                buf = buf.slice(nl + 1);
                if (!line) continue;
                const ev = JSON.parse(line) as AgentEvent;
                if (ev.type === "text") {
                  patchLastAssistant((m) => ({ ...m, text: m.text + ev.delta }));
                  set({ agentStatus: null });
                } else if (ev.type === "status") set({ agentStatus: ev.label });
                else if (ev.type === "action") {
                  const note = applyAction(ev.action);
                  patchLastAssistant((m) => ({
                    ...m,
                    notes: note ? [...m.notes, note] : m.notes,
                    choices: ev.action.type === "entity_choices" ? { query: ev.action.query, entities: ev.action.entities } : m.choices,
                  }));
                } else if (ev.type === "history") set({ transcript: ev.messages });
                else if (ev.type === "error")
                  patchLastAssistant((m) => ({ ...m, error: { message: ev.message, recoverable: ev.recoverable, retryText: trimmed } }));
              }
            }
          } catch (e) {
            if ((e as Error).name !== "AbortError")
              patchLastAssistant((m) => ({
                ...m,
                error: { message: "Couldn't reach the guide. Your map and results are unchanged.", recoverable: true, retryText: trimmed },
              }));
          } finally {
            patchLastAssistant((m) => ({ ...m, pending: false, text: m.text.trim() }));
            set({ agentBusy: false, agentStatus: null });
          }
        },

        resetChat() {
          chatAbort?.abort();
          set({ messages: [], transcript: [], agentBusy: false, agentStatus: null });
        },

        orderedRecommendations() {
          const { result, lensMode, sortMode, tasteSignals } = get();
          if (!result) return [];
          const lens = lensMode === "taste" && tasteSignals.length ? "taste" : "practical";
          return [...result.recommendations].sort((a, b) =>
            sortMode === "distance" ? a.distanceM - b.distanceM : lens === "taste" ? a.tasteRank - b.tasteRank : a.practicalRank - b.practicalRank,
          );
        },

        findPlace(id) {
          return get().result?.recommendations.find((r) => r.place.id === id)?.place ?? get().saved[id]?.place ?? null;
        },
      };
    },
    {
      name: "elsewhere:v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      skipHydration: true,
      // Local, anonymous persistence only. Interests mentioned in passing (origin: "conversation") stay session-only.
      partialize: (s) => ({
        saved: s.saved,
        mapMode: s.mapMode,
        tasteLayer: s.tasteLayer,
        tasteSignals: s.tasteSignals.filter((e) => e.origin !== "conversation"),
        location: s.location?.source === "device" ? null : s.location,
      }),
    },
  ),
);
