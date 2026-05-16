"use client";

// Floating Help Buddy — an in-app AI chat. The button lives in the bottom
// corner on every page; clicking opens a side panel where she can ask
// "how do I…", "where is…", or "is there a…". Claude answers from the
// system prompt at src/lib/help-prompt.ts.
//
// Design notes:
// - Conversation lives in component state. Cleared on full reload. That's
//   fine for v1 — the buddy is a quick-reference helper, not a journal.
// - We send the WHOLE history each turn so Claude has context. The
//   system prompt is cached by the API route, so the marginal cost of
//   long threads is tiny.
// - No streaming for v1. Most replies land in 2-4 seconds; a spinner is
//   enough. Streaming can come later if it feels worth the complexity.
// - Markdown rendering on assistant replies — the prompt encourages
//   short paragraphs, numbered steps, inline code for buttons/paths.

import { useEffect, useRef, useState } from "react";
import { MarkdownRender } from "./NotesEditor";

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

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll to bottom on new messages / when opening.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, sending]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open) {
      // Defer so the panel is mounted/transitioned before focus.
      requestAnimationFrame(() => inputRef.current?.focus());
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
      {/* Floating launch button — bottom-right, above everything */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close help buddy" : "Open help buddy"}
        className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full shadow-lg transition-all
          ${
            open
              ? "bg-ink-900 text-white px-3 py-2"
              : "bg-flame-600 text-white px-4 py-2.5 hover:bg-flame-700"
          }`}
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
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <span className="text-sm font-medium">Help</span>
          </>
        )}
      </button>

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
          <div className="w-7 h-7 rounded-full bg-flame-100 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-flame-600" />
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
              className="flex-1 resize-none text-sm leading-relaxed bg-ink-50 border border-ink-200 rounded-md px-3 py-2 focus:outline-none focus:border-flame-500 focus:bg-white disabled:opacity-60 max-h-32"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || input.trim().length === 0}
              className="shrink-0 text-sm font-medium px-3 py-2 rounded-md bg-flame-600 text-white hover:bg-flame-700 disabled:bg-ink-200 disabled:text-ink-400"
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
              ? "bg-flame-600 text-white"
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
