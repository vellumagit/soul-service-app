// Just-in-time notetaker scheduling.
//
// Why this exists: a recurring series used to create one Recall bot per
// occurrence the moment the series was saved — 52 POST /bot calls in a burst.
// Two series in the same minute blew through Recall's 120/min rate limit, the
// overflow failed silently, and every bot that DID get created sat in Recall's
// queue for months (and survived the series being cancelled). Hundreds of
// scheduled bots piled up.
//
// Now the cron (every 10 min) sweeps for sessions starting soon and sends a
// bot for each — a handful of calls spread across the day instead of a burst.
// It is also the safety net for any session whose bot didn't get created at
// booking time (Meet link arrived late, auto-add was off then and on now, the
// rate limit hit, etc.).
//
// State machine on `sessions.recall_bot_status` when `recall_bot_id` is NULL:
//   NULL           — nothing decided; the sweep will add a bot if auto-add is on
//   "pending_auto" — explicitly queued (series occurrences); same as NULL for
//                    the sweep, but the card shows "Notetaker queued"
//   "cancelled"    — the practitioner called the bot off; the sweep leaves it alone
// Once a bot exists, `recall_bot_id` is set and the status mirrors Recall's.
import "server-only";
import { and, asc, eq, gte, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { practitionerSettings, sessions } from "@/db/schema";
import { createBot, recallConfigured } from "./recall";

/** Status marker for "a bot will be sent shortly before the session". */
export const RECALL_PENDING_AUTO = "pending_auto";
/** Status marker for "the practitioner called the bot off — don't re-add". */
export const RECALL_CANCELLED = "cancelled";

/** How far ahead the sweep looks. With a 10-minute cron this catches every
 *  session on the first tick that lands within the window. */
const LEAD_MINUTES = 45;
/** How far back — a session that started up to this long ago and still has
 *  no bot gets one sent immediately (covers a missed cron tick). */
const GRACE_MINUTES = 15;
/** Recall rejects join_at less than 10 min out. Below this we omit join_at
 *  so the bot joins right away. */
const IMMEDIATE_BELOW_MINUTES = 11;
/** Hard cap per tick — keeps a backlog from ever approaching Recall's
 *  120/min POST /bot limit. Anything left over is picked up next tick. */
const MAX_PER_TICK = 40;

export type RecallSweepStats = {
  due: number;
  created: number;
  failed: number;
  errors: string[];
};

export async function scheduleDueRecallBots(
  now: Date = new Date()
): Promise<RecallSweepStats> {
  const stats: RecallSweepStats = { due: 0, created: 0, failed: 0, errors: [] };
  if (!recallConfigured()) return stats;

  const windowStart = new Date(now.getTime() - GRACE_MINUTES * 60 * 1000);
  const windowEnd = new Date(now.getTime() + LEAD_MINUTES * 60 * 1000);

  const due = await db
    .select({
      id: sessions.id,
      accountId: sessions.accountId,
      scheduledAt: sessions.scheduledAt,
      meetUrl: sessions.meetUrl,
      botName: practitionerSettings.recallBotName,
    })
    .from(sessions)
    .innerJoin(
      practitionerSettings,
      eq(practitionerSettings.accountId, sessions.accountId)
    )
    .where(
      and(
        eq(practitionerSettings.recallEnabled, true),
        eq(practitionerSettings.recallAutoAdd, true),
        eq(sessions.status, "scheduled"),
        isNotNull(sessions.meetUrl),
        isNull(sessions.recallBotId),
        or(
          isNull(sessions.recallBotStatus),
          eq(sessions.recallBotStatus, RECALL_PENDING_AUTO)
        ),
        gte(sessions.scheduledAt, windowStart),
        lte(sessions.scheduledAt, windowEnd)
      )
    )
    .orderBy(asc(sessions.scheduledAt))
    .limit(MAX_PER_TICK);

  stats.due = due.length;

  for (const s of due) {
    if (!s.meetUrl) continue;
    const scheduledAt = new Date(s.scheduledAt);
    const minutesFromNow = (scheduledAt.getTime() - now.getTime()) / 60000;
    const joinAt =
      minutesFromNow > IMMEDIATE_BELOW_MINUTES ? scheduledAt.toISOString() : null;
    try {
      const bot = await createBot({
        meetingUrl: s.meetUrl,
        botName: s.botName ?? "Notetaker",
        joinAt,
        metadata: { sessionId: s.id, accountId: s.accountId, source: "cron" },
      });
      await db
        .update(sessions)
        .set({
          recallBotId: bot.id,
          recallBotStatus: bot.rawStatus ?? (joinAt ? "scheduled" : "joining_call"),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(sessions.accountId, s.accountId),
            eq(sessions.id, s.id),
            // Guard against a concurrent manual "Add notetaker" click.
            isNull(sessions.recallBotId)
          )
        );
      stats.created++;
    } catch (err) {
      stats.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      stats.errors.push(`${s.id}: ${msg}`);
      console.error("[recall sweep] bot creation failed for", s.id, msg);
      // A rate-limit response means every further call this tick will fail
      // too — stop and let the next tick pick the rest up.
      if (/\(429\)/.test(msg)) break;
    }
  }

  return stats;
}

/** Mark every future, scheduled, Meet-bearing session in a series as queued
 *  for the sweep — IF the practitioner has auto-add on. No Recall calls. */
export async function queueRecallForSeries(
  accountId: string,
  seriesId: string,
  now: Date = new Date()
): Promise<number> {
  if (!recallConfigured()) return 0;
  const [settings] = await db
    .select({
      enabled: practitionerSettings.recallEnabled,
      autoAdd: practitionerSettings.recallAutoAdd,
    })
    .from(practitionerSettings)
    .where(eq(practitionerSettings.accountId, accountId))
    .limit(1);
  if (!settings?.enabled || !settings.autoAdd) return 0;

  const rows = await db
    .update(sessions)
    .set({ recallBotStatus: RECALL_PENDING_AUTO, updatedAt: now })
    .where(
      and(
        eq(sessions.accountId, accountId),
        eq(sessions.seriesId, seriesId),
        eq(sessions.status, "scheduled"),
        isNotNull(sessions.meetUrl),
        isNull(sessions.recallBotId),
        isNull(sessions.recallBotStatus),
        sql`${sessions.scheduledAt} > ${now.toISOString()}`
      )
    )
    .returning({ id: sessions.id });
  return rows.length;
}
