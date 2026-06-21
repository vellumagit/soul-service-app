// Availability — compute when the practitioner is genuinely free.
//
// Combines three signals:
//   1. workingHours JSON on practitioner_settings — per-weekday open/close
//   2. sabbathDays array — days she's deliberately off
//   3. Google Calendar FreeBusy — actual busy intervals across her cals
//
// Slices the working window into session-length slots, then filters out
// slots that overlap any busy interval (extended by bufferMinutes on
// either side so meetings don't bump up against each other).
//
// Two surfaces use this:
//   - ScheduleSessionDialog: checkConflict(at, durationMin) → busy or free
//   - Storefront inquiry form: getAvailableWindows(...) → next N free slots
//
// All times are computed in UTC internally; consumers format for display
// in whatever locale matters.

import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitionerSettings } from "@/db/schema";
import { getFreeBusy, type BusyInterval } from "./google-calendar";

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
  | { status: "no-google" };

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/** Return the next N available windows starting from `fromAt`. Walks
 *  forward day-by-day until it finds `limit` slots or hits `lookAheadDays`. */
export async function getAvailableWindows(
  accountId: string,
  opts: {
    fromAt?: Date;
    limit?: number;
    durationMinutes?: number;
    lookAheadDays?: number;
  } = {}
): Promise<AvailableWindow[]> {
  const fromAt = opts.fromAt ?? new Date();
  const limit = opts.limit ?? 6;
  const lookAheadDays = opts.lookAheadDays ?? 21;

  const cfg = await loadConfig(accountId);
  const duration = opts.durationMinutes ?? cfg.defaultSessionMinutes;

  // Pull FreeBusy for the entire look-ahead window in ONE round-trip so
  // we don't hammer Google per-day.
  const endAt = new Date(fromAt.getTime() + lookAheadDays * 24 * 60 * 60 * 1000);
  const busy = await getFreeBusy(accountId, fromAt, endAt);

  const out: AvailableWindow[] = [];
  for (let i = 0; i < lookAheadDays && out.length < limit; i++) {
    const day = new Date(fromAt);
    day.setDate(day.getDate() + i);
    const slots = sliceDay(day, fromAt, duration, cfg, busy);
    for (const slot of slots) {
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

  // 1) Sabbath-day check
  const weekday = WEEKDAY_KEYS[startAt.getDay()];
  if (cfg.sabbathDays.includes(weekday)) {
    return { status: "sabbath-day" };
  }

  // 2) Within working-hours check (if working_hours is set)
  if (cfg.workingHours) {
    const hours = cfg.workingHours[weekday];
    if (!hours) return { status: "outside-hours" };
    const { fromMin, toMin } = parseHours(hours);
    const startMin = startAt.getHours() * 60 + startAt.getMinutes();
    const endMin = endAt.getHours() * 60 + endAt.getMinutes();
    if (startMin < fromMin || endMin > toMin) {
      return { status: "outside-hours" };
    }
  }

  // 3) Google FreeBusy overlap
  const busy = await getFreeBusy(accountId, startAt, endAt);
  if (busy.length === 0) {
    // No Google connection? We still got past sabbath + working-hours,
    // so it's "free" in the only sense we can verify.
    return { status: "free" };
  }
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

type Config = {
  workingHours: WorkingHours | null;
  sabbathDays: string[];
  bufferMinutes: number;
  defaultSessionMinutes: number;
};

async function loadConfig(accountId: string): Promise<Config> {
  const rows = await db
    .select({
      workingHours: practitionerSettings.workingHours,
      sabbathDays: practitionerSettings.sabbathDays,
      bufferMinutes: practitionerSettings.bufferMinutes,
      defaultSessionMinutes: practitionerSettings.defaultSessionMinutes,
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
  day: Date,
  earliestStart: Date,
  durationMinutes: number,
  cfg: Config,
  busy: BusyInterval[]
): AvailableWindow[] {
  const weekday = WEEKDAY_KEYS[day.getDay()];
  if (cfg.sabbathDays.includes(weekday)) return [];

  // No working hours configured for this day → not available.
  const hours = cfg.workingHours?.[weekday];
  if (!hours) return [];
  const { fromMin, toMin } = parseHours(hours);

  // Build the working window in local time on this day.
  const startOfDay = new Date(day);
  startOfDay.setHours(0, 0, 0, 0);
  const windowStart = new Date(
    startOfDay.getTime() + fromMin * 60 * 1000
  );
  const windowEnd = new Date(startOfDay.getTime() + toMin * 60 * 1000);

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
