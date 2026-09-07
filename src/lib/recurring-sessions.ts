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
 * Two invariants make this safe to run blindly every day:
 *
 *  1. HIGH-WATER MARK. `session_series.materializedThroughIndex` records the
 *     highest occurrence index ever handled. The top-up only creates indices
 *     ABOVE it and then advances it. So an occurrence that later disappears —
 *     she deletes it, a cleanup purges it — is never resurrected, because its
 *     index is already below the mark. (Deriving "what exists" from session
 *     rows was exactly how 21 purged test series nearly came back to life.)
 *
 *  2. ONE GOOGLE EVENT. The whole series is one recurring Google event,
 *     created at series-creation time with an RRULE covering EVERY occurrence
 *     and remembered on the series row. Topped-up rows just inherit its id +
 *     Meet link — ZERO Google calls here. The per-occurrence calendar fan-out
 *     structurally cannot come back.
 *
 * Plus a DB unique index on (series_id, occurrence_index), so even a race
 * (overlapping cron ticks) can't double-insert an occurrence.
 *
 * Runs daily from the reminders cron (all active series). Idempotent.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
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
 *  a backlog fills over a few ticks instead of in one burst. */
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
  materializedThroughIndex: number;
  googleRecurringEventId: string | null;
  meetUrl: string | null;
  intention: string | null;
  practiceTz: string | null;
};

async function ensureForSeries(
  series: SeriesRow,
  now: Date,
  horizonEnd: Date
): Promise<number> {
  const tz = resolveTimeZone(series.practiceTz);

  // Belt-and-braces alongside the high-water mark: never create an index that
  // already has a row of ANY status (a cancelled row is a deliberate "skip").
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

  // Inherit the series' single recurring Google event + shared Meet link.
  // The series row is authoritative; fall back to any session row that still
  // carries it (series created before the column existed).
  const legacyAnchor = existing.find((e) => e.googleRecurringEventId) ?? null;
  const googleRecurringEventId =
    series.googleRecurringEventId ?? legacyAnchor?.googleRecurringEventId ?? null;
  const meetUrl = series.meetUrl ?? legacyAnchor?.meetUrl ?? null;

  const toInsert: (typeof sessions.$inferInsert)[] = [];
  // Walk ascending from just above the mark. Dates are monotonic, so the first
  // occurrence beyond the horizon means every later one is too — stop there
  // and leave the mark pointing at the last index we actually handled.
  let newMark = series.materializedThroughIndex;
  for (
    let index = series.materializedThroughIndex + 1;
    index <= series.occurrenceCount;
    index++
  ) {
    const at = occurrenceInstant(series.firstAt, series.frequency, index, tz);
    if (at.getTime() > horizonEnd.getTime()) break;
    newMark = index; // handled from here on, created or not
    if (at.getTime() <= now.getTime()) continue; // missed/past — don't invent a past row
    if (taken.has(index)) continue;
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

  if (toInsert.length > 0) {
    // The unique index on (series_id, occurrence_index) makes a concurrent
    // duplicate a no-op instead of an error.
    await db.insert(sessions).values(toInsert).onConflictDoNothing();
  }

  if (newMark > series.materializedThroughIndex) {
    // Monotonic: never move the mark backwards, even if two ticks race.
    await db
      .update(sessionSeries)
      .set({
        materializedThroughIndex: sql`GREATEST(${sessionSeries.materializedThroughIndex}, ${newMark})`,
        updatedAt: now,
      })
      .where(eq(sessionSeries.id, series.id));
  }

  return toInsert.length;
}

export async function ensureSeriesSessions(opts?: {
  seriesId?: string;
  accountId?: string;
}): Promise<{ series: number; created: number }> {
  const conds = [
    isNull(sessionSeries.cancelledAt),
    // Finished series (everything materialized) drop out of the daily scan.
    sql`${sessionSeries.materializedThroughIndex} < ${sessionSeries.occurrenceCount}`,
  ];
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
      materializedThroughIndex: sessionSeries.materializedThroughIndex,
      googleRecurringEventId: sessionSeries.googleRecurringEventId,
      meetUrl: sessionSeries.meetUrl,
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
