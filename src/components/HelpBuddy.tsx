"use client";

// Floating Help Buddy — an in-app AI chat with a "Navi-from-Zelda" quality.
// The button is a small honey-glowing presence in the bottom-right corner of
// every page. It gently calls to the practitioner without being annoying:
//
//   - Slow ambient halo always on (4.5s glow cycle) so it reads as alive
//     even when she's not looking at it
//   - One-time greeting pulse on her very first visit (stored in localStorage)
//   - Periodic idle pulse + rotating hover hint AFTER she's been on the
//     page for a while without engaging, and only IF she hasn't opened the
//     buddy recently. Stops calling once she's actually used it.
//   - All of this respects prefers-reduced-motion.
//
// Clicking opens a side panel where she asks "how do I…", "where is…",
// "what's new?" etc. Claude answers from src/lib/help-prompt.ts.
//
// Design notes for the chat itself:
// - Conversation lives in component state. Cleared on full reload.
// - We send the WHOLE history each turn so Claude has context. The
//   system prompt is cached by the API route, so the marginal cost of
//   long threads is tiny.
// - No streaming for v1.
// - Markdown rendering on assistant replies.

import { useEffect, useRef, useState } from "react";
import { MarkdownRender } from "./NotesEditor";

// Rotating hover hints — change every couple of hours by index. Keep them
// short, specific, and useful (no "Hi there!" filler). Each one points to a
// real feature she might not know about.
const HOVER_HINTS = [
  "Stuck? Tell me what you're trying to do.",
  "Try: \"what's new?\"",
  "Looking for a session from last month? Type the date in Cmd+K.",
  "Press `g d` to jump to any date on the calendar.",
  "Notes autosave — close the tab anytime, your typing comes back.",
  "Need a Meet link for an old session? Click \"Push to Google Calendar\" on the card.",
  "Click any month header on a client's Sessions tab to see the whole-app calendar for that month.",
];

// Localstorage keys
const LS_GREETED = "ss.help-buddy.greeted";       // "1" after the first hello
const LS_LAST_OPENED = "ss.help-buddy.lastOpened"; // ms timestamp
const LS_HINT_INDEX = "ss.help-buddy.hintIndex";   // rotating tip cursor

// Idle pulse: trigger every IDLE_INTERVAL_MS as long as she's been idle for
// at least IDLE_THRESHOLD_MS AND hasn't opened the panel in OPEN_QUIET_MS.
// Numbers tuned to be inviting, not naggy.
const IDLE_THRESHOLD_MS = 25_000; // 25s of no movement before we'd pulse
const IDLE_INTERVAL_MS = 90_000;  // try at most once every 90s
const OPEN_QUIET_MS = 8 * 60_000; // skip pulses for 8 min after she opens it

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// Greeting only shown when the panel is empty.
const GREETING =
  "Hi! I'm your in-app help buddy. Ask me anything about how this app works — where to find things, how to do something, what's coming soon. I'll keep it short.";

