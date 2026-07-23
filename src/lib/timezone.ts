// Timezone helpers shared by every server-rendered email (reminders +
// booking confirmation). scheduledAt is a true instant; these format it into a
// chosen IANA zone with an explicit zone label so the recipient always sees an
// unambiguous local time — never the server's UTC.
//
// Resolution order is the caller's responsibility via resolveTimeZone():
//   - Client-facing emails: client.timezone → session.timezone → practice tz
//   - Practitioner emails:  session.timezone → practice tz
// Anything unusable falls through to DEFAULT_TIME_ZONE.

// Final fallback for legacy rows created before any zone was captured. Chosen
// as the practice's expected home region; a real practice/session/client zone
// overrides it the moment one is set.
export const DEFAULT_TIME_ZONE = "America/Toronto";

/** A small, friendly picker list for the Settings dropdown. Not exhaustive —
 *  the stored value is a free IANA string, so any zone works; this just covers
 *  the common ones without making her hunt. */
export const COMMON_TIME_ZONES: { id: string; label: string }[] = [
  { id: "America/Vancouver", label: "Pacific — Vancouver / LA" },
  { id: "America/Edmonton", label: "Mountain — Edmonton / Denver" },
  { id: "America/Winnipeg", label: "Central — Winnipeg / Chicago" },
  { id: "America/Toronto", label: "Eastern — Toronto / New York" },
  { id: "America/Halifax", label: "Atlantic — Halifax" },
  { id: "Europe/London", label: "UK — London" },
  { id: "Europe/Kyiv", label: "Ukraine — Kyiv" },
  { id: "Europe/Berlin", label: "Central Europe — Berlin / Warsaw" },
  { id: "Europe/Bucharest", label: "Eastern Europe — Bucharest / Athens" },
];

/** True if `tz` is a usable IANA zone name on this runtime. */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || typeof tz !== "string") return false;
  try {
    // Throws a RangeError for an unknown time zone.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** First valid candidate, else DEFAULT_TIME_ZONE. Pass most-specific first. */
export function resolveTimeZone(
  ...candidates: (string | null | undefined)[]
): string {
  for (const c of candidates) {
    if (isValidTimeZone(c)) return c;
  }
  return DEFAULT_TIME_ZONE;
}

/** "Monday, July 14 at 3:30 PM EDT" — the full labelled line for email bodies. */
export function formatSessionLong(date: Date, timeZone: string): string {
  const tz = resolveTimeZone(timeZone);
  return date.toLocaleString("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** "Mon, Jul 14" — for subject lines. */
export function formatSessionShortDate(date: Date, timeZone: string): string {
  const tz = resolveTimeZone(timeZone);
  return date.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "3:30 PM EDT" — short time WITH the zone label. */
export function formatSessionShortTime(date: Date, timeZone: string): string {
  const tz = resolveTimeZone(timeZone);
  return date.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Wall-clock ↔ instant conversion (for recurring schedules). "Every Tuesday
// 7pm in America/Toronto" must map to the correct UTC instant year-round —
// naively adding 7×24h drifts by an hour across DST. These helpers do it right.
// ─────────────────────────────────────────────────────────────────────────

/** Offset (ms) to ADD to a UTC instant to get the wall-clock time in `tz`
 *  (wallMs = utcMs + offset). */
function tzOffsetMs(utcDate: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(utcDate)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return asUtc - utcDate.getTime();
}

/**
 * Convert a wall-clock time in `tz` to the true UTC instant. DST-correct via a
 * two-step offset refinement (the standard date-fns-tz approach). `month0` is
 * 0-based. e.g. zonedWallTimeToUtc(2026, 6, 14, 19, 0, "America/Toronto") → the
 * Date for 7:00 PM Toronto on Jul 14, 2026.
 */
export function zonedWallTimeToUtc(
  year: number,
  month0: number,
  day: number,
  hour: number,
  minute: number,
  tz: string
): Date {
  const zone = resolveTimeZone(tz);
  const guess = Date.UTC(year, month0, day, hour, minute);
  const off1 = tzOffsetMs(new Date(guess), zone);
  let ts = guess - off1;
  const off2 = tzOffsetMs(new Date(ts), zone);
  if (off2 !== off1) ts = guess - off2;
  return new Date(ts);
}

/** Wall-clock hour (0–23) and minute of an instant, as seen in `tz`. Lets the
 *  calendar position a block by HER local hour instead of the viewer's. */
export function zonedClock(
  date: Date,
  tz: string
): { hour: number; minute: number } {
  const zone = resolveTimeZone(tz);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return { hour: Number(map.hour), minute: Number(map.minute) };
}

/** "YYYY-MM-DD" calendar date of an instant, as seen in `tz`. Used to bucket
 *  sessions into day columns/cells by HER local day, viewer-independent. */
export function zonedDateKey(date: Date, tz: string): string {
  const { year, month0, day } = zonedYearMonthDay(date, tz);
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
}

/** Calendar year / month (0-based) / day of an instant, as seen in `tz`. */
export function zonedYearMonthDay(
  date: Date,
  tz: string
): { year: number; month0: number; day: number } {
  const zone = resolveTimeZone(tz);
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month0: Number(map.month) - 1,
    day: Number(map.day),
  };
}
