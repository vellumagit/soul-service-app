"use client";

// "Jump to date" — a native date picker in the calendar toolbar.
//
// Without this she can only step prev/next a week (or month) at a time.
// Trying to find what she did on, say, May 4th from today (May 25th) means
// clicking "Prev" three times. With a real picker, one click and she's there.
//
// Picking a date navigates to `/calendar?view=<current>&start=<that-date-iso>`.
// The /calendar page already understands `start` and computes the right week
// or month boundary from it, so we just need to feed it the chosen date.

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CalendarJumpToDate({
  view,
  currentStart,
}: {
  view: "week" | "month";
  /** ISO date of the current week or month start, for the picker default. */
  currentStart: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentStart.slice(0, 10));

  function jumpTo(dateStr: string) {
    if (!dateStr) return;
    // Build an ISO timestamp at noon UTC on the chosen day. Noon (not 00:00)
    // avoids edge-of-day timezone weirdness — wherever she is in the world,
    // noon UTC lands inside the same calendar day in her local zone.
    const iso = new Date(`${dateStr}T12:00:00Z`).toISOString();
    router.push(`/calendar?view=${view}&start=${encodeURIComponent(iso)}`);
  }

  return (
    <label
      className="flex items-center gap-1.5 text-xs text-ink-600 border border-ink-200 rounded-md px-2 py-1 cursor-text hover:border-ink-300 focus-within:border-plum-500 focus-within:ring-1 focus-within:ring-plum-100"
      title="Jump to a specific date"
    >
      <svg
        className="w-3.5 h-3.5 text-ink-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={1.8}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      <input
        type="date"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          jumpTo(e.target.value);
        }}
        className="bg-transparent outline-none cursor-pointer font-mono text-[11px]"
        aria-label="Jump to date"
      />
    </label>
  );
}
