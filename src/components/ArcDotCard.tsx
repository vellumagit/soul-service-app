"use client";

// The small card that opens when she clicks a dot on "Your work together".
// Edits that session's feeling score and its one-line arc note in place, and
// keeps the old click-through as an "Open session →" link.
//
// Saving: a score saves on tap; the note saves after a short pause in typing,
// on blur, on Enter, and — if anything is still pending — when the card
// closes. Each save sends only the field it changed (saveSessionArcFields),
// and the arc updates optimistically through onChange.

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { saveSessionArcFields } from "@/lib/actions";
import { fullDate, shortTime } from "@/lib/format";

export type ArcDot = {
  id: string;
  date: Date;
  type: string;
  status: string;
  rating: number | null;
  note: string | null;
};

const NOTE_MAX = 140;
const DEBOUNCE_MS = 700;

export function ArcDotCard({
  dot,
  clientId,
  tz,
  leftPercent,
  top,
  onChange,
  onClose,
}: {
  dot: ArcDot;
  clientId: string;
  tz: string;
  leftPercent: number;
  top: number;
  onChange: (id: string, patch: { rating?: number | null; note?: string | null }) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState(dot.note ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The last note value the server has (or is getting) — so blur/close don't
  // re-send an unchanged note.
  const savedNote = useRef(dot.note ?? "");
  const pendingNote = useRef<string | null>(null);

  async function save(patch: { arcNote?: string | null; feelingRating?: number | null }) {
    setState("saving");
    setError(null);
    const res = await saveSessionArcFields(dot.id, patch);
    if (res.ok) {
      setState("saved");
    } else {
      setState("error");
      setError(res.error);
    }
  }

  function flushNote() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const v = pendingNote.current;
    pendingNote.current = null;
    if (v === null || v.trim() === savedNote.current.trim()) return;
    savedNote.current = v;
    void save({ arcNote: v });
  }

  function onNoteInput(v: string) {
    setNote(v);
    onChange(dot.id, { note: v.trim() || null });
    pendingNote.current = v;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flushNote, DEBOUNCE_MS);
  }

  function pickRating(r: number | null) {
    onChange(dot.id, { rating: r });
    void save({ feelingRating: r });
  }

  // Close on Escape or a click outside the card. A click on another dot is
  // left to that dot's own handler (it switches the card to itself).
  useEffect(() => {
    function onDown(e: MouseEvent | TouchEvent) {
      const t = e.target as Element | null;
      if (!t || ref.current?.contains(t)) return;
      if (t.closest("[data-arc-dot]")) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Whatever's still pending goes out when the card closes or switches dots.
  useEffect(() => () => flushNote(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Centre the card under its dot, then nudge it sideways just enough to stay
  // inside the arc — measured, so it holds at any width (a phone included).
  useLayoutEffect(() => {
    const card = ref.current;
    const box = card?.offsetParent as HTMLElement | null;
    if (!card || !box) return;
    card.style.transform = "translateX(-50%)";
    const c = card.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    let dx = 0;
    if (c.right > b.right) dx = b.right - c.right;
    if (c.left + dx < b.left) dx = b.left - c.left;
    card.style.transform = `translateX(calc(-50% + ${Math.round(dx)}px))`;
  }, [leftPercent]);
  const cancelled = dot.status === "cancelled";

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Session on ${fullDate(dot.date, tz)}`}
      className="absolute z-30 w-[292px] max-w-full rounded-lg border border-plum-100 bg-white p-3 shadow-lg text-left"
      style={{ left: `${leftPercent}%`, top, transform: "translateX(-50%)" }}
    >
      <div className="text-xs text-ink-900 font-medium">
        {fullDate(dot.date, tz)}
        <span className="text-ink-400 mx-1">·</span>
        <span className="font-normal text-ink-600">
          {shortTime(dot.date, tz)} · {dot.type}
        </span>
      </div>
      {dot.status !== "completed" && (
        <div className="text-[10px] uppercase tracking-wider text-ink-400 mt-0.5">
          {dot.status === "scheduled" ? "Upcoming" : dot.status}
        </div>
      )}

      {!cancelled && (
        <div className="mt-2.5">
          <div className="text-[11px] text-ink-600 mb-1">How they&apos;re feeling</div>
          <div className="flex flex-wrap gap-[3px]">
            {[null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) => {
              const on = (dot.rating ?? null) === r;
              return (
                <button
                  key={r ?? "none"}
                  type="button"
                  onClick={() => pickRating(r)}
                  aria-pressed={on}
                  title={r == null ? "Not rated" : `${r} out of 10`}
                  className={`w-[21px] h-6 rounded text-[11px] tabular-nums border ${
                    on
                      ? "bg-plum-600 border-plum-600 text-white"
                      : "bg-white border-ink-200 text-ink-600 hover:border-plum-300"
                  }`}
                >
                  {r ?? "–"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <label className="block mt-2.5">
        <span className="text-[11px] text-ink-600">Note on the arc</span>
        <input
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => onNoteInput(e.target.value)}
          onBlur={flushNote}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              flushNote();
              onClose();
            }
          }}
          placeholder="One line for this moment"
          className="mt-1 w-full rounded-md border border-ink-200 px-2 py-1.5 text-sm focus:border-plum-400 focus:outline-none"
        />
      </label>

      <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]">
        <Link
          href={`/clients/${clientId}?tab=sessions#${dot.id}`}
          className="text-plum-700 hover:underline font-medium"
        >
          Open session →
        </Link>
        <span
          className={state === "error" ? "text-red-700" : "text-ink-400"}
          aria-live="polite"
        >
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? (error ?? "Didn't save") : ""}
        </span>
        <button type="button" onClick={onClose} className="text-ink-500 hover:text-ink-800">
          Close
        </button>
      </div>
    </div>
  );
}
