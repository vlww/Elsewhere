"use client";

import { useEffect, useRef } from "react";
import { ArrowUp, Bookmark, Check, Columns3, Footprints, Map as MapIcon, MapPin, RotateCcw, Sparkles, X, Eye, SlidersHorizontal } from "lucide-react";
import { useElsewhere, type ChatMessage, type ChatNote } from "@/store/useElsewhere";
import { cx, IconButton } from "@/components/ui/primitives";
import { entityKindLabel } from "@/components/taste/entityLabels";

const STARTERS = [
  "I need to lock in for two hours, but I can't stand sterile libraries.",
  "Somewhere to read with a little background noise.",
  "Find me somewhere that feels like a Sofia Coppola movie.",
  "I have an hour before class. Somewhere peaceful, preferably outdoors.",
  "Surprise me — somewhere I wouldn't normally go.",
  "Make the map more colorful around places I'd probably love.",
  "Plan a creative afternoon around my interests.",
  "Find a bookstore, somewhere to sit outside, and somewhere inexpensive to eat.",
];

const NOTE_ICON: Record<ChatNote["kind"], typeof MapIcon> = {
  results: MapIcon,
  taste: Sparkles,
  saved: Bookmark,
  focus: Eye,
  compare: Columns3,
  trail: Footprints,
  location: MapPin,
  lens: SlidersHorizontal,
  feedback: Check,
  layer: Sparkles,
};

