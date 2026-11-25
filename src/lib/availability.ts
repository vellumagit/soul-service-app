// Availability — compute when the practitioner is genuinely free.
//
// Combines these signals:
//   1. workingHours JSON on practitioner_settings — per-weekday open/close
//   2. sabbathDays array — days she's deliberately off
//   3. Google Calendar FreeBusy — actual busy intervals across her cals
//   4. Time off (Calendar → Time off) — blocked ranges
//   5. Her OWN bookings in this app — scheduled 1:1 sessions and Circles.
//      Read straight from the DB, so a session counts as busy even when
//      Google isn't connected (before, without Google, the storefront
//      happily offered a visitor a slot she'd already given someone).
//
// Slices the working window into session-length slots, then filters out
// slots that overlap any busy interval (extended by bufferMinutes on
// either side so meetings don't bump up against each other).
//
// Two surfaces use this:
//   - ScheduleSessionDialog: checkConflict(at, durationMin) → busy or free
//   - Storefront inquiry form: getAvailableWindows(...) → next N free slots
//
// Working hours are wall-clock times in the PRACTICE timezone ("mon 09:00"
// means 9 AM Edmonton). The server runs UTC, so every window must be built
// with the zoned helpers — building from UTC midnight offered visitors
// slots at 3 AM her time and hid her real hours.

import "server-only";

import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  groupSessions,
  practitionerSettings,
  sessions,
  timeOff,
} from "@/db/schema";
import { getFreeBusy, type BusyInterval } from "./google-calendar";
import {
  resolveTimeZone,
  zonedAddDays,
  zonedClock,
  zonedWallTimeToUtc,
  zonedWeekday,
  zonedYearMonthDay,
} from "./timezone";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

type WorkingHoursPerDay = { from: string; to: string } | null;
type WorkingHours = Partial<Record<WeekdayKey, WorkingHoursPerDay>>;

export type AvailableWindow = {
  /** ISO timestamp of the start of the slot. */
  startAt: Date;
  /** ISO timestamp of the end (= startAt + durationMin). */
  endAt: Date;
};

export type ConflictCheck =
  | { status: "free" }
  | {
      status: "conflict";
      busyStart: Date;
      busyEnd: Date;
    }
  | { status: "outside-hours" }
  | { status: "sabbath-day" }
  /** Inside a blocked time-off range (Calendar → Time off). */
  | { status: "time-off" }
  | { status: "no-google" };

/** Time-off ranges overlapping [from, to]. Blocking a range is the 4th signal
 *  alongside working hours, sabbath days and Google FreeBusy. */
async function loadTimeOff(
  accountId: string,
  from: Date,
  to: Date
): Promise<{ startsAt: Date; endsAt: Date }[]> {
  const rows = await db
    .select({ startsAt: timeOff.startsAt, endsAt: timeOff.endsAt })
    .from(timeOff)
    .where(
      and(
        eq(timeOff.accountId, accountId),
        lte(timeOff.startsAt, to),
        gte(timeOff.endsAt, from)
      )
    );
  return rows.map((r) => ({ startsAt: new Date(r.startsAt), endsAt: new Date(r.endsAt) }));
}

/** Her own bookings overlapping [from, to]: scheduled 1:1 sessions and
 *  scheduled Circle sessions. Recurring series are materialized ~8 weeks
 *  ahead (recurring-sessions.ts), so upcoming occurrences are real rows here.
 *  Cancelled / completed / no-show rows don't block anything. */