export function HelpBuddy() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Navi state: greeting, hover hint, idle pulse ───────────────────────
  // True for ~1.4s on the very first visit ever (localStorage-gated).
  const [greeting, setGreeting] = useState(false);
  // True while the hover-hint speech bubble is showing.
  const [hintVisible, setHintVisible] = useState(false);
  // Which hint to show — advances on every reveal.
  const [hintIndex, setHintIndex] = useState(0);
  // True briefly when the idle-pulse ring should animate.
  const [pulsing, setPulsing] = useState(false);
  // Tracks the last time she did anything (mouse/key/scroll).
  const lastActivityRef = useRef<number>(
    typeof performance !== "undefined" ? performance.now() : 0
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // First-visit greeting: pulse + hint, exactly once per browser.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(LS_GREETED) === "1") return;
    // Delay so she sees the page land before the buddy waves.
    const t = setTimeout(() => {
      setGreeting(true);
      setHintIndex(0);
      setHintVisible(true);
      window.localStorage.setItem(LS_GREETED, "1");
      // Hide the hint after a few seconds — she can still hover any time.
      setTimeout(() => setHintVisible(false), 5500);
      // Drop the one-shot greeting class after the animation finishes.
      setTimeout(() => setGreeting(false), 1600);
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  // Restore where in the hint rotation she is, so re-visits don't replay
  // the same tip every time.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(LS_HINT_INDEX);
    if (stored) {
      const n = parseInt(stored, 10);
      if (Number.isFinite(n)) setHintIndex(n % HOVER_HINTS.length);
    }
  }, []);

  // Idle activity tracker. We don't need precision — just "has she touched
  // anything recently?" so we know when to call to her.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function bump() {
      lastActivityRef.current = performance.now();
    }
    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
    ];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () =>
      events.forEach((e) => window.removeEventListener(e, bump));
  }, []);

  // Periodic idle-pulse: every IDLE_INTERVAL_MS, IF she's been idle for at
  // least IDLE_THRESHOLD_MS AND the panel is closed AND she hasn't opened
  // it recently — emit one quiet ring. The pulse animation runs for ~3.6s
  // (2 cycles of the keyframes), then resets.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (open) return;

    const interval = setInterval(() => {
      const now = performance.now();
      const idleFor = now - lastActivityRef.current;
      if (idleFor < IDLE_THRESHOLD_MS) return;

      // Quiet down for a while after she opens the panel — no point calling
      // if she just used it.
      const lastOpened = parseInt(
        window.localStorage.getItem(LS_LAST_OPENED) ?? "0",
        10
      );
      if (Date.now() - lastOpened < OPEN_QUIET_MS) return;

      setPulsing(true);
      // Match the animation length (1.8s × 2 iterations).
      setTimeout(() => setPulsing(false), 3700);
    }, IDLE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [open]);

  // Hover handlers — show the next rotating hint.
  function onHoverEnter() {
    if (open) return;
    setHintVisible(true);
  }
  function onHoverLeave() {
    setHintVisible(false);
  }

  // Each time the hint becomes visible (and isn't the first-visit one),
  // advance the rotation so the next hover shows a different tip.
  useEffect(() => {
    if (!hintVisible || typeof window === "undefined") return;
    const next = (hintIndex + 1) % HOVER_HINTS.length;
    // Defer the advance so she sees the CURRENT one this hover; the
    // increment takes effect on the NEXT reveal.
    const t = setTimeout(() => {
      setHintIndex(next);
      window.localStorage.setItem(LS_HINT_INDEX, String(next));
    }, 1200);
    return () => clearTimeout(t);
    // We deliberately depend only on hintVisible so a re-render doesn't
    // re-trigger the rotation while the bubble is still showing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintVisible]);

  // Auto-scroll to bottom on new messages / when opening.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, sending]);

  // Focus the input when the panel opens. Also stamp the "last opened" time
  // so the idle pulse goes quiet for a while.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LS_LAST_OPENED, String(Date.now()));
      }
      // Hide any lingering hint and stop the pulse — she's engaging now.
      setHintVisible(false);
      setPulsing(false);
      setGreeting(false);
    }
  }, [open]);

  // Close on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);

    const next: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      if (!data.reply) {
        throw new Error("No reply.");
      }

      setMessages((m) => [...m, { role: "assistant", content: data.reply! }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter inserts newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Floating launcher — a small glowing presence in the corner.
          Hosts the idle-pulse ring as a sibling (so the ring can scale past
          the button bounds without clipping) and the hover-hint as a child
          (so it absolute-positions relative to the launcher). */}
      <div
        className="fixed bottom-5 right-5 z-40"
        onMouseEnter={onHoverEnter}
        onMouseLeave={onHoverLeave}
        onFocus={onHoverEnter}
        onBlur={onHoverLeave}
      >
        {/* Hover hint (also shown on first-visit greeting). Hidden by default;
            class toggle reveals it with a small fade-up. */}
        {!open && (
          <div
            className={`help-buddy-hint ${hintVisible ? "is-visible" : ""}`}
            role="tooltip"
          >
            {HOVER_HINTS[hintIndex]}
          </div>
        )}

        {/* Idle-pulse ring — sits behind the button, scales outward when
            `is-pulsing` is on. Empty div + pure CSS animation, very cheap. */}
        {!open && (
          <span
            aria-hidden="true"
            className={`help-buddy-ring ${pulsing || greeting ? "is-pulsing" : ""}`}
          />
        )}

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close help buddy" : "Open help buddy"}
          className={`relative flex items-center justify-center rounded-full shadow-lg transition-all
            ${
              open
                ? "bg-ink-900 text-white w-10 h-10"
                : `w-12 h-12 text-white help-buddy-glow ${greeting ? "help-buddy-greet" : ""}`
            }`}
          style={
            open
              ? undefined
              : {
                  // Plum-to-honey radial — like a small lantern flame.
                  background:
                    "radial-gradient(circle at 35% 30%, var(--color-honey-300) 0%, var(--color-plum-500) 55%, var(--color-plum-700) 100%)",
                }
          }
        >
          {open ? (
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
            // A tiny inner "spark" — gives the impression of a presence
            // inside the lantern rather than a flat button.
            <span
              aria-hidden="true"
              className="block rounded-full"
              style={{
                width: 8,
                height: 8,
                background:
                  "radial-gradient(circle, rgba(255, 248, 220, 0.95) 0%, rgba(255, 230, 170, 0.55) 60%, transparent 100%)",
                boxShadow: "0 0 8px rgba(255, 230, 170, 0.7)",
              }}
            />
          )}
        </button>
      </div>

      {/* Panel — slides up from the right */}
      <div
        role="dialog"
        aria-label="Help buddy"
        aria-hidden={!open}
        className={`fixed bottom-20 right-5 z-40 w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-7rem)]
          bg-white border border-ink-200 rounded-lg shadow-2xl flex flex-col
          transition-all duration-200 ease-out
          ${
            open
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 translate-y-2 pointer-events-none"
          }`}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-ink-100 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-plum-100 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-plum-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-ink-900 leading-tight">
              Help buddy
            </div>
            <div className="text-[10px] text-ink-400 leading-tight">
              Knows this app inside out
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => {
                setMessages([]);
                setError(null);
              }}
              className="text-[10px] uppercase tracking-wider text-ink-400 hover:text-ink-700"
              title="Start a new conversation"
            >
              Clear
            </button>
          )}
        </div>

        {/* Scroll region */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        >
          {messages.length === 0 && (
            <div className="text-sm text-ink-600 leading-relaxed">
              {GREETING}
              <div className="mt-3 space-y-1.5">
                <SuggestionChip
                  onClick={(text) => {
                    setInput(text);
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  text="How do I schedule a recurring series?"
                />
                <SuggestionChip
                  onClick={(text) => {
                    setInput(text);
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  text="Where do I export my data?"
                />
                <SuggestionChip
                  onClick={(text) => {
                    setInput(text);
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  text="What's coming soon?"
                />
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <Bubble key={i} message={m} />
          ))}

          {sending && (
            <div className="flex items-center gap-2 text-xs text-ink-400">
              <Dots />
              <span>thinking…</span>
            </div>
          )}

          {error && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-ink-100 p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Ask anything about the app…"
              disabled={sending}
              className="flex-1 resize-none text-sm leading-relaxed bg-ink-50 border border-ink-200 rounded-md px-3 py-2 focus:outline-none focus:border-plum-500 focus:bg-white disabled:opacity-60 max-h-32"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || input.trim().length === 0}
              className="shrink-0 text-sm font-medium px-3 py-2 rounded-md bg-plum-600 text-white hover:bg-plum-700 disabled:bg-ink-200 disabled:text-ink-400"
            >
              Send
            </button>
          </div>
          <div className="text-[10px] text-ink-400 mt-1.5 px-1">
            Enter to send · Shift+Enter for a new line
          </div>
        </div>
      </div>
    </>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed
          ${
            isUser
              ? "bg-plum-600 text-white"
              : "bg-ink-50 border border-ink-100 text-ink-800"
          }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">
            {message.content}
          </div>
        ) : (
          <div className="md-render break-words">
            <MarkdownRender body={message.content} />
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestionChip({
  text,
  onClick,
}: {
  text: string;
  onClick: (text: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(text)}
      className="block w-full text-left text-xs text-ink-600 bg-ink-50 hover:bg-ink-100 border border-ink-100 rounded-md px-2.5 py-1.5"
    >
      {text}
    </button>
  );
}

function Dots() {
  // Three pulsing dots — uses staggered animation delays.
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="w-1.5 h-1.5 rounded-full bg-ink-400 animate-pulse"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-ink-400 animate-pulse"
        style={{ animationDelay: "200ms" }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-ink-400 animate-pulse"
        style={{ animationDelay: "400ms" }}
      />
    </span>
  );
}
