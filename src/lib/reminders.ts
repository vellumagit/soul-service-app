// Session reminders — scans for upcoming sessions and emails reminders to
// the client and/or the practitioner. Designed to be called from a Vercel
// Cron job once an hour.
//
// Idempotency: every session has two timestamp columns
// (`client_reminder_sent_at`, `practitioner_reminder_sent_at`). We only
// send if the column is null. Once sent, we stamp the timestamp so the next
// cron run skips it.
//
// Multi-tenancy: we iterate across all accounts, using each account's
// own reminder-hour settings + Resend config.
import "server-only";

import { and, asc, eq, gte, gt, isNull, lte, lt, sql } from "drizzle-orm";
import {
  db,
  sessions,
  clients,
  accounts,
  practitionerSettings,
} from "@/db";
import { groupSessions, groupAttendees, groups } from "@/db/schema";
import { resolveCircleMeetingUrl } from "./circle-fulfillment";
import { circleCancelUrl, circleBaseUrl } from "./circle-cancel-token";
import {
  resolveTimeZone,
  formatSessionLong,
  formatSessionShortDate,
  formatSessionShortTime,
  zonedClock,
} from "./timezone";

// Anchor "now" once per run so all queries see the same moment
type ReminderRunStats = {
  clientRemindersSent: number;
  practitionerRemindersSent: number;
  circleRemindersSent: number;
  staleHoldsCleared: number;
  errors: string[];
};

