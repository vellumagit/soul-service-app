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

import { and, eq, gte, isNull, lte } from "drizzle-orm";
import {
  db,
  sessions,
  clients,
  accounts,
  practitionerSettings,
} from "@/db";

// Anchor "now" once per run so all queries see the same moment
type ReminderRunStats = {
  clientRemindersSent: number;
  practitionerRemindersSent: number;
  errors: string[];
};

export async function processReminders(): Promise<ReminderRunStats> {
  const now = new Date();
  const stats: ReminderRunStats = {
    clientRemindersSent: 0,
    practitionerRemindersSent: 0,
    errors: [],
  };

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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      stats.errors.push(`account ${account.id}: ${msg}`);
      console.error(`[reminders] account ${account.id} failed:`, err);
    }
  }

  return stats;
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
      scheduledAt: sessions.scheduledAt,
      durationMinutes: sessions.durationMinutes,
      sessionType: sessions.type,
      meetUrl: sessions.meetUrl,
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
      const { html, text, subject } = buildClientReminderEmail({
        clientName: row.clientName,
        sessionType: row.sessionType,
        scheduledAt: row.scheduledAt,
        durationMinutes: row.durationMinutes,
        meetUrl: row.meetUrl,
        practitionerName: settings.practitionerName ?? "your practitioner",
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
      const { html, text, subject } = buildPractitionerReminderEmail({
        clientName: row.clientName,
        sessionType: row.sessionType,
        scheduledAt: row.scheduledAt,
        durationMinutes: row.durationMinutes,
        meetUrl: row.meetUrl,
        intention: row.intention,
        practitionerName: settings.practitionerName ?? "you",
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
// Templates
// ─────────────────────────────────────────────────────────────────────────────

type ClientReminderInput = {
  clientName: string;
  sessionType: string;
  scheduledAt: Date;
  durationMinutes: number;
  meetUrl: string | null;
  practitionerName: string;
};

function buildClientReminderEmail(input: ClientReminderInput) {
  const firstName = input.clientName.split(" ")[0] ?? input.clientName;
  const when = formatLongDateTime(input.scheduledAt);
  const meetSection = input.meetUrl
    ? `\n\nJoin via Google Meet: ${input.meetUrl}\n`
    : "";

  const subject = `Reminder: our session on ${formatShortDate(input.scheduledAt)}`;
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
};

function buildPractitionerReminderEmail(input: PractitionerReminderInput) {
  const when = formatLongDateTime(input.scheduledAt);

  const subject = `Up next: ${input.clientName} at ${formatShortTime(input.scheduledAt)}`;
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

function formatLongDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatShortTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

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
