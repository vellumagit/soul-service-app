"use client";

// Datetime-local picker that submits a tz-aware ISO string.
//
// Why this exists: HTML's <input type="datetime-local"> produces strings like
// "2026-05-17T14:00" with NO timezone marker. When the server parses that with
// `new Date(str)`, it interprets it as the SERVER'S local time. On Vercel
// that's UTC, so a 4pm pick in Buenos Aires gets stored as 16:00 UTC = 13:00
// Buenos Aires when rendered back to her — silently 3 hours off.
//
// Fix: keep the visible <input> as datetime-local (great UX, native picker),
// but mirror its value into a hidden field as a proper ISO string with the
// user's timezone applied. The form sends the ISO version under the same
// name the actions read. The server's `new Date(iso)` then correctly resolves
// to the moment she actually picked.
//
// Usage is a drop-in replacement: same `name`, same `defaultValue` (in
// datetime-local format), same `required` semantics.

import { useState } from "react";

export function LocalDateTimeInput({
  name,
  defaultValue,
  required,
  className,
  min,
  max,
  disabled,
  onChange,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  onChange?: (localValue: string, isoValue: string) => void;
}) {
  const [local, setLocal] = useState(defaultValue ?? "");

  // Convert "2026-05-17T14:00" (interpreted in browser's local TZ) to an ISO
  // string with the correct UTC moment. `new Date(localStr)` is the same
  // local-tz-aware parse the browser does for date pickers.
  const iso = local ? safeToIso(local) : "";

  return (
    <>
      <input
        type="datetime-local"
        value={local}
        onChange={(e) => {
          const next = e.target.value;
          setLocal(next);
          onChange?.(next, next ? safeToIso(next) : "");
        }}
        required={required}
        className={className}
        min={min}
        max={max}
        disabled={disabled}
      />
      {/* The hidden field is what the form actually submits. The visible
          datetime-local input has no `name`, so its raw (timezone-less)
          string never reaches the server. */}
      <input type="hidden" name={name} value={iso} />
    </>
  );
}

function safeToIso(local: string): string {
  // Defensive: if the browser hands us something unparseable (shouldn't happen
  // with datetime-local but be paranoid), fall back to the raw value so the
  // server-side `required` check still fires with a sensible error.
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return local;
  return d.toISOString();
}