export async function processReminders(): Promise<ReminderRunStats> {
  const now = new Date();
  const stats: ReminderRunStats = {
    clientRemindersSent: 0,
    practitionerRemindersSent: 0,
    circleRemindersSent: 0,
    staleHoldsCleared: 0,
    errors: [],
  };

  // Release abandoned Stripe checkout holds: pending, unpaid attendee rows
  // with a checkout session id older than 60 min. Frees the seat back up.
  try {
    const cutoff = new Date(now.getTime() - 60 * 60 * 1000);
    const cleared = await db
      .update(groupAttendees)
      .set({ status: "cancelled", updatedAt: now })
      .where(
        and(
          eq(groupAttendees.status, "pending"),
          eq(groupAttendees.paid, false),
          sql`${groupAttendees.stripeCheckoutSessionId} IS NOT NULL`,
          lt(groupAttendees.createdAt, cutoff)
        )
      )
      .returning({ id: groupAttendees.id });
    stats.staleHoldsCleared = cleared.length;
  } catch (err) {
    console.error("[reminders] stale-hold cleanup failed:", err);
  }

  // Iterate per account so each tenant uses its own settings.
  const allAccounts = await db.select().from(accounts);

  for (const account of allAccounts) {
    try {
      const [settingsRow] = await db
        .select()
        .from(practitionerSettings)
        .where(eq(practitionerSettings.accountId, account.id))
        .limit(1);
      if (!settingsRow) continue;

      const clientHours = settingsRow.clientReminderHours;
      const practHours = settingsRow.practitionerReminderHours;

      // CLIENT REMINDERS
      if (clientHours > 0) {
        const sent = await sendDueClientReminders(
          account.id,
          settingsRow,
          clientHours,
          now
        );
        stats.clientRemindersSent += sent;
      }

      // PRACTITIONER REMINDERS — sent to her own email
      if (practHours > 0 && account.email) {
        const sent = await sendDuePractitionerReminders(
          account.id,
          account.email,
          settingsRow,
          practHours,
          now
        );
        stats.practitionerRemindersSent += sent;
      }

      // CIRCLE REMINDERS — fixed 24h + 1h before each group session, to
      // every confirmed attendee. Independent of the 1-on-1 windows above.
      stats.circleRemindersSent += await sendDueCircleReminders(
        account.id,
        settingsRow,
        now
      );

      // "Your Circle starts soon" — to HER, once per occurrence, on her own
      // practitioner lead time. Prefers her business/support address.
      const hostNotifyTo = settingsRow.businessEmail || account.email;
      if (practHours > 0 && hostNotifyTo) {
        stats.circleRemindersSent += await sendDueCircleHostReminders(
          account.id,
          settingsRow,
          hostNotifyTo,
          practHours,
          now
        );
      }

      // T-10 "walk in now" — the doorway prompt, room link as the only click.
      if (hostNotifyTo) {
        stats.circleRemindersSent += await sendDueCircleWalkInNudges(
          account.id,
          settingsRow,
          hostNotifyTo,
          now
        );
      }

      // Post-Circle "thank you + come again" to each attendee after it ends.
      stats.circleRemindersSent += await sendDuePostCircleEmails(
        account.id,
        settingsRow,
        now
      );

      // Day-2 "go deeper one-to-one" invitation — the Circle→session
      // conversion email. Morning-gated, capped, and skips existing clients.
      stats.circleRemindersSent += await sendDueCircleDeeperInvites(
        account.id,
        settingsRow,
        now
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      stats.errors.push(`account ${account.id}: ${msg}`);
      console.error(`[reminders] account ${account.id} failed:`, err);
    }
  }

  return stats;
}

/**
 * Send reminders for ONE session immediately, if it's booked inside a reminder
 * window. Called at booking time so a short-notice / same-day session still
 * gets a heads-up — the hourly cron alone would miss the window (or fire after
 * the session started). Idempotent: it stamps the same `*_reminder_sent_at`
 * columns the cron checks, so neither path double-sends. Best-effort.
 */
export async function sendImmediateSessionReminders(
  sessionId: string
): Promise<void> {
  const now = new Date();

  const [row] = await db
    .select({
      accountId: sessions.accountId,
      status: sessions.status,
      scheduledAt: sessions.scheduledAt,
      durationMinutes: sessions.durationMinutes,
      sessionType: sessions.type,
      meetUrl: sessions.meetUrl,
      intention: sessions.intention,
      sessionTimezone: sessions.timezone,
      clientReminderSentAt: sessions.clientReminderSentAt,
      practitionerReminderSentAt: sessions.practitionerReminderSentAt,
      clientName: clients.fullName,
      clientEmail: clients.email,
      clientTimezone: clients.timezone,
    })
    .from(sessions)
    .innerJoin(clients, eq(sessions.clientId, clients.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) return;
  if (row.status !== "scheduled") return;
  const scheduledMs = new Date(row.scheduledAt).getTime();
  if (scheduledMs <= now.getTime()) return; // already started / past

  const [settings] = await db
    .select()
    .from(practitionerSettings)
    .where(eq(practitionerSettings.accountId, row.accountId))
    .limit(1);
  if (!settings) return;
  const [account] = await db
    .select({ email: accounts.email })
    .from(accounts)
    .where(eq(accounts.id, row.accountId))
    .limit(1);

  const { sendEmail } = await import("./resend");

  // CLIENT — only if inside the window, not already sent, and has an email.
  const clientHours = settings.clientReminderHours;
  if (
    clientHours > 0 &&
    !row.clientReminderSentAt &&
    row.clientEmail &&
    scheduledMs <= now.getTime() + clientHours * 60 * 60 * 1000
  ) {
    try {
      const timeZone = resolveTimeZone(
        row.clientTimezone,
        row.sessionTimezone,
        settings.timezone
      );
      const { html, text, subject } = buildClientReminderEmail({
        clientName: row.clientName,
        sessionType: row.sessionType,
        scheduledAt: row.scheduledAt,
        durationMinutes: row.durationMinutes,
        meetUrl: row.meetUrl,
        practitionerName: settings.practitionerName ?? "your practitioner",
        timeZone,
      });
      await sendEmail({
        to: row.clientEmail,
        subject,
        html,
        text,
        replyTo: settings.businessEmail ?? undefined,
      });
      await db
        .update(sessions)
        .set({ clientReminderSentAt: now })
        .where(eq(sessions.id, sessionId));
    } catch (err) {
      console.error("[reminders] immediate client reminder failed:", err);
    }
  }

  // PRACTITIONER — her own heads-up.
  const practHours = settings.practitionerReminderHours;
  if (
    practHours > 0 &&
    !row.practitionerReminderSentAt &&
    account?.email &&
    scheduledMs <= now.getTime() + practHours * 60 * 60 * 1000
  ) {
    try {
      const timeZone = resolveTimeZone(row.sessionTimezone, settings.timezone);
      const { html, text, subject } = buildPractitionerReminderEmail({
        clientName: row.clientName,
        sessionType: row.sessionType,
        scheduledAt: row.scheduledAt,
        durationMinutes: row.durationMinutes,
        meetUrl: row.meetUrl,
        intention: row.intention,
        practitionerName: settings.practitionerName ?? "you",
        timeZone,
      });
      await sendEmail({ to: account.email, subject, html, text });
      await db
        .update(sessions)
        .set({ practitionerReminderSentAt: now })
        .where(eq(sessions.id, sessionId));
    } catch (err) {
      console.error("[reminders] immediate practitioner reminder failed:", err);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-audience senders
// ─────────────────────────────────────────────────────────────────────────────

async function sendDueClientReminders(
  accountId: string,
  settings: typeof practitionerSettings.$inferSelect,
  reminderHours: number,
  now: Date
): Promise<number> {
  // "Due window": session is starting within the next reminderHours, but isn't
  // already in the past, and we haven't sent a client reminder yet.
  const windowEnd = new Date(now.getTime() + reminderHours * 60 * 60 * 1000);

  const rows = await db
    .select({
      sessionId: sessions.id,
      clientId: sessions.clientId,
      clientName: clients.fullName,
      clientEmail: clients.email,
      clientTimezone: clients.timezone,
      scheduledAt: sessions.scheduledAt,
      durationMinutes: sessions.durationMinutes,
      sessionType: sessions.type,
      meetUrl: sessions.meetUrl,
      sessionTimezone: sessions.timezone,
    })
    .from(sessions)
    .innerJoin(clients, eq(sessions.clientId, clients.id))
    .where(
      and(
        eq(sessions.accountId, accountId),
        eq(sessions.status, "scheduled"),
        isNull(sessions.clientReminderSentAt),
        gte(sessions.scheduledAt, now),
        lte(sessions.scheduledAt, windowEnd)
      )
    );

  let count = 0;
  for (const row of rows) {
    if (!row.clientEmail) continue; // can't email someone without an address

    try {
      const { sendEmail } = await import("./resend");
      // Client email → the CLIENT's local time: their zone if known, else the
      // zone she booked in, else the practice zone.
      const timeZone = resolveTimeZone(
        row.clientTimezone,
        row.sessionTimezone,
        settings.timezone
      );
      const { html, text, subject } = buildClientReminderEmail({
        clientName: row.clientName,
        sessionType: row.sessionType,
        scheduledAt: row.scheduledAt,
        durationMinutes: row.durationMinutes,
        meetUrl: row.meetUrl,
        practitionerName: settings.practitionerName ?? "your practitioner",
        timeZone,
      });

      await sendEmail({
        to: row.clientEmail,
        subject,
        html,
        text,
        replyTo: settings.businessEmail ?? undefined,
      });

      await db
        .update(sessions)
        .set({ clientReminderSentAt: now })
        .where(eq(sessions.id, row.sessionId));

      count++;
    } catch (err) {
      console.error(
        `[reminders] failed to send client reminder for session ${row.sessionId}:`,
        err
      );
    }
  }

  return count;
}

async function sendDuePractitionerReminders(
  accountId: string,
  practitionerEmail: string,
  settings: typeof practitionerSettings.$inferSelect,
  reminderHours: number,
  now: Date
): Promise<number> {
  const windowEnd = new Date(now.getTime() + reminderHours * 60 * 60 * 1000);

  const rows = await db
    .select({
      sessionId: sessions.id,
      clientId: sessions.clientId,
      clientName: clients.fullName,
      scheduledAt: sessions.scheduledAt,
      durationMinutes: sessions.durationMinutes,
      sessionType: sessions.type,
      meetUrl: sessions.meetUrl,
      intention: sessions.intention,
      sessionTimezone: sessions.timezone,
    })
    .from(sessions)
    .innerJoin(clients, eq(sessions.clientId, clients.id))
    .where(
      and(
        eq(sessions.accountId, accountId),
        eq(sessions.status, "scheduled"),
        isNull(sessions.practitionerReminderSentAt),
        gte(sessions.scheduledAt, now),
        lte(sessions.scheduledAt, windowEnd)
      )
    );

  let count = 0;
  for (const row of rows) {
    try {
      const { sendEmail } = await import("./resend");
      // Her own reminder → the zone she booked in, else the practice zone.
      const timeZone = resolveTimeZone(
        row.sessionTimezone,
        settings.timezone
      );
      const { html, text, subject } = buildPractitionerReminderEmail({
        clientName: row.clientName,
        sessionType: row.sessionType,
        scheduledAt: row.scheduledAt,
        durationMinutes: row.durationMinutes,
        meetUrl: row.meetUrl,
        intention: row.intention,
        practitionerName: settings.practitionerName ?? "you",
        timeZone,
      });

      await sendEmail({ to: practitionerEmail, subject, html, text });

      await db
        .update(sessions)
        .set({ practitionerReminderSentAt: now })
        .where(eq(sessions.id, row.sessionId));

      count++;
    } catch (err) {
      console.error(
        `[reminders] failed to send practitioner reminder for session ${row.sessionId}:`,
        err
      );
    }
  }

  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Circle (group session) reminders — 24h + 1h before, to confirmed attendees
// ─────────────────────────────────────────────────────────────────────────────

async function sendDueCircleReminders(
  accountId: string,
  settings: typeof practitionerSettings.$inferSelect,
  now: Date
): Promise<number> {
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Two passes. The 24h pass deliberately excludes sessions <1h away so a
  // late sign-up doesn't get a "tomorrow" + "in an hour" email back-to-back.
  const passes: Array<{ lead: "24h" | "1h"; from: Date; to: Date }> = [
    { lead: "24h", from: in1h, to: in24h },
    { lead: "1h", from: now, to: in1h },
  ];

  let count = 0;
  for (const pass of passes) {
    const notYetSent =
      pass.lead === "24h"
        ? isNull(groupAttendees.reminder24hSentAt)
        : isNull(groupAttendees.reminder1hSentAt);
    const rows = await db
      .select({
        attendeeId: groupAttendees.id,
        name: groupAttendees.name,
        email: groupAttendees.email,
        scheduledAt: groupSessions.scheduledAt,
        sessionMeetUrl: groupSessions.meetUrl,
        groupName: groups.name,
      })
      .from(groupAttendees)
      .innerJoin(
        groupSessions,
        eq(groupSessions.id, groupAttendees.groupSessionId)
      )
      .innerJoin(groups, eq(groups.id, groupSessions.groupId))
      .where(
        and(
          eq(groupAttendees.accountId, accountId),
          eq(groupAttendees.status, "confirmed"),
          notYetSent,
          eq(groupSessions.status, "scheduled"),
          gt(groupSessions.scheduledAt, pass.from),
          lte(groupSessions.scheduledAt, pass.to)
        )
      );

    for (const row of rows) {
      if (!row.email || !row.email.includes("@")) continue;
      const meetingUrl = resolveCircleMeetingUrl(
        row.sessionMeetUrl,
        settings.circleRoomUrl ?? null
      );
      try {
        const { sendCircleReminderEmail } = await import("./resend");
        await sendCircleReminderEmail({
          to: row.email,
          attendeeName: row.name,
          circleName: row.groupName,
          whenLabel: formatSessionLong(
            new Date(row.scheduledAt),
            resolveTimeZone(settings.timezone)
          ),
          meetingUrl,
          practitionerName: settings.practitionerName ?? null,
          lead: pass.lead,
          cancelUrl: circleCancelUrl(row.attendeeId),
        });
        await db
          .update(groupAttendees)
          .set(
            pass.lead === "24h"
              ? { reminder24hSentAt: now }
              : { reminder1hSentAt: now }
          )
          .where(eq(groupAttendees.id, row.attendeeId));
        count++;
      } catch (err) {
        console.error(
          `[reminders] circle ${pass.lead} reminder failed for attendee ${row.attendeeId}:`,
          err
        );
      }
    }
  }

  return count;
}

/**
 * "Your Circle starts soon" — to the PRACTITIONER, once per occurrence, using
 * her own practitionerReminderHours lead time. Gives her the room link + who's
 * coming so she can start without opening the app. Stamped via
 * group_sessions.host_reminded_at so repeat cron runs can't double-send.
 */
async function sendDueCircleHostReminders(
  accountId: string,
  settings: typeof practitionerSettings.$inferSelect,
  notifyTo: string,
  leadHours: number,
  now: Date
): Promise<number> {
  const windowEnd = new Date(now.getTime() + leadHours * 60 * 60 * 1000);

  const rows = await db
    .select({
      sessionId: groupSessions.id,
      scheduledAt: groupSessions.scheduledAt,
      sessionMeetUrl: groupSessions.meetUrl,
      groupName: groups.name,
    })
    .from(groupSessions)
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .where(
      and(
        eq(groupSessions.accountId, accountId),
        eq(groupSessions.status, "scheduled"),
        isNull(groupSessions.hostRemindedAt),
        gt(groupSessions.scheduledAt, now),
        lte(groupSessions.scheduledAt, windowEnd)
      )
    );

  let count = 0;
  for (const row of rows) {
    try {
      // Who's coming (everyone not cancelled), for the roster in the email.
      const attendees = await db
        .select({
          name: groupAttendees.name,
          paid: groupAttendees.paid,
        })
        .from(groupAttendees)
        .where(
          and(
            eq(groupAttendees.groupSessionId, row.sessionId),
            sql`${groupAttendees.status} <> 'cancelled'`
          )
        )
        .orderBy(asc(groupAttendees.createdAt));

      const meetingUrl = resolveCircleMeetingUrl(
        row.sessionMeetUrl,
        settings.circleRoomUrl ?? null
      );

      const { sendCircleHostReminderEmail } = await import("./resend");
      await sendCircleHostReminderEmail({
        to: notifyTo,
        circleName: row.groupName,
        whenLabel: formatSessionLong(
          new Date(row.scheduledAt),
          resolveTimeZone(settings.timezone)
        ),
        meetingUrl,
        attendees: attendees.map((a) => ({ name: a.name, paid: a.paid })),
        practitionerName: settings.practitionerName ?? null,
      });

      await db
        .update(groupSessions)
        .set({ hostRemindedAt: now })
        .where(eq(groupSessions.id, row.sessionId));
      count++;
    } catch (err) {
      console.error(
        `[reminders] circle host reminder failed for session ${row.sessionId}:`,
        err
      );
    }
  }

  return count;
}

/**
 * Post-Circle "thank you + come again" email to each confirmed attendee, once,
 * after the Circle ends. Points them at the next open Circle (the retention
 * loop). Only fires for Circles that ended within the last 18h — so a missed
 * run still catches them, but historical attendees are never back-emailed on
 * first deploy. Claimed via post_circle_sent_at so it sends exactly once.
 */
async function sendDuePostCircleEmails(
  accountId: string,
  settings: typeof practitionerSettings.$inferSelect,
  now: Date
): Promise<number> {
  const endedSessions = await db
    .select({ sessionId: groupSessions.id, groupName: groups.name })
    .from(groupSessions)
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .where(
      and(
        eq(groupSessions.accountId, accountId),
        sql`${groupSessions.status} <> 'cancelled'`,
        sql`${groupSessions.scheduledAt} + (${groupSessions.durationMinutes} * interval '1 minute') < now()`,
        sql`${groupSessions.scheduledAt} + (${groupSessions.durationMinutes} * interval '1 minute') > now() - interval '18 hours'`
      )
    );
  if (endedSessions.length === 0) return 0;

  // The next open Circle to invite them back to (soonest upcoming, published).
  const [nextCircle] = await db
    .select({ id: groupSessions.id })
    .from(groupSessions)
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .where(
      and(
        eq(groupSessions.accountId, accountId),
        eq(groupSessions.status, "scheduled"),
        eq(groups.published, true),
        gt(groupSessions.scheduledAt, now)
      )
    )
    .orderBy(asc(groupSessions.scheduledAt))
    .limit(1);
  const nextCircleUrl = nextCircle
    ? `${circleBaseUrl()}/circles/${nextCircle.id}`
    : null;

  let count = 0;
  for (const s of endedSessions) {
    const attendees = await db
      .select({
        id: groupAttendees.id,
        name: groupAttendees.name,
        email: groupAttendees.email,
      })
      .from(groupAttendees)
      .where(
        and(
          eq(groupAttendees.groupSessionId, s.sessionId),
          eq(groupAttendees.status, "confirmed"),
          isNull(groupAttendees.postCircleSentAt)
        )
      );
    for (const a of attendees) {
      if (!a.email || !a.email.includes("@")) continue;
      // Claim atomically first so a crash mid-send can't double-email.
      const claimed = await db
        .update(groupAttendees)
        .set({ postCircleSentAt: now })
        .where(
          and(
            eq(groupAttendees.id, a.id),
            isNull(groupAttendees.postCircleSentAt)
          )
        )
        .returning({ id: groupAttendees.id });
      if (claimed.length === 0) continue;
      try {
        const { sendCirclePostEmail } = await import("./resend");
        await sendCirclePostEmail({
          to: a.email,
          attendeeName: a.name,
          circleName: s.groupName,
          nextCircleUrl,
          practitionerName: settings.practitionerName ?? null,
        });
        count++;
      } catch (err) {
        // Release the claim so a later run can retry.
        await db
          .update(groupAttendees)
          .set({ postCircleSentAt: null })
          .where(eq(groupAttendees.id, a.id));
        console.error(
          `[reminders] post-circle email failed for attendee ${a.id}:`,
          err
        );
      }
    }
  }
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// T-10 "walk in now" nudge to the practitioner
// ─────────────────────────────────────────────────────────────────────────────
//
// The 1h heads-up says a Circle is coming; this is the prompt at the moment of
// action, with the room link as the only thing to click. Requires a cron that
// runs more often than hourly (see vercel.json) — an hourly cron has no 4:50
// run for a 5:00 Circle.
//
// Window is (now, now+12min] rather than exactly 10: the cron ticks every 5
// minutes and can drift, so a hard 10-minute edge would be missable. The
// idempotency stamp means the slightly-wide window still sends exactly once.

async function sendDueCircleWalkInNudges(
  accountId: string,
  settings: typeof practitionerSettings.$inferSelect,
  notifyTo: string,
  now: Date
): Promise<number> {
  const windowEnd = new Date(now.getTime() + 12 * 60 * 1000);
  const rows = await db
    .select({
      id: groupSessions.id,
      scheduledAt: groupSessions.scheduledAt,
      meetUrl: groupSessions.meetUrl,
      groupName: groups.name,
      attendeeCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${groupAttendees}
        WHERE ${groupAttendees.groupSessionId} = ${groupSessions.id}
          AND ${groupAttendees.status} = 'confirmed'
      )`,
    })
    .from(groupSessions)
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .where(
      and(
        eq(groupSessions.accountId, accountId),
        eq(groupSessions.status, "scheduled"),
        isNull(groupSessions.walkInNudgeSentAt),
        gt(groupSessions.scheduledAt, now),
        lte(groupSessions.scheduledAt, windowEnd)
      )
    );

  let count = 0;
  for (const row of rows) {
    // Claim first — a 5-minute cron overlapping itself must not double-send.
    const claimed = await db
      .update(groupSessions)
      .set({ walkInNudgeSentAt: now })
      .where(
        and(
          eq(groupSessions.id, row.id),
          isNull(groupSessions.walkInNudgeSentAt)
        )
      )
      .returning({ id: groupSessions.id });
    if (claimed.length === 0) continue;
    try {
      const { sendCircleWalkInNudgeEmail } = await import("./resend");
      await sendCircleWalkInNudgeEmail({
        to: notifyTo,
        circleName: row.groupName,
        whenLabel: formatSessionLong(
          new Date(row.scheduledAt),
          resolveTimeZone(settings.timezone)
        ),
        meetingUrl: resolveCircleMeetingUrl(
          row.meetUrl,
          settings.circleRoomUrl ?? null
        ),
        attendeeCount: row.attendeeCount,
      });
      count++;
    } catch (err) {
      await db
        .update(groupSessions)
        .set({ walkInNudgeSentAt: null })
        .where(eq(groupSessions.id, row.id));
      console.error(
        `[reminders] walk-in nudge failed for circle ${row.id}:`,
        err
      );
    }
  }
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Day-2 "go deeper one-to-one" invitation — the Circle→session conversion email
// ─────────────────────────────────────────────────────────────────────────────
//
// Why this timing: the same-evening thank-you seals the experience (peak-end)
// and deliberately doesn't sell. Conversion happens when whatever surfaced in
// the Circle is STILL tugging a day or two later — so this lands on day-2
// morning (9–11am practice time, ~36h after an evening circle), naming that
// persistence as the reason to reach out. Primary CTA is a reply — a
// conversation, not a purchase.
//
// Guard rails:
//   - never sent to someone who already books 1-on-1 sessions (tone-deaf)
//   - capped at one per 30 days per email address, so a weekly regular gets
//     the thank-you weekly but this invitation only occasionally
//   - eligibility window 30h–5d after the Circle ends, so a cron outage
//     can't dump stale invites a week later

async function sendDueCircleDeeperInvites(
  accountId: string,
  settings: typeof practitionerSettings.$inferSelect,
  now: Date
): Promise<number> {
  // Morning gate, in HER practice timezone. The cron is hourly, so the first
  // run inside the window picks up everyone eligible.
  const tz = resolveTimeZone(settings.timezone);
  const { hour } = zonedClock(now, tz);
  if (hour < 9 || hour >= 11) return 0;

  const rows = await db
    .select({
      attendeeId: groupAttendees.id,
      name: groupAttendees.name,
      email: groupAttendees.email,
      groupName: groups.name,
    })
    .from(groupAttendees)
    .innerJoin(
      groupSessions,
      eq(groupSessions.id, groupAttendees.groupSessionId)
    )
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .where(
      and(
        eq(groupAttendees.accountId, accountId),
        eq(groupAttendees.status, "confirmed"),
        isNull(groupAttendees.deeperInviteSentAt),
        sql`${groupAttendees.email} LIKE '%@%'`,
        sql`${groupSessions.status} <> 'cancelled'`,
        // Ended 30h–5d ago: day-2 for an evening circle, bounded so a cron
        // outage can't send stale invites.
        sql`${groupSessions.scheduledAt} + (${groupSessions.durationMinutes} * interval '1 minute') < now() - interval '30 hours'`,
        sql`${groupSessions.scheduledAt} + (${groupSessions.durationMinutes} * interval '1 minute') > now() - interval '5 days'`,
        // Skip anyone who's already a 1-on-1 client — "consider a session"
        // to someone who books sessions reads as not knowing them.
        sql`NOT EXISTS (
          SELECT 1 FROM ${clients} c
          JOIN ${sessions} s ON s.client_id = c.id
          WHERE c.account_id = ${accountId}
            AND LOWER(c.email) = LOWER(${groupAttendees.email})
            AND s.status <> 'cancelled'
        )`,
        // Frequency cap: one invitation per address per 30 days, across all
        // their attendances.
        sql`NOT EXISTS (
          SELECT 1 FROM ${groupAttendees} ga2
          WHERE ga2.account_id = ${accountId}
            AND LOWER(ga2.email) = LOWER(${groupAttendees.email})
            AND ga2.deeper_invite_sent_at > now() - interval '30 days'
        )`
      )
    );
  if (rows.length === 0) return 0;

  // "Ways to work together" ladder on the storefront — the 1-on-1 options.
  const optionsUrl = `${circleBaseUrl()}/#ways`;

  let count = 0;
  // The 30-day cap is checked at SELECT time, so one address attending two
  // eligible circles would pass twice in the same batch — dedupe here.
  const seenThisBatch = new Set<string>();
  for (const row of rows) {
    if (!row.email) continue;
    const emailKey = row.email.trim().toLowerCase();
    if (seenThisBatch.has(emailKey)) continue;
    seenThisBatch.add(emailKey);
    // Claim atomically first so a crash mid-send can't double-email.
    const claimed = await db
      .update(groupAttendees)
      .set({ deeperInviteSentAt: now })
      .where(
        and(
          eq(groupAttendees.id, row.attendeeId),
          isNull(groupAttendees.deeperInviteSentAt)
        )
      )
      .returning({ id: groupAttendees.id });
    if (claimed.length === 0) continue;
    try {
      const { sendCircleDeeperInviteEmail } = await import("./resend");
      await sendCircleDeeperInviteEmail({
        to: row.email,
        attendeeName: row.name,
        circleName: row.groupName,
        optionsUrl,
        practitionerName: settings.practitionerName ?? null,
      });
      count++;
    } catch (err) {
      // Release the claim so a later run can retry.
      await db
        .update(groupAttendees)
        .set({ deeperInviteSentAt: null })
        .where(eq(groupAttendees.id, row.attendeeId));
      console.error(
        `[reminders] deeper-invite email failed for attendee ${row.attendeeId}:`,
        err
      );
    }
  }
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────────

type ClientReminderInput = {
  clientName: string;
  sessionType: string;
  scheduledAt: Date;
  durationMinutes: number;
  meetUrl: string | null;
  practitionerName: string;
  /** IANA zone to render times in — resolved for this recipient by the caller. */
  timeZone: string;
};

function buildClientReminderEmail(input: ClientReminderInput) {
  const firstName = input.clientName.split(" ")[0] ?? input.clientName;
  const when = formatSessionLong(input.scheduledAt, input.timeZone);
  const meetSection = input.meetUrl
    ? `\n\nJoin via Google Meet: ${input.meetUrl}\n`
    : "";

  const subject = `Reminder: our session on ${formatSessionShortDate(input.scheduledAt, input.timeZone)}`;
  const text = `Hi ${firstName},

A quick reminder of our ${input.sessionType.toLowerCase()} together:

· When: ${when}
· Length: ${input.durationMinutes} minutes${meetSection}
A quiet, private spot works best. If anything has come up between now and then that you'd like me to know, feel free to share before we meet.

See you soon,
${input.practitionerName}`;

  const html = wrapHtml(`
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>A quick reminder of our ${escapeHtml(input.sessionType.toLowerCase())} together:</p>
    <ul style="padding-left:18px;">
      <li><strong>When:</strong> ${escapeHtml(when)}</li>
      <li><strong>Length:</strong> ${input.durationMinutes} minutes</li>
      ${
        input.meetUrl
          ? `<li><strong>Join:</strong> <a href="${escapeHtml(input.meetUrl)}">Google Meet link</a></li>`
          : ""
      }
    </ul>
    <p>A quiet, private spot works best. If anything has come up between now and then that you'd like me to know, feel free to share before we meet.</p>
    <p>See you soon,<br>${escapeHtml(input.practitionerName)}</p>
  `);

  return { subject, text, html };
}

type PractitionerReminderInput = {
  clientName: string;
  sessionType: string;
  scheduledAt: Date;
  durationMinutes: number;
  meetUrl: string | null;
  intention: string | null;
  practitionerName: string;
  /** IANA zone to render times in — resolved by the caller. */
  timeZone: string;
};

function buildPractitionerReminderEmail(input: PractitionerReminderInput) {
  const when = formatSessionLong(input.scheduledAt, input.timeZone);

  const subject = `Up next: ${input.clientName} at ${formatSessionShortTime(input.scheduledAt, input.timeZone)}`;
  const text = `Hi ${input.practitionerName},

Your next session is coming up:

· Client: ${input.clientName}
· Type: ${input.sessionType}
· When: ${when}
· Length: ${input.durationMinutes} minutes${input.meetUrl ? `\n· Meet: ${input.meetUrl}` : ""}${input.intention ? `\n· They wanted: "${input.intention}"` : ""}

Take a breath. See you in there.`;

  const html = wrapHtml(`
    <p>Your next session is coming up:</p>
    <ul style="padding-left:18px;">
      <li><strong>Client:</strong> ${escapeHtml(input.clientName)}</li>
      <li><strong>Type:</strong> ${escapeHtml(input.sessionType)}</li>
      <li><strong>When:</strong> ${escapeHtml(when)}</li>
      <li><strong>Length:</strong> ${input.durationMinutes} minutes</li>
      ${
        input.meetUrl
          ? `<li><strong>Meet:</strong> <a href="${escapeHtml(input.meetUrl)}">${escapeHtml(input.meetUrl)}</a></li>`
          : ""
      }
      ${
        input.intention
          ? `<li><strong>They wanted:</strong> <em>"${escapeHtml(input.intention)}"</em></li>`
          : ""
      }
    </ul>
    <p style="color:#666;">Take a breath. See you in there.</p>
  `);

  return { subject, text, html };
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

function wrapHtml(inner: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;font-size:14px;line-height:1.55;max-width:560px;margin:24px auto;padding:0 16px;">${inner}</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
