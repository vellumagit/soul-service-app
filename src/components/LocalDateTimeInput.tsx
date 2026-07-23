"use client";

// Datetime picker that means what the rest of the workspace says.
//
// The whole practitioner workspace displays times in HER practice timezone
// (see TimeZoneProvider). So when she — or Brian, administering from Brazil —
// types "6:30 PM" into a picker, it has to MEAN 6:30 PM in that same practice
// zone. Otherwise the app contradicts itself: you type 6:30 and it shows 2:30.
//
// Two things this component fixes about a bare <input type="datetime-local">:
//
//  1. It has no timezone marker at all. "2026-07-26T19:00" sent to a UTC server
//     and parsed with `new Date()` becomes 19:00 UTC — a 7pm circle landing at
//     1pm Edmonton.
//  2. Even when converted client-side, the browser converts using the VIEWER's
//     zone, so the same keystrokes mean different instants depending on where
//     you're sitting.
//
// So: the visible picker stays a native datetime-local (good UX), but the
// wall-clock it shows is interpreted in `timeZone` — defaulting to the practice
// zone from context — and mirrored into a hidden field as a true ISO instant.
// A small zone badge sits next to it so the zone is never a guess.

import { useState } from "react";
import { zonedWallTimeToUtc } from "@/lib/timezone";
import { zoneAbbrev } from "@/lib/format";
import { useTimeZone } from "./TimeZoneProvider";

/** "2026-07-26T19:00" + zone → the true UTC instant for that wall clock. */
function wallToIso(local: string, timeZone: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return local; // let the server's `required`/parse check complain
  const [, y, mo, d, h, mi] = m;
  const instant = zonedWallTimeToUtc(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    timeZone
  );
  return Number.isNaN(instant.getTime()) ? local : instant.toISOString();
}

export function LocalDateTimeInput({
  name,
  defaultValue,
  required,
  className,
  min,
  max,
  disabled,
  onChange,
  timeZone,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  onChange?: (localValue: string, isoValue: string) => void;
  /** Override the zone the typed wall-clock is read in. Defaults to the
   *  practice timezone from TimeZoneProvider. */
  timeZone?: string;
}) {
  const contextTz = useTimeZone();
  const tz = timeZone ?? contextTz;
  const [local, setLocal] = useState(defaultValue ?? "");

  const iso = local ? wallToIso(local, tz) : "";
  // Label the zone for the moment being picked, so DST reads correctly
  // (MDT in July, MST in December).
  const zoneLabel = zoneAbbrev(iso ? new Date(iso) : new Date(), tz);

  return (
    <span className="inline-flex items-center gap-2 w-full">
      <input
        type="datetime-local"
        value={local}
        onChange={(e) => {
          const next = e.target.value;
          setLocal(next);
          onChange?.(next, next ? wallToIso(next, tz) : "");
        }}
        required={required}
        className={className}
        min={min}
        max={max}
        disabled={disabled}
      />
      {/* The hidden field is what the form actually submits — a true instant.
          The visible picker has no `name`, so its zone-less string never
          reaches the server. */}
      <input type="hidden" name={name} value={iso} />
      {zoneLabel && (
        <span
          className="text-[10px] uppercase tracking-wide text-ink-400 font-mono shrink-0"
          title={`Times are entered in your practice timezone (${tz})`}
        >
          {zoneLabel}
        </span>
      )}
    </span>
  );
}