async function loadAppBusy(
  accountId: string,
  from: Date,
  to: Date
): Promise<BusyInterval[]> {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const [oneOnOne, circles] = await Promise.all([
    db
      .select({
        start: sessions.scheduledAt,
        minutes: sessions.durationMinutes,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.accountId, accountId),
          eq(sessions.status, "scheduled"),
          sql`${sessions.scheduledAt} < ${toIso}`,
          sql`${sessions.scheduledAt} + (${sessions.durationMinutes} || ' minutes')::interval > ${fromIso}`
        )
      ),
    db
      .select({
        start: groupSessions.scheduledAt,
        minutes: groupSessions.durationMinutes,
      })
      .from(groupSessions)
      .where(
        and(
          eq(groupSessions.accountId, accountId),
          eq(groupSessions.status, "scheduled"),
          sql`${groupSessions.scheduledAt} < ${toIso}`,
          sql`${groupSessions.scheduledAt} + (${groupSessions.durationMinutes} || ' minutes')::interval > ${fromIso}`
        )
      ),
  ]);
  return [...oneOnOne, ...circles].map((r) => {
    const start = new Date(r.start);
    return { start, end: new Date(start.getTime() + r.minutes * 60 * 1000) };
  });
}

/** Google FreeBusy + her in-app bookings, in one list. */
async function loadBusy(
  accountId: string,
  from: Date,
  to: Date
): Promise<BusyInterval[]> {
  const [google, app] = await Promise.all([
    // A Google hiccup (expired grant, token that won't decrypt) must not
    // take the in-app half down with it — fall back to app bookings only.
    getFreeBusy(accountId, from, to).catch((err) => {
      console.warn("[availability] Google FreeBusy unavailable:", err);
      return [] as BusyInterval[];
    }),
    loadAppBusy(accountId, from, to),
  ]);
  return [...google, ...app];
}

/** Pick `n` slots from one day's free slots, spread across the day: with
 *  n=2 that's the first and the last (e.g. 10:00 and 4:00), not two
 *  back-to-back morning slots. */
