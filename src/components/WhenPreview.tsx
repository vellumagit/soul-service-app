"use client";

// Spell out what a native date / datetime picker is holding.
//
// iOS shows "Mon, Sep 14" style context inside its picker; Android's does
// not — the field just reads "2026-09-14" and the weekday is a guess. So
// every date-bearing field in the app writes the day out in words under
// the input ("Monday, September 14, 2026 · 12:00 PM"), the same on every
// phone and desktop. Pure wall-clock: no timezone math, it just reads the
// digits the picker produced.

import { useState } from "react";

/** "2026-09-14" → "Monday, September 14, 2026";
 *  "2026-09-14T19:30" → "Monday, September 14, 2026 · 7:30 PM".
 *  Anything else (blank, partial) → "". */
export function readableWall(local: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(local ?? "");
  if (!m) return "";
  const [, y, mo, d, h, mi] = m;
  const hasTime = h !== undefined;
  const date = new Date(
    Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      hasTime ? Number(h) : 12,
      hasTime ? Number(mi) : 0
    )
  );
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  if (!hasTime) return day;
  const time = date.toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} · ${time}`;
}

/** The spelled-out line under a picker. Renders nothing while the field is
 *  blank, so an optional date doesn't grow an empty row. */
export function WhenPreview({
  value,
  className = "",
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const text = readableWall(value);
  if (!text) return null;
  return (
    <div
      className={`text-[11px] text-ink-600 mt-1 ${className}`}
      aria-live="polite"
    >
      {text}
    </div>
  );
}

/** A native <input type="date"> with the day written out underneath.
 *  Drop-in for an uncontrolled date input (name / defaultValue / className);
 *  pass `value` + `onChange` to control it and the line follows `value`. */
export function DateInput({
  defaultValue,
  value,
  onChange,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [typed, setTyped] = useState(
    typeof defaultValue === "string" ? defaultValue : ""
  );
  const shown = typeof value === "string" ? value : typed;
  return (
    <div className="w-full">
      <input
        {...rest}
        type="date"
        defaultValue={defaultValue}
        value={value}
        onChange={(e) => {
          setTyped(e.target.value);
          onChange?.(e);
        }}
      />
      <WhenPreview value={shown} />
    </div>
  );
}
