import "server-only";

/**
 * Lazy, bounded materialization of 1:1 recurring session series.
 *
 * A `session_series` row is the RULE (firstAt + frequency + occurrenceCount).
 * We do NOT spawn all N session rows when the series is created — that's what
 * put 500+ empty rows on a profile and froze it. Instead we materialize only a
 * rolling window (the next HORIZON_WEEKS weeks) and top it up here as time
 * passes, exactly like recurring Circles (see recurring-circles.ts).
 *
 * The whole series is represented on Google Calendar by ONE recurring event
 * (created at series-creation time, covering every occurrence via its RRULE),
 * so topping up rows makes ZERO Google calls — new rows just inherit the
 * series' googleRecurringEventId + meetUrl. This is the guard that stops the
 * "one calendar event per occurrence" fan-out from ever coming back.
 *
 * Runs on save (scoped to one series, for the first window) and daily from the
 * reminders cron (all active series). Idempotent + deduped by occurrenceIndex,
 * so it's safe to run repeatedly and never double-books.
 */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sessions, sessionSeries, practitionerSettings } from "@/db/schema";
import {
  resolveTimeZone,
  zonedClock,
  zonedWallTimeToUtc,
  zonedYearMonthDay,
} from "./timezone";

/** How far ahead we keep session rows materialized. A weekly series therefore
 *  holds ~8 future rows at any moment instead of up to 52. */
export const SERIES_HORIZON_WEEKS = 8;

/** Never create more than this many rows for one series in a single tick —
 *  a backlog (e.g. a long series that somehow lost its window) fills over a
 *  few ticks instead of in one burst. */
const MAX_CREATE_PER_TICK = 40;

type Freq = "weekly" | "biweekly" | "monthly";

/**
 * DST-correct instant of occurrence `index` (1-based) for a series, computed
 * in the practice timezone so the wall-clock time ("Mon 10:00") is held
 * constant across the spring/fall shift — matching how the booking dialog
 * computes the dates client-side. Server-side naive date math (setDate) would
 * instead hold the UTC instant and drift the local time by an hour.
 */
export function occurrenceInstant(
  firstAt: Date,
  frequency: Freq,
  index: number,
  tz: string
): Date {
  const { year, month0, day } = zonedYearMonthDay(firstAt, tz);
  const { hour, minute } = zonedClock(firstAt, tz);
  const i = index - 1;
  let cal: Date;
  if (frequency === "monthly") {
    // Same day-of-month each month; Date handles overflow (Jan 31 → Mar 3).
    cal = new Date(Date.UTC(year, month0 + i, day));
  } else {
    const stepDays = frequency === "biweekly" ? 14 : 7;
    cal = new Date(Date.UTC(year, month0, day) + i * stepDays * 86_400_000);
  }
  return zonedWallTimeToUtc(
    cal.getUTCFullYear(),
    cal.getUTCMonth(),
    cal.getUTCDate(),
    hour,
    minute,
    tz
  );
}

type SeriesRow = {
  id: string;
  accountId: string;
  clientId: string;
  type: string;
  frequency: Freq;
  durationMinutes: number;
  firstAt: Date;
  occurrenceCount: number;
  intention: string | null;
  practiceTz: string | null;
};

async function ensureForSeries(
  series: SeriesRow,
  now: Date,
  horizonEnd: Date
): Promise<number> {
  const tz = resolveTimeZone(series.practiceTz);

  // Every existing occurrence of this series — ANY status. A cancelled row is
  // a deliberate "skip this one" marker and must NOT be regenerated (same rule
  // as the recurring-Circle top-up).
  const existing = await db
    .select({
      idx: sessions.occurrenceIndex,
      googleRecurringEventId: sessions.googleRecurringEventId,
      meetUrl: sessions.meetUrl,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.accountId, series.accountId),
        eq(sessions.seriesId, series.id)
      )
    );

  const taken = new Set<number>();
  for (const e of existing) if (e.idx != null) taken.add(e.idx);

  // New rows inherit the series' single recurring Google event + shared Meet
  // link, so nothing new is created on Google's side.
  const anchor =
    existing.find((e) => e.googleRecurringEventId) ?? existing[0] ?? null;
  const googleRecurringEventId = anchor?.googleRecurringEventId ?? null;
  const meetUrl = anchor?.meetUrl ?? null;

  const toInsert: (typeof sessions.$inferInsert)[] = [];
  for (let index = 1; index <= series.occurrenceCount; index++) {
    if (taken.has(index)) continue;
    const at = occurrenceInstant(series.firstAt, series.frequency, index, tz);
    if (at.getTime() <= now.getTime()) continue; // never backfill from the cron
    if (at.getTime() > horizonEnd.getTime()) continue; // beyond the window — later
    toInsert.push({
      accountId: series.accountId,
      clientId: series.clientId,
      type: series.type,
      status: "scheduled",
      scheduledAt: at,
      durationMinutes: series.durationMinutes,
      intention: series.intention,
      seriesId: series.id,
      occurrenceIndex: index,
      googleRecurringEventId,
      meetUrl,
    });
    if (toInsert.length >= MAX_CREATE_PER_TICK) break;
  }

  if (toInsert.length === 0) return 0;
  await db.insert(sessions).values(toInsert);
  return toInsert.length;
}

export async function ensureSeriesSessions(opts?: {
  seriesId?: string;
  accountId?: string;
}): Promise<{ series: number; created: number }> {
  const conds = [isNull(sessionSeries.cancelledAt)];
  if (opts?.seriesId) conds.push(eq(sessionSeries.id, opts.seriesId));
  if (opts?.accountId) conds.push(eq(sessionSeries.accountId, opts.accountId));

  const rows = await db
    .select({
      id: sessionSeries.id,
      accountId: sessionSeries.accountId,
      clientId: sessionSeries.clientId,
      type: sessionSeries.type,
      frequency: sessionSeries.frequency,
      durationMinutes: sessionSeries.durationMinutes,
      firstAt: sessionSeries.firstAt,
      occurrenceCount: sessionSeries.occurrenceCount,
      intention: sessionSeries.intention,
      practiceTz: practitionerSettings.timezone,
    })
    .from(sessionSeries)
    .leftJoin(
      practitionerSettings,
      eq(practitionerSettings.accountId, sessionSeries.accountId)
    )
    .where(and(...conds));

  const now = new Date();
  const horizonEnd = new Date(
    now.getTime() + SERIES_HORIZON_WEEKS * 7 * 86_400_000
  );

  let created = 0;
  const touched: { accountId: string; id: string }[] = [];
  for (const s of rows) {
    try {
      const n = await ensureForSeries(s as SeriesRow, now, horizonEnd);
      if (n > 0) {
        created += n;
        touched.push({ accountId: s.accountId, id: s.id });
      }
    } catch (err) {
      console.error("[recurring-sessions] ensureForSeries failed", s.id, err);
    }
  }

  // Mark newly materialized rows for the just-in-time notetaker sweep (no-op
  // unless auto-add is on and the row carries a Meet link). The sweep sends the
  // actual bot ~40 min before each occurrence — never here.
  for (const t of touched) {
    try {
      const { queueRecallForSeries } = await import("./recall-scheduler");
      await queueRecallForSeries(t.accountId, t.id);
    } catch (err) {
      console.warn("[recurring-sessions] recall queue failed", t.id, err);
    }
  }

  return { series: rows.length, created };
}