function spreadPick(slots: AvailableWindow[], n: number): AvailableWindow[] {
  if (slots.length <= n) return slots;
  if (n <= 1) return slots.slice(0, Math.max(0, n));
  const picked: AvailableWindow[] = [];
  for (let k = 0; k < n; k++) {
    picked.push(slots[Math.round((k * (slots.length - 1)) / (n - 1))]);
  }
  return picked;
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/** Return the next N available windows for the storefront inquiry form.
 *
 *  - Starts `minNoticeHours` out (default 24): she confirms every request by
 *    hand, so a slot 40 minutes from now is one nobody can actually have.
 *  - At most `maxPerDay` per day (default 2), spread across that day, so
 *    six chips span at least three days instead of filling up tomorrow
 *    back-to-back.
 *  - Walks forward day-by-day until it has `limit` slots or runs out of
 *    `lookAheadDays`. */
export async function getAvailableWindows(
  accountId: string,
  opts: {
    fromAt?: Date;
    limit?: number;
    durationMinutes?: number;
    lookAheadDays?: number;
    minNoticeHours?: number;
    maxPerDay?: number;
  } = {}
): Promise<AvailableWindow[]> {
  const fromAt = opts.fromAt ?? new Date();
  const limit = opts.limit ?? 6;
  const lookAheadDays = opts.lookAheadDays ?? 21;
  const maxPerDay = opts.maxPerDay ?? 2;
  const earliest = new Date(
    fromAt.getTime() + (opts.minNoticeHours ?? 24) * 60 * 60 * 1000
  );

  const cfg = await loadConfig(accountId);
  const duration = opts.durationMinutes ?? cfg.defaultSessionMinutes;

  // Pull every busy signal for the entire look-ahead window in ONE pass so
  // we don't hammer Google (or the DB) per-day.
  const endAt = new Date(fromAt.getTime() + lookAheadDays * 24 * 60 * 60 * 1000);
  const [busy, off] = await Promise.all([
    loadBusy(accountId, fromAt, endAt),
    loadTimeOff(accountId, fromAt, endAt),
  ]);

  return computeWindows({
    cfg,
    busy,
    off,
    fromAt,
    earliest,
    endAt,
    duration,
    limit,
    maxPerDay,
    lookAheadDays,
  });
}

/** The pure half of getAvailableWindows — no DB, no Google — so the slot
 *  rules (notice, spread, busy, time off) can be exercised on their own. */
export function computeWindows(input: {
  cfg: AvailabilityConfig;
  busy: BusyInterval[];
  off: { startsAt: Date; endsAt: Date }[];
  fromAt: Date;
  earliest: Date;
  endAt: Date;
  duration: number;
  limit: number;
  maxPerDay: number;
  lookAheadDays: number;
}): AvailableWindow[] {
  const { cfg, busy, off, fromAt, earliest, endAt, duration, limit, maxPerDay, lookAheadDays } = input;
  const out: AvailableWindow[] = [];
  for (let i = 0; i <= lookAheadDays && out.length < limit; i++) {
    // Walk PRACTICE-TZ calendar days — each iteration hands sliceDay the
    // midnight instant of that day in her zone.
    const dayStart = zonedAddDays(fromAt, i, cfg.timezone);
    const slots = sliceDay(dayStart, earliest, duration, cfg, busy).filter(
      (slot) =>
        slot.endAt.getTime() <= endAt.getTime() &&
        !off.some((r) =>
          intervalsOverlap(r.startsAt, r.endsAt, slot.startAt, slot.endAt)
        )
    );
    for (const slot of spreadPick(slots, maxPerDay)) {
      out.push(slot);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Check whether a specific (start, duration) lands on a conflict. */
export async function checkConflict(
  accountId: string,
  startAt: Date,
  durationMinutes: number
): Promise<ConflictCheck> {
  const cfg = await loadConfig(accountId);
  const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);

  // 1) Sabbath-day check — HER weekday, not the server's UTC one.
  const weekday = WEEKDAY_KEYS[zonedWeekday(startAt, cfg.timezone)];
  if (cfg.sabbathDays.includes(weekday)) {
    return { status: "sabbath-day" };
  }

  // 1b) Blocked time off (Calendar → Time off) — a hard no, like a sabbath day.
  const off = await loadTimeOff(accountId, startAt, endAt);
  if (off.some((r) => intervalsOverlap(r.startsAt, r.endsAt, startAt, endAt))) {
    return { status: "time-off" };
  }

  // 2) Within working-hours check (if working_hours is set)
  if (cfg.workingHours) {
    const hours = cfg.workingHours[weekday];
    if (!hours) return { status: "outside-hours" };
    const { fromMin, toMin } = parseHours(hours);
    const startClock = zonedClock(startAt, cfg.timezone);
    const startMin = startClock.hour * 60 + startClock.minute;
    // End as minutes past the SAME midnight — re-reading the end instant's
    // clock wrapped a 23:00 + 2h session to 01:00 and called it in-hours.
    const endMin = startMin + durationMinutes;
    if (startMin < fromMin || endMin > toMin || endMin > 24 * 60) {
      return { status: "outside-hours" };
    }
  }

  // 3) Busy: Google FreeBusy + her own bookings in the app. The app half
  // works with no Google connection — "you already have Vlado at 2:00"
  // used to need Google to be connected to ever appear.
  const busy = await loadBusy(accountId, startAt, endAt);
  for (const iv of busy) {
    if (intervalsOverlap(iv.start, iv.end, startAt, endAt)) {
      return { status: "conflict", busyStart: iv.start, busyEnd: iv.end };
    }
  }
  return { status: "free" };
}

// ─────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────

export type AvailabilityConfig = {
  workingHours: WorkingHours | null;
  sabbathDays: string[];
  bufferMinutes: number;
  defaultSessionMinutes: number;
  /** Practice timezone — working hours are wall-clock in THIS zone. */
  timezone: string;
};

async function loadConfig(accountId: string): Promise<AvailabilityConfig> {
  const rows = await db
    .select({
      workingHours: practitionerSettings.workingHours,
      sabbathDays: practitionerSettings.sabbathDays,
      bufferMinutes: practitionerSettings.bufferMinutes,
      defaultSessionMinutes: practitionerSettings.defaultSessionMinutes,
      timezone: practitionerSettings.timezone,
    })
    .from(practitionerSettings)
    .where(eq(practitionerSettings.accountId, accountId))
    .limit(1);
  const r = rows[0];
  return {
    workingHours: (r?.workingHours as WorkingHours | null) ?? null,
    sabbathDays: (r?.sabbathDays as string[] | null) ?? [],
    bufferMinutes: r?.bufferMinutes ?? 15,
    defaultSessionMinutes: r?.defaultSessionMinutes ?? 60,
    timezone: resolveTimeZone(r?.timezone),
  };
}

function parseHours(h: { from: string; to: string }): {
  fromMin: number;
  toMin: number;
} {
  const [fh, fm] = h.from.split(":").map((n) => parseInt(n, 10));
  const [th, tm] = h.to.split(":").map((n) => parseInt(n, 10));
  return { fromMin: fh * 60 + fm, toMin: th * 60 + tm };
}

function sliceDay(
  /** Midnight instant of the target day IN THE PRACTICE TZ. */
  dayStart: Date,
  earliestStart: Date,
  durationMinutes: number,
  cfg: AvailabilityConfig,
  busy: BusyInterval[]
): AvailableWindow[] {
  const tz = cfg.timezone;
  const weekday = WEEKDAY_KEYS[zonedWeekday(dayStart, tz)];
  if (cfg.sabbathDays.includes(weekday)) return [];

  // No working hours configured for this day → not available.
  const hours = cfg.workingHours?.[weekday];
  if (!hours) return [];
  const { fromMin, toMin } = parseHours(hours);

  // The working window as true instants: "09:00" means 9 AM wall-clock in
  // the practice zone on THIS calendar day (DST-safe — not minutes counted
  // from midnight, which drift an hour on transition days).
  const ymd = zonedYearMonthDay(dayStart, tz);
  const windowStart = zonedWallTimeToUtc(
    ymd.year,
    ymd.month0,
    ymd.day,
    Math.floor(fromMin / 60),
    fromMin % 60,
    tz
  );
  const windowEnd = zonedWallTimeToUtc(
    ymd.year,
    ymd.month0,
    ymd.day,
    Math.floor(toMin / 60),
    toMin % 60,
    tz
  );

  // If we're looking from a time later than the window start, jump
  // forward.
  const cursorStart = new Date(
    Math.max(windowStart.getTime(), earliestStart.getTime())
  );

  // Step in `durationMinutes + bufferMinutes` increments — first slot
  // is the earliest aligned start, subsequent slots are back-to-back
  // including the buffer.
  const stepMs = (durationMinutes + cfg.bufferMinutes) * 60 * 1000;
  // Round cursor up to the next quarter-hour for cleaner slot times.
  const cursor = new Date(roundUpToQuarterHour(cursorStart.getTime()));

  const slots: AvailableWindow[] = [];
  while (cursor.getTime() + durationMinutes * 60 * 1000 <= windowEnd.getTime()) {
    const slotStart = new Date(cursor);
    const slotEnd = new Date(cursor.getTime() + durationMinutes * 60 * 1000);

    const bufferedStart = new Date(
      slotStart.getTime() - cfg.bufferMinutes * 60 * 1000
    );
    const bufferedEnd = new Date(
      slotEnd.getTime() + cfg.bufferMinutes * 60 * 1000
    );

    const conflicts = busy.some((b) =>
      intervalsOverlap(b.start, b.end, bufferedStart, bufferedEnd)
    );
    if (!conflicts) {
      slots.push({ startAt: slotStart, endAt: slotEnd });
    }
    cursor.setTime(cursor.getTime() + stepMs);
  }
  return slots;
}

function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

function roundUpToQuarterHour(ms: number): number {
  const quarter = 15 * 60 * 1000;
  return Math.ceil(ms / quarter) * quarter;
}
