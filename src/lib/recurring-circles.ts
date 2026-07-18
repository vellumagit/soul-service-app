import "server-only";

/**
 * Recurring weekly Circles. When a group has `recurrenceEnabled`, this keeps
 * the next N weeks filled with a session on the configured weekday + time
 * (interpreted in the practice timezone), so the storefront always has an open
 * seat and she never schedules manually.
 *
 * Runs BOTH immediately when she saves the rhythm (scoped to one group) and
 * hourly from the reminders cron (all groups) to top the window up as time
 * passes. Idempotent + deduped by calendar day in the practice tz, so it never
 * double-books and is safe to run repeatedly.
 */

import { and, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db";
import { groups, groupSessions, practitionerSettings } from "@/db/schema";
import {
  resolveTimeZone,
  zonedWallTimeToUtc,
  zonedYearMonthDay,
} from "./timezone";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function dateKey(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

type RecurringGroup = {
  id: string;
  accountId: string;
  recurrenceWeekday: number | null;
  recurrenceTime: string | null;
  recurrenceWeeksAhead: number;
  defaultCapacity: number;
  defaultDurationMinutes: number;
  defaultPriceCents: number;
};

async function ensureForGroup(
  group: RecurringGroup,
  tz: string,
  now: Date
): Promise<number> {
  const weekday = group.recurrenceWeekday;
  const time = group.recurrenceTime;
  if (weekday == null || weekday < 0 || weekday > 6 || !time) return 0;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return 0;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return 0;

  const weeksAhead = Math.min(Math.max(group.recurrenceWeeksAhead ?? 4, 1), 12);

  // Existing sessions from ~now forward → dedupe keys (tz day), so we never
  // double-book. We include CANCELLED sessions on purpose: if she cancelled a
  // recurring occurrence, that week is intentionally handled ("skip this one")
  // and must NOT be regenerated on the next top-up. To move a week, she cancels
  // it (stays skipped) and schedules a one-off on the new day.
  const existing = await db
    .select({
      scheduledAt: groupSessions.scheduledAt,
      status: groupSessions.status,
    })
    .from(groupSessions)
    .where(
      and(
        eq(groupSessions.groupId, group.id),
        gte(
          groupSessions.scheduledAt,
          new Date(now.getTime() - 25 * 60 * 60 * 1000)
        )
      )
    );
  const taken = new Set<string>();
  for (const s of existing) {
    const ymd = zonedYearMonthDay(new Date(s.scheduledAt), tz);
    taken.add(dateKey(ymd.year, ymd.month0, ymd.day));
  }

  // Walk calendar days from today (in tz) forward; create the matching weekday.
  const today = zonedYearMonthDay(now, tz);
  const base = Date.UTC(today.year, today.month0, today.day);
  let created = 0;
  for (let i = 0; i <= weeksAhead * 7; i++) {
    const d = new Date(base + i * 24 * 60 * 60 * 1000);
    if (d.getUTCDay() !== weekday) continue;
    const y = d.getUTCFullYear();
    const mo = d.getUTCMonth();
    const da = d.getUTCDate();
    const key = dateKey(y, mo, da);
    if (taken.has(key)) continue;

    const instant = zonedWallTimeToUtc(y, mo, da, hour, minute, tz);
    if (instant.getTime() <= now.getTime()) continue; // don't create past slots

    await db.insert(groupSessions).values({
      accountId: group.accountId,
      groupId: group.id,
      scheduledAt: instant,
      durationMinutes: group.defaultDurationMinutes,
      capacity: group.defaultCapacity,
      priceCents: group.defaultPriceCents,
    });
    taken.add(key);
    created++;
  }
  return created;
}

export async function ensureRecurringCircleSessions(opts?: {
  groupId?: string;
  accountId?: string;
}): Promise<{ groups: number; created: number }> {
  const conds = [
    eq(groups.recurrenceEnabled, true),
    eq(groups.published, true),
    isNull(groups.archivedAt),
  ];
  if (opts?.groupId) conds.push(eq(groups.id, opts.groupId));
  if (opts?.accountId) conds.push(eq(groups.accountId, opts.accountId));

  const rows = await db
    .select({
      id: groups.id,
      accountId: groups.accountId,
      recurrenceWeekday: groups.recurrenceWeekday,
      recurrenceTime: groups.recurrenceTime,
      recurrenceWeeksAhead: groups.recurrenceWeeksAhead,
      defaultCapacity: groups.defaultCapacity,
      defaultDurationMinutes: groups.defaultDurationMinutes,
      defaultPriceCents: groups.defaultPriceCents,
      practiceTz: practitionerSettings.timezone,
    })
    .from(groups)
    .leftJoin(
      practitionerSettings,
      eq(practitionerSettings.accountId, groups.accountId)
    )
    .where(and(...conds));

  const now = new Date();
  let created = 0;
  for (const g of rows) {
    const tz = resolveTimeZone(g.practiceTz);
    try {
      created += await ensureForGroup(g, tz, now);
    } catch (err) {
      console.error("[recurring-circles] ensureForGroup failed", g.id, err);
    }
  }
  return { groups: rows.length, created };
}