function Notes({ notes }: { notes: ChatNote[] }) {
  const removeTaste = useElsewhere((s) => s.removeTaste);
  const active = useElsewhere((s) => s.tasteSignals);
  if (!notes.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {notes.map((n, i) => {
        const Icon = NOTE_ICON[n.kind];
        const removable = n.entityId && active.some((e) => e.id === n.entityId);
        return (
          <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-white/70 py-1 pl-2 pr-2.5 text-[11.5px] font-medium text-plum ring-1 ring-line animate-rise">
            <Icon size={12} className="text-rose-deep" />
            {n.text}
            {removable && (
              <button onClick={() => removeTaste(n.entityId!)} aria-label="Remove this interest" className="-mr-1 ml-0.5 rounded-full p-0.5 text-ink-faint hover:text-aubergine">
                <X size={11} />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

function EntityChoices({ choices }: { choices: NonNullable<ChatMessage["choices"]> }) {
  const addTaste = useElsewhere((s) => s.addTaste);
  const active = useElsewhere((s) => s.tasteSignals);
  if (!choices.entities.length) return null;
  return (
    <div className="mt-2.5 rounded-[var(--radius-md)] bg-lavender/30 p-2 ring-1 ring-lilac/30">
      <p className="px-1 pb-1.5 text-[11.5px] font-medium text-[#5A4791]">Which &ldquo;{choices.query}&rdquo;? Tap to use as an interest.</p>
      <div className="flex flex-wrap gap-1.5">
        {choices.entities.slice(0, 6).map((e) => {
          const on = active.some((a) => a.id === e.id);
          return (
            <button
              key={e.id}
              disabled={on}
              onClick={() => addTaste({ ...e, origin: "picked" })}
              className={cx(
                "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1.5 text-left text-[12px] ring-1 transition-colors",
                on ? "bg-aubergine text-ivory ring-aubergine" : "bg-white/85 text-plum ring-line hover:bg-white",
              )}
            >
              {on ? <Check size={12} /> : <Sparkles size={12} className="text-lilac" />}
              <span className="font-medium">{e.name}</span>
              <span className={cx("truncate", on ? "text-ivory/70" : "text-ink-faint")}>{e.disambiguation ?? entityKindLabel(e.type)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Message({ m }: { m: ChatMessage }) {
  const sendMessage = useElsewhere((s) => s.sendMessage);
  const agentStatus = useElsewhere((s) => s.agentStatus);
  if (m.role === "system") {
    return (
      <div className="flex justify-center">
        <Notes notes={m.notes} />
      </div>
    );
  }
  if (m.role === "user") {
    return (
      <div className="flex justify-end animate-rise">
        <p className="max-w-[85%] rounded-[18px] rounded-br-[6px] bg-aubergine px-3.5 py-2.5 text-[14px] leading-snug text-ivory">{m.text}</p>
      </div>
    );
  }
  return (
    <div className="animate-rise" aria-live={m.pending ? "polite" : undefined}>
      {m.text && <div className="whitespace-pre-wrap text-[14.5px] leading-[1.55] text-aubergine">{m.text}</div>}
      {m.pending && !m.text && (
        <p className="shimmer-text text-[13.5px] font-medium" role="status">
          {agentStatus ?? "Thinking it over…"}
        </p>
      )}
      {m.pending && m.text && agentStatus && (
        <p className="shimmer-text mt-1.5 text-[12.5px] font-medium" role="status">
          {agentStatus}
        </p>
      )}
      {m.choices && <EntityChoices choices={m.choices} />}
      <Notes notes={m.notes} />
      {m.error && (
        <div className="mt-2 rounded-[var(--radius-md)] bg-apricot/25 p-3 text-[13px] text-[#7A4426] ring-1 ring-apricot/40">
          {m.error.message}
          {m.error.recoverable && m.error.retryText && (
            <button onClick={() => sendMessage(m.error!.retryText!)} className="ml-2 inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
              <RotateCcw size={12} /> Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Composer({ autoFocus = false }: { autoFocus?: boolean }) {
  const draft = useElsewhere((s) => s.draft);
  const setDraft = useElsewhere((s) => s.setDraft);
  const sendMessage = useElsewhere((s) => s.sendMessage);
  const busy = useElsewhere((s) => s.agentBusy);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [draft]);

  const submit = () => {
    if (draft.trim() && !busy) void sendMessage(draft);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-end gap-2 rounded-[22px] bg-white/90 p-1.5 pl-4 shadow-[var(--shadow-card)] ring-1 ring-line focus-within:ring-rose/50"
    >
      <label htmlFor="composer" className="sr-only">
        Ask Elsewhere
      </label>
      <textarea
        id="composer"
        ref={ref}
        rows={1}
        autoFocus={autoFocus}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="What are you in the mood for?"
        className="max-h-[132px] min-h-[24px] flex-1 resize-none bg-transparent py-2 text-[14.5px] leading-snug text-aubergine outline-none placeholder:text-ink-faint"
      />
      <button
        type="submit"
        disabled={!draft.trim() || busy}
        aria-label="Send"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-aubergine text-ivory transition-all hover:bg-plum disabled:bg-aubergine/15 disabled:text-ink-faint"
      >
        <ArrowUp size={17} />
      </button>
    </form>
  );
}

export function ChatPanel({ className = "" }: { className?: string }) {
  const messages = useElsewhere((s) => s.messages);
  const sendMessage = useElsewhere((s) => s.sendMessage);
  const resetChat = useElsewhere((s) => s.resetChat);
  const location = useElsewhere((s) => s.location);
  const status = useElsewhere((s) => s.status);
  const scroller = useRef<HTMLDivElement>(null);
  const lastText = messages.at(-1)?.text.length ?? 0;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, lastText]);

  return (
    <section aria-label="Conversation" className={cx("flex min-h-0 flex-col", className)}>
      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Guide</p>
        {messages.length > 0 && (
          <IconButton label="New conversation" onClick={resetChat} className="h-7 w-7">
            <RotateCcw size={13} />
          </IconButton>
        )}
      </div>
      <div ref={scroller} className="scroll-soft min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 pt-1">
        {messages.length === 0 ? (
          <div className="pt-2">
            <p className="font-serif text-[28px] leading-[1.1] text-aubergine">
              {location ? <>Where to, <em>today?</em></> : <>Tell me what you&apos;re after.</>}
            </p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
              Say it however it comes out. I&apos;ll look nearby, weigh what matters, and put the good ones on the map.
            </p>
            <div className="mt-4 flex flex-col items-start gap-1.5">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="rounded-[14px] bg-white/60 px-3 py-2 text-left text-[13px] leading-snug text-plum ring-1 ring-line transition-colors hover:bg-white"
                >
                  {s}
                </button>
              ))}
            </div>
            {status && !status.agent.configured && (
              <p className="mt-4 rounded-[var(--radius-md)] bg-butter/40 p-3 text-[12.5px] leading-relaxed text-[#6D5A1F] ring-1 ring-[#E8D27A]/50">
                The guide needs an Anthropic API key on the server (ANTHROPIC_API_KEY). Until then, browse with the map, filters and Taste Lens.
              </p>
            )}
          </div>
        ) : (
          messages.map((m) => <Message key={m.id} m={m} />)
        )}
      </div>
      <div className="px-3 pb-3">
        <Composer />
      </div>
    </section>
  );
}
