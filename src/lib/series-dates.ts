// Client-safe date math shared by the series dialogs. Steps a series by WALL
// CLOCK in the practice timezone, so "Monday 10am" stays 10am across the DST
// boundary instead of drifting an hour (naive UTC arithmetic would). The
// server's cron top-up (recurring-sessions.ts → occurrenceInstant) uses the
// identical rule, so client-computed and server-computed dates always agree.

import { zonedWallTimeToUtc } from "./timezone";

export type SeriesFrequency = "weekly" | "biweekly" | "monthly";

/** Split "YYYY-MM-DDTHH:mm" (a datetime-local value) into its parts. Null when
 *  unparseable. Trailing seconds are tolerated. */
export function parseWall(local: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month0: Number(m[2]) - 1,
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
  };
}

/** The typed wall clock as a true instant, read in `tz`. Falls back to the raw
 *  string when unparseable so the server can reject it with a clear message. */
export function localToIso(local: string, tz: string): string {
  const w = parseWall(local);
  if (!w) return local;
  const d = zonedWallTimeToUtc(w.year, w.month0, w.day, w.hour, w.minute, tz);
  return Number.isNaN(d.getTime()) ? local : d.toISOString();
}

/** `count` occurrence instants starting at the typed wall clock. */
export function computeDates(
  firstLocal: string,
  frequency: SeriesFrequency,
  count: number,
  tz: string
): Date[] {
  const w = parseWall(firstLocal);
  if (!w) return [];
  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    const step = new Date(
      Date.UTC(
        w.year,
        w.month0 + (frequency === "monthly" ? i : 0),
        w.day +
          (frequency === "weekly" ? i * 7 : frequency === "biweekly" ? i * 14 : 0)
      )
    );
    dates.push(
      zonedWallTimeToUtc(
        step.getUTCFullYear(),
        step.getUTCMonth(),
        step.getUTCDate(),
        w.hour,
        w.minute,
        tz
      )
    );
  }
  return dates;
}

export function formatPreview(d: Date, tz: string): string {
  return d.toLocaleString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
