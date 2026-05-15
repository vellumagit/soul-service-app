"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  clients,
  sessions,
  sessionSeries,
  attachments,
  goals,
  tasks,
  communications,
  emailTemplates,
  noteTemplates,
  practitionerSettings,
  importantPeople,
  themes,
  observations,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getSettings } from "@/db/queries";
import { requireSession } from "./session-cookies";

// ─────────────────────────────────────────────────────────────────────────────
// Form helpers
// ─────────────────────────────────────────────────────────────────────────────

function str(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function num(form: FormData, key: string): number | null {
  const v = str(form, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === "on" || v === "true" || v === "1";
}

// Locale validator — only accepts our three supported codes.
// Returns null for empty/blank (meaning "follow app language" for clients).
function locale(form: FormData, key: string): "en" | "ru" | "uk" | null {
  const v = str(form, key);
  if (v === "en" || v === "ru" || v === "uk") return v;
  return null;
}

function tagsFromString(input: string | null): string[] {
  if (!input) return [];
  return Array.from(
    new Set(
      input
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    )
  );
}

function required<T>(value: T | null, fieldName: string): T {
  if (value === null || value === undefined || value === "")
    throw new Error(`${fieldName} is required`);
  return value as T;
}

// Clamp reminder-hour settings to a sane range (0-168 = 0 hours to one week).
function clampHours(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(168, Math.floor(n)));
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTS
// ─────────────────────────────────────────────────────────────────────────────

export async function createClient(formData: FormData) {
  const { accountId } = await requireSession();
  const fullName = required(str(formData, "fullName"), "Full name");
  const firstSessionDateRaw = str(formData, "firstSessionDate");
  const firstSessionType =
    str(formData, "firstSessionType") ??
    str(formData, "primarySessionType") ??
    "Session";

  const [created] = await db
    .insert(clients)
    .values({
      accountId,
      fullName,
      pronouns: str(formData, "pronouns"),
      email: str(formData, "email"),
      phone: str(formData, "phone"),
      city: str(formData, "city"),
      timezone: str(formData, "timezone"),
      workingOn: str(formData, "workingOn"),
      aboutClient: str(formData, "aboutClient"),
      intakeNotes: str(formData, "intakeNotes"),
      privateNotes: str(formData, "privateNotes"),
      howTheyFoundMe: str(formData, "howTheyFoundMe"),
      preferredLanguage: locale(formData, "preferredLanguage"),
      primarySessionType: firstSessionType,
      tags: tagsFromString(str(formData, "tags")),
      sensitivities: tagsFromString(str(formData, "sensitivities")),
      emergencyName: str(formData, "emergencyName"),
      emergencyPhone: str(formData, "emergencyPhone"),
      status: "active",
    })
    .returning({ id: clients.id });

  // If a first session date was given, create the session + follow-up tasks.
  if (firstSessionDateRaw) {
    const firstSessionDate = new Date(firstSessionDateRaw + "T12:00:00");
    const isPast = firstSessionDate < new Date();
    await db.insert(sessions).values({
      accountId,
      clientId: created.id,
      type: firstSessionType,
      status: isPast ? "completed" : "scheduled",
      scheduledAt: firstSessionDate,
      durationMinutes: 60,
    });
    await scheduleFirstSessionFollowups(
      accountId,
      created.id,
      firstSessionDate,
      fullName
    );
  }

  revalidatePath("/clients");
  redirect(`/clients/${created.id}`);
}

// Hardcoded touchpoint cadence: 1 week, 1 month, 3 months after the FIRST session.
// Tasks dated in the past are skipped (kept clean for long-time clients being onboarded).
async function scheduleFirstSessionFollowups(
  accountId: string,
  clientId: string,
  firstSessionDate: Date,
  clientName: string
) {
  const FOLLOWUPS = [
    { days: 7, title: "1-week follow-up" },
    { days: 30, title: "1-month follow-up" },
    { days: 90, title: "3-month follow-up" },
  ];

  const now = new Date();
  const rows: typeof tasks.$inferInsert[] = [];

  for (const f of FOLLOWUPS) {
    const dueAt = new Date(firstSessionDate);
    dueAt.setDate(dueAt.getDate() + f.days);
    if (dueAt <= now) continue; // skip past follow-ups
    rows.push({
      accountId,
      title: `${f.title} with ${clientName}`,
      clientId,
      dueAt,
      source: "rule",
    });
  }

  if (rows.length > 0) await db.insert(tasks).values(rows);
}

export async function updateClient(formData: FormData) {
  const { accountId } = await requireSession();
  const id = required(str(formData, "id"), "Client id");

  await db
    .update(clients)
    .set({
      fullName: required(str(formData, "fullName"), "Full name"),
      pronouns: str(formData, "pronouns"),
      email: str(formData, "email"),
      phone: str(formData, "phone"),
      city: str(formData, "city"),
      timezone: str(formData, "timezone"),
      workingOn: str(formData, "workingOn"),
      aboutClient: str(formData, "aboutClient"),
      intakeNotes: str(formData, "intakeNotes"),
      privateNotes: str(formData, "privateNotes"),
      howTheyFoundMe: str(formData, "howTheyFoundMe"),
      preferredLanguage: locale(formData, "preferredLanguage"),
      primarySessionType: str(formData, "primarySessionType"),
      tags: tagsFromString(str(formData, "tags")),
      sensitivities: tagsFromString(str(formData, "sensitivities")),
      emergencyName: str(formData, "emergencyName"),
      emergencyPhone: str(formData, "emergencyPhone"),
      status:
        (str(formData, "status") as
          | "active"
          | "new"
          | "dormant"
          | "archived"
          | null) ?? "active",
      updatedAt: new Date(),
    })
    .where(and(eq(clients.accountId, accountId), eq(clients.id, id)));

  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
}

export async function deleteClient(clientId: string) {
  const { accountId } = await requireSession();
  await db
    .delete(clients)
    .where(and(eq(clients.accountId, accountId), eq(clients.id, clientId)));
  revalidatePath("/clients");
  redirect("/clients");
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function scheduleSession(formData: FormData) {
  const { accountId } = await requireSession();
  const clientId = required(str(formData, "clientId"), "Client");
  const type = str(formData, "type") ?? "Session";
  const scheduledAtRaw = required(str(formData, "scheduledAt"), "Date / time");
  const durationMinutes = num(formData, "durationMinutes") ?? 60;
  const manualMeetUrl = str(formData, "meetUrl");

  const [created] = await db
    .insert(sessions)
    .values({
      accountId,
      clientId,
      type,
      status: "scheduled",
      scheduledAt: new Date(scheduledAtRaw),
      durationMinutes,
      intention: str(formData, "intention"),
      meetUrl: manualMeetUrl, // fallback if Google isn't connected
    })
    .returning({ id: sessions.id });

  // Best-effort: push to Google Calendar (auto-generates Meet link + invites client)
  await syncSessionToGoogle(created.id);

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/");
}

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING SERIES
//
// Creates a series row + generates N session rows at the chosen cadence.
// Capped at 52 occurrences (one year of weekly) to avoid runaway inserts.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_OCCURRENCES = 52;

export type ScheduleSeriesResult =
  | { ok: true; seriesId: string; created: number }
  | { ok: false; error: string };

export async function scheduleSessionSeries(
  formData: FormData
): Promise<ScheduleSeriesResult> {
  try {
    const { accountId } = await requireSession();
    const clientId = required(str(formData, "clientId"), "Client");
    const type = str(formData, "type") ?? "Session";
    const firstAtRaw = required(str(formData, "firstAt"), "First session date/time");
    const durationMinutes = num(formData, "durationMinutes") ?? 60;
    const intention = str(formData, "intention");
    const frequencyRaw = str(formData, "frequency") ?? "weekly";
    if (
      frequencyRaw !== "weekly" &&
      frequencyRaw !== "biweekly" &&
      frequencyRaw !== "monthly"
    ) {
      return { ok: false, error: "Invalid frequency" };
    }
    const frequency = frequencyRaw;

    const countRaw = num(formData, "occurrenceCount") ?? 0;
    if (countRaw < 1 || countRaw > MAX_OCCURRENCES) {
      return {
        ok: false,
        error: `Number of sessions must be between 1 and ${MAX_OCCURRENCES}.`,
      };
    }
    const occurrenceCount = Math.floor(countRaw);

    const firstAt = new Date(firstAtRaw);
    if (Number.isNaN(firstAt.getTime())) {
      return { ok: false, error: "Couldn't parse the first session date/time." };
    }

    const dates = computeSeriesDates(firstAt, frequency, occurrenceCount);

    // Create the series row first so we can link sessions to it
    const [seriesRow] = await db
      .insert(sessionSeries)
      .values({
        accountId,
        clientId,
        type,
        frequency,
        durationMinutes,
        firstAt,
        occurrenceCount,
        intention,
      })
      .returning({ id: sessionSeries.id });

    // Bulk-insert all the sessions
    const now = new Date();
    const sessionRows = dates.map((scheduledAt, i) => ({
      accountId,
      clientId,
      type,
      // Past dates land as 'completed' (treats it like a back-fill).
      // Future dates are 'scheduled'. Saves a step for clients she's been
      // seeing weekly for a while.
      status: (scheduledAt < now ? "completed" : "scheduled") as
        | "completed"
        | "scheduled",
      scheduledAt,
      durationMinutes,
      intention,
      seriesId: seriesRow.id,
      occurrenceIndex: i + 1,
    }));

    await db.insert(sessions).values(sessionRows);

    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/calendar");
    revalidatePath("/");

    return { ok: true, seriesId: seriesRow.id, created: sessionRows.length };
  } catch (err) {
    console.error("[scheduleSessionSeries] failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't create the series.",
    };
  }
}

/**
 * Cancel a whole series — marks the series cancelled and deletes all FUTURE
 * scheduled sessions linked to it. Past + completed sessions stay (they're
 * history). Used by the "Cancel series" button.
 */
export async function cancelSessionSeries(
  seriesId: string,
  clientId: string
): Promise<void> {
  const { accountId } = await requireSession();
  const now = new Date();

  // Mark the series cancelled — scoped by account to prevent cross-account hits.
  await db
    .update(sessionSeries)
    .set({ cancelledAt: now, updatedAt: now })
    .where(
      and(
        eq(sessionSeries.accountId, accountId),
        eq(sessionSeries.id, seriesId)
      )
    );

  // Delete future scheduled sessions in the series.
  await db.execute(
    sql`DELETE FROM sessions
        WHERE account_id = ${accountId}
        AND series_id = ${seriesId}
        AND status = 'scheduled'
        AND scheduled_at > ${now.toISOString()}`
  );

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/");
}

/** Pure date math — compute the timestamps for a series. */
function computeSeriesDates(
  firstAt: Date,
  frequency: "weekly" | "biweekly" | "monthly",
  count: number
): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(firstAt);
    if (frequency === "weekly") {
      d.setDate(firstAt.getDate() + i * 7);
    } else if (frequency === "biweekly") {
      d.setDate(firstAt.getDate() + i * 14);
    } else {
      // monthly — same day-of-month each month. JS Date handles month overflow
      // (e.g. Jan 31 + 1 month = Mar 3 or similar). For practitioner scheduling
      // that's fine — she'd just adjust the rare overflow manually.
      d.setMonth(firstAt.getMonth() + i);
    }
    dates.push(d);
  }
  return dates;
}

export async function logPastSession(formData: FormData) {
  const { accountId } = await requireSession();
  const clientId = required(str(formData, "clientId"), "Client");
  const type = str(formData, "type") ?? "Session";
  const scheduledAtRaw = required(str(formData, "scheduledAt"), "Date / time");
  const durationMinutes = num(formData, "durationMinutes") ?? 60;
  const paid = bool(formData, "paid");
  const paymentAmount = num(formData, "paymentAmount");

  const [created] = await db
    .insert(sessions)
    .values({
      accountId,
      clientId,
      type,
      status: "completed",
      scheduledAt: new Date(scheduledAtRaw),
      durationMinutes,
      intention: str(formData, "intention"),
      arrivedAs: str(formData, "arrivedAs"),
      leftAs: str(formData, "leftAs"),
      notes: str(formData, "notes"),
      paid,
      paymentMethod: paid
        ? ((str(formData, "paymentMethod") as
            | "venmo"
            | "zelle"
            | "etransfer"
            | "cash"
            | "paypal"
            | "stripe"
            | "other"
            | null) ?? null)
        : null,
      paymentAmountCents:
        paid && paymentAmount !== null ? Math.round(paymentAmount * 100) : null,
      paidAt: paid ? new Date().toISOString().slice(0, 10) : null,
    })
    .returning();

  // Run auto-rules (creates follow-up task; auto-invoice if turned on)
  await runOnSessionCompleted(created.id, created.clientId);

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/payments");
  revalidatePath("/");
}

export async function updateSession(formData: FormData) {
  const { accountId } = await requireSession();
  const id = required(str(formData, "id"), "Session id");
  const clientId = required(str(formData, "clientId"), "Client id");

  // Read existing session to detect title/intention changes worth syncing
  const existingRows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, id)))
    .limit(1);
  const existing = existingRows[0];

  const newType = str(formData, "type");
  const newIntention = str(formData, "intention");

  const updates: Record<string, unknown> = {
    intention: newIntention,
    arrivedAs: str(formData, "arrivedAs"),
    leftAs: str(formData, "leftAs"),
    notes: str(formData, "notes"),
    type: newType ?? undefined,
    updatedAt: new Date(),
  };

  const isMarkComplete = str(formData, "markComplete") === "true";
  if (isMarkComplete) updates.status = "completed";

  await db
    .update(sessions)
    .set(updates)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, id)));

  // Push edited title/intention to Google (only if event exists and something
  // user-visible changed). Skip on completion — past events don't need sync.
  if (
    !isMarkComplete &&
    existing?.googleEventId &&
    (newType !== existing.type || newIntention !== existing.intention)
  ) {
    await syncSessionToGoogle(id);
  }

  if (isMarkComplete) {
    await runOnSessionCompleted(id, clientId);
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/");
}

// Reschedule = change scheduledAt (and optionally durationMinutes). Pushes to Google.
export async function rescheduleSession(formData: FormData) {
  const { accountId } = await requireSession();
  const id = required(str(formData, "id"), "Session id");
  const clientId = required(str(formData, "clientId"), "Client id");
  const scheduledAtRaw = required(
    str(formData, "scheduledAt"),
    "Date / time"
  );
  const durationMinutes = num(formData, "durationMinutes");

  const updates: Record<string, unknown> = {
    scheduledAt: new Date(scheduledAtRaw),
    updatedAt: new Date(),
    // Clear reminder bookkeeping so the moved session gets fresh reminders
    // for the new time.
    clientReminderSentAt: null,
    practitionerReminderSentAt: null,
  };
  if (durationMinutes !== null) updates.durationMinutes = durationMinutes;

  await db
    .update(sessions)
    .set(updates)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, id)));

  // Push to Google. If event exists, this updates it (sends "rescheduled"
  // notification to the client). If it doesn't exist yet, this creates one.
  await syncSessionToGoogle(id);

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function cancelSession(sessionId: string, clientId: string) {
  const { accountId } = await requireSession();
  // Look up before update to grab the Google event id
  const existingRows = await db
    .select({ googleEventId: sessions.googleEventId })
    .from(sessions)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)))
    .limit(1);

  await db
    .update(sessions)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)));

  // Pull from Google Calendar so the client gets a "cancelled" notification
  await deleteSessionFromGoogle(accountId, existingRows[0]?.googleEventId ?? null);
  if (existingRows[0]?.googleEventId) {
    await db
      .update(sessions)
      .set({ googleEventId: null })
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
      );
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function deleteSession(sessionId: string, clientId: string) {
  const { accountId } = await requireSession();
  const existingRows = await db
    .select({ googleEventId: sessions.googleEventId })
    .from(sessions)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)))
    .limit(1);

  await db
    .delete(sessions)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)));
  await deleteSessionFromGoogle(accountId, existingRows[0]?.googleEventId ?? null);

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/payments");
  revalidatePath("/");
}

export async function markSessionPaid(formData: FormData) {
  const { accountId } = await requireSession();
  const id = required(str(formData, "id"), "Session id");
  const clientId = required(str(formData, "clientId"), "Client id");
  const method = str(formData, "paymentMethod") ?? "other";
  const amount = num(formData, "paymentAmount");
  const note = str(formData, "paymentNote");

  await db
    .update(sessions)
    .set({
      paid: true,
      paymentMethod: method as
        | "venmo"
        | "zelle"
        | "etransfer"
        | "cash"
        | "paypal"
        | "stripe"
        | "other",
      paymentAmountCents: amount !== null ? Math.round(amount * 100) : null,
      paymentNote: note,
      paidAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date(),
    })
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, id)));

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/payments");
  revalidatePath("/");
}

export async function markSessionUnpaid(sessionId: string, clientId: string) {
  const { accountId } = await requireSession();
  await db
    .update(sessions)
    .set({
      paid: false,
      paymentMethod: null,
      paymentAmountCents: null,
      paymentNote: null,
      paidAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
    );
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/payments");
}

// ─────────────────────────────────────────────────────────────────────────────
// GOALS
// ─────────────────────────────────────────────────────────────────────────────

export async function addGoal(formData: FormData) {
  const { accountId } = await requireSession();
  const clientId = required(str(formData, "clientId"), "Client id");
  const label = required(str(formData, "label"), "Goal label");
  const progress = Math.max(0, Math.min(100, num(formData, "progress") ?? 0));
  const note = str(formData, "note");

  await db
    .insert(goals)
    .values({ accountId, clientId, label, progress, note });
  revalidatePath(`/clients/${clientId}`);
}

export async function updateGoalProgress(
  goalId: string,
  clientId: string,
  progress: number
) {
  const { accountId } = await requireSession();
  const clamped = Math.max(0, Math.min(100, progress));
  await db
    .update(goals)
    .set({ progress: clamped, updatedAt: new Date() })
    .where(and(eq(goals.accountId, accountId), eq(goals.id, goalId)));
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteGoal(goalId: string, clientId: string) {
  const { accountId } = await requireSession();
  await db
    .delete(goals)
    .where(and(eq(goals.accountId, accountId), eq(goals.id, goalId)));
  revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────────────────────────────────────────

export async function addTask(formData: FormData) {
  const { accountId } = await requireSession();
  const title = required(str(formData, "title"), "Task title");
  const clientId = str(formData, "clientId"); // optional
  const dueAtRaw = str(formData, "dueAt");
  const body = str(formData, "body");

  await db.insert(tasks).values({
    accountId,
    title,
    body,
    clientId,
    dueAt: dueAtRaw ? new Date(dueAtRaw) : null,
  });

  revalidatePath("/");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export async function toggleTaskComplete(
  taskId: string,
  clientId: string | null
) {
  const { accountId } = await requireSession();
  const [t] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.accountId, accountId), eq(tasks.id, taskId)))
    .limit(1);
  if (!t) return;
  await db
    .update(tasks)
    .set({
      completedAt: t.completedAt ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.accountId, accountId), eq(tasks.id, taskId)));
  revalidatePath("/");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export async function deleteTask(taskId: string, clientId: string | null) {
  const { accountId } = await requireSession();
  await db
    .delete(tasks)
    .where(and(eq(tasks.accountId, accountId), eq(tasks.id, taskId)));
  revalidatePath("/");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMUNICATIONS — log emails / calls / messages
// ─────────────────────────────────────────────────────────────────────────────

export async function logCommunication(formData: FormData) {
  const { accountId } = await requireSession();
  const clientId = required(str(formData, "clientId"), "Client id");
  const kind =
    (str(formData, "kind") as
      | "email_sent"
      | "email_received"
      | "call_logged"
      | "sms_sent"
      | "note"
      | null) ?? "note";
  const subject = str(formData, "subject");
  const body = str(formData, "body");
  const templateId = str(formData, "templateId");

  await db.insert(communications).values({
    accountId,
    clientId,
    kind,
    subject,
    body,
    templateId: templateId ?? null,
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteCommunication(
  commId: string,
  clientId: string
) {
  const { accountId } = await requireSession();
  await db
    .delete(communications)
    .where(
      and(
        eq(communications.accountId, accountId),
        eq(communications.id, commId)
      )
    );
  revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND EMAIL — actually send via Resend + log it on the client.
// Returns { ok: true } on success or { ok: false, message } on failure.
// EmailComposer falls back to mailto: if Resend isn't configured.
// ─────────────────────────────────────────────────────────────────────────────

export type SendEmailResult = { ok: true } | { ok: false; message: string };

export async function sendClientEmail(formData: FormData): Promise<SendEmailResult> {
  const { accountId } = await requireSession();
  const clientId = required(str(formData, "clientId"), "Client id");
  const to = required(str(formData, "to"), "Recipient");
  const subject = required(str(formData, "subject"), "Subject");
  const body = required(str(formData, "body"), "Body");
  const templateId = str(formData, "templateId");

  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      message: "Email sending isn't configured. Set RESEND_API_KEY to enable real send.",
    };
  }

  // Lazy-import so this action stays cheap when Resend isn't used.
  const { sendEmail } = await import("./resend");
  const settings = await getSettings(accountId);

  // Wrap plain-text body in a minimal HTML email so it renders cleanly.
  const html = bodyToHtml(body, settings?.businessName ?? null);

  try {
    await sendEmail({
      to,
      subject,
      html,
      text: body,
      replyTo: settings?.businessEmail ?? undefined,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Resend rejected the message.";
    return { ok: false, message };
  }

  // Log it on the client's profile.
  await db.insert(communications).values({
    accountId,
    clientId,
    kind: "email_sent",
    subject,
    body,
    templateId: templateId ?? null,
  });
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

function bodyToHtml(body: string, businessName: string | null): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px 0;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  const signature = businessName
    ? `<p style="margin:24px 0 0 0;color:#9a9a9a;font-size:11px;">Sent via ${businessName}</p>`
    : "";
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;font-size:14px;line-height:1.55;max-width:560px;margin:24px auto;padding:0 16px;">${paragraphs}${signature}</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FILES (deletion)
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteAttachment(
  attachmentId: string,
  clientId: string
) {
  const { accountId } = await requireSession();
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { del } = await import("@vercel/blob");
      const [row] = await db
        .select({ url: attachments.url })
        .from(attachments)
        .where(
          and(
            eq(attachments.accountId, accountId),
            eq(attachments.id, attachmentId)
          )
        )
        .limit(1);
      if (row?.url) await del(row.url);
    }
  } catch (e) {
    console.warn("Blob delete failed (continuing with DB delete):", e);
  }
  await db
    .delete(attachments)
    .where(
      and(
        eq(attachments.accountId, accountId),
        eq(attachments.id, attachmentId)
      )
    );
  revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

export async function updateSettings(formData: FormData) {
  const { accountId } = await requireSession();
  const settings = await getSettings(accountId);

  const defaultRate = num(formData, "defaultRate");

  // Validate uiLanguage against our known locale list — accept "en"/"ru"/"uk",
  // fall back to existing value (or "en") on anything else.
  const submittedLang = str(formData, "uiLanguage");
  const uiLanguage =
    submittedLang === "en" ||
    submittedLang === "ru" ||
    submittedLang === "uk"
      ? submittedLang
      : settings.uiLanguage ?? "en";

  await db
    .update(practitionerSettings)
    .set({
      practitionerName: str(formData, "practitionerName"),
      businessName: str(formData, "businessName"),
      businessEmail: str(formData, "businessEmail"),
      businessPhone: str(formData, "businessPhone"),
      businessAddress: str(formData, "businessAddress"),
      websiteUrl: str(formData, "websiteUrl"),
      uiLanguage,
      defaultRateCents:
        defaultRate !== null ? Math.round(defaultRate * 100) : 13500,
      defaultCurrency: str(formData, "defaultCurrency") ?? "USD",
      paymentInstructions: str(formData, "paymentInstructions"),
      invoiceFooter: str(formData, "invoiceFooter"),
      invoicePrefix: str(formData, "invoicePrefix") ?? "INV",
      autoInvoiceOnComplete: bool(formData, "autoInvoiceOnComplete"),
      autoUploadAiNotes: bool(formData, "autoUploadAiNotes"),
      clientReminderHours: clampHours(
        num(formData, "clientReminderHours") ?? 24
      ),
      practitionerReminderHours: clampHours(
        num(formData, "practitionerReminderHours") ?? 1
      ),
      updatedAt: new Date(),
    })
    .where(eq(practitionerSettings.accountId, accountId));

  revalidatePath("/settings");
  revalidatePath("/");
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL TEMPLATES (CRUD)
// ─────────────────────────────────────────────────────────────────────────────

export async function createEmailTemplate(formData: FormData) {
  const { accountId } = await requireSession();
  await db.insert(emailTemplates).values({
    accountId,
    name: required(str(formData, "name"), "Name"),
    subject: required(str(formData, "subject"), "Subject"),
    body: required(str(formData, "body"), "Body"),
    language: locale(formData, "language") ?? "en",
  });
  revalidatePath("/settings");
}

export async function updateEmailTemplate(formData: FormData) {
  const { accountId } = await requireSession();
  const id = required(str(formData, "id"), "id");
  await db
    .update(emailTemplates)
    .set({
      name: required(str(formData, "name"), "Name"),
      subject: required(str(formData, "subject"), "Subject"),
      body: required(str(formData, "body"), "Body"),
      language: locale(formData, "language") ?? "en",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailTemplates.accountId, accountId),
        eq(emailTemplates.id, id)
      )
    );
  revalidatePath("/settings");
}

export async function deleteEmailTemplate(id: string) {
  const { accountId } = await requireSession();
  await db
    .delete(emailTemplates)
    .where(
      and(
        eq(emailTemplates.accountId, accountId),
        eq(emailTemplates.id, id)
      )
    );
  revalidatePath("/settings");
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTE TEMPLATES (CRUD)
// ─────────────────────────────────────────────────────────────────────────────

export async function createNoteTemplate(formData: FormData) {
  const { accountId } = await requireSession();
  await db.insert(noteTemplates).values({
    accountId,
    name: required(str(formData, "name"), "Name"),
    body: required(str(formData, "body"), "Body"),
  });
  revalidatePath("/settings");
}

export async function updateNoteTemplate(formData: FormData) {
  const { accountId } = await requireSession();
  const id = required(str(formData, "id"), "id");
  await db
    .update(noteTemplates)
    .set({
      name: required(str(formData, "name"), "Name"),
      body: required(str(formData, "body"), "Body"),
      updatedAt: new Date(),
    })
    .where(
      and(eq(noteTemplates.accountId, accountId), eq(noteTemplates.id, id))
    );
  revalidatePath("/settings");
}

export async function deleteNoteTemplate(id: string) {
  const { accountId } = await requireSession();
  await db
    .delete(noteTemplates)
    .where(
      and(eq(noteTemplates.accountId, accountId), eq(noteTemplates.id, id))
    );
  revalidatePath("/settings");
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-RULES — runs when a session is marked complete
// ─────────────────────────────────────────────────────────────────────────────

async function runOnSessionCompleted(sessionId: string, _clientId: string) {
  // requireSession is already called by the parent action (logPastSession /
  // updateSession), so calling it again here uses the React `cache()` and
  // doesn't re-decrypt the JWT.
  const { accountId } = await requireSession();
  const settings = await getSettings(accountId);

  if (settings.autoInvoiceOnComplete) {
    try {
      const { generateInvoiceForSession } = await import("./invoices");
      await generateInvoiceForSession(sessionId);
    } catch (e) {
      console.warn("Auto-invoice generation failed:", e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT PEOPLE
// ─────────────────────────────────────────────────────────────────────────────

export async function addImportantPerson(formData: FormData) {
  const { accountId } = await requireSession();
  const clientId = required(str(formData, "clientId"), "Client id");
  const name = required(str(formData, "name"), "Name");
  const relationship = required(str(formData, "relationship"), "Relationship");
  const notes = str(formData, "notes");
  const isAlive = !bool(formData, "deceased");

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(importantPeople)
    .where(
      and(
        eq(importantPeople.accountId, accountId),
        eq(importantPeople.clientId, clientId)
      )
    );

  await db.insert(importantPeople).values({
    accountId,
    clientId,
    name,
    relationship,
    notes,
    isAlive,
    position: count,
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function updateImportantPerson(formData: FormData) {
  const { accountId } = await requireSession();
  const id = required(str(formData, "id"), "id");
  const clientId = required(str(formData, "clientId"), "Client id");

  await db
    .update(importantPeople)
    .set({
      name: required(str(formData, "name"), "Name"),
      relationship: required(str(formData, "relationship"), "Relationship"),
      notes: str(formData, "notes"),
      isAlive: !bool(formData, "deceased"),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(importantPeople.accountId, accountId),
        eq(importantPeople.id, id)
      )
    );
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteImportantPerson(
  personId: string,
  clientId: string
) {
  const { accountId } = await requireSession();
  await db
    .delete(importantPeople)
    .where(
      and(
        eq(importantPeople.accountId, accountId),
        eq(importantPeople.id, personId)
      )
    );
  revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// THEMES
// ─────────────────────────────────────────────────────────────────────────────

export async function addTheme(formData: FormData) {
  const { accountId } = await requireSession();
  const clientId = required(str(formData, "clientId"), "Client id");
  const label = required(str(formData, "label"), "Theme");
  await db.insert(themes).values({ accountId, clientId, label });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteTheme(themeId: string, clientId: string) {
  const { accountId } = await requireSession();
  await db
    .delete(themes)
    .where(and(eq(themes.accountId, accountId), eq(themes.id, themeId)));
  revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// OBSERVATIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function addObservation(formData: FormData) {
  const { accountId } = await requireSession();
  const clientId = required(str(formData, "clientId"), "Client id");
  const body = required(str(formData, "body"), "Observation");
  await db.insert(observations).values({ accountId, clientId, body });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteObservation(observationId: string, clientId: string) {
  const { accountId } = await requireSession();
  await db
    .delete(observations)
    .where(
      and(
        eq(observations.accountId, accountId),
        eq(observations.id, observationId)
      )
    );
  revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE CALENDAR — connect / disconnect
// ─────────────────────────────────────────────────────────────────────────────

export async function startGoogleConnect() {
  const { getGoogleAuthUrl } = await import("./google-calendar");
  const url = getGoogleAuthUrl();
  redirect(url);
}

export async function disconnectGoogleAction() {
  const { accountId } = await requireSession();
  const { disconnectGoogle } = await import("./google-calendar");
  await disconnectGoogle(accountId);
  revalidatePath("/settings");
}

// Internal helper — best-effort Google Calendar push for a session.
// Never throws; any Google failure is logged + returned as an error string.
// Currently disabled in UI ("coming soon") but the code still runs if creds
// happen to be configured — it's a no-op when they aren't.
async function syncSessionToGoogle(
  sessionId: string
): Promise<{ ok: true; meetUrl?: string | null } | { ok: false; error: string }> {
  try {
    const sessionRows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    const session = sessionRows[0];
    if (!session) return { ok: false, error: "Session not found" };

    const clientRows = await db
      .select()
      .from(clients)
      .where(eq(clients.id, session.clientId))
      .limit(1);
    const client = clientRows[0];
    if (!client) return { ok: false, error: "Client not found" };

    const settingsRows = await db
      .select()
      .from(practitionerSettings)
      .where(eq(practitionerSettings.accountId, session.accountId))
      .limit(1);
    const settings = settingsRows[0];

    const eventInput = {
      summary: `${session.type} · ${client.fullName}`,
      description: [
        session.intention ? `Intention: "${session.intention}"` : null,
        client.workingOn ? `Working on: ${client.workingOn}` : null,
        "—",
        "Created by Soul Service",
      ]
        .filter(Boolean)
        .join("\n"),
      startAt: session.scheduledAt,
      durationMinutes: session.durationMinutes,
      attendeeEmail: client.email,
      practitionerEmail: settings?.googleCalendarEmail ?? null,
    };

    const {
      createCalendarEvent,
      updateCalendarEvent,
    } = await import("./google-calendar");

    let result;
    if (session.googleEventId) {
      result = await updateCalendarEvent(
        session.accountId,
        session.googleEventId,
        eventInput
      );
      // If event was deleted on Google's side (returns null), recreate it
      if (!result) result = await createCalendarEvent(session.accountId, eventInput);
    } else {
      result = await createCalendarEvent(session.accountId, eventInput);
    }

    if (!result) return { ok: true }; // Not connected — silent no-op

    await db
      .update(sessions)
      .set({
        googleEventId: result.eventId,
        meetUrl: result.meetUrl ?? session.meetUrl,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    return { ok: true, meetUrl: result.meetUrl };
  } catch (err) {
    console.warn("Google Calendar sync failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Sync failed",
    };
  }
}

async function deleteSessionFromGoogle(
  accountId: string,
  googleEventId: string | null
) {
  if (!googleEventId) return;
  try {
    const { deleteCalendarEvent } = await import("./google-calendar");
    await deleteCalendarEvent(accountId, googleEventId);
  } catch (err) {
    console.warn("Google Calendar delete failed:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI SESSION NOTES — transcript → structured markdown
// ─────────────────────────────────────────────────────────────────────────────

export type GenerateNotesActionResult = {
  ok: true;
  notes: string;
  cacheReadTokens: number;
  cacheCreationTokens: number;
} | { ok: false; error: string };

export async function generateNotesForSession(
  formData: FormData
): Promise<GenerateNotesActionResult> {
  const { accountId } = await requireSession();
  const sessionId = required(str(formData, "sessionId"), "Session id");
  const transcript = required(str(formData, "transcript"), "Transcript");
  const templateId = str(formData, "templateId");
  const replaceExisting = bool(formData, "replaceExisting");

  // Look up the session — must belong to the current account.
  const sessionRows = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
    )
    .limit(1);
  const session = sessionRows[0];
  if (!session) return { ok: false, error: "Session not found" };

  const clientRows = await db
    .select()
    .from(clients)
    .where(
      and(eq(clients.accountId, accountId), eq(clients.id, session.clientId))
    )
    .limit(1);
  const client = clientRows[0];
  if (!client) return { ok: false, error: "Client not found" };

  let templateName: string | null = null;
  let templateBody: string | null = null;
  if (templateId) {
    const tplRows = await db
      .select()
      .from(noteTemplates)
      .where(
        and(
          eq(noteTemplates.accountId, accountId),
          eq(noteTemplates.id, templateId)
        )
      )
      .limit(1);
    if (tplRows[0]) {
      templateName = tplRows[0].name;
      templateBody = tplRows[0].body;
    }
  }

  let result;
  try {
    const { generateNotesFromTranscript } = await import("./ai-notes");
    result = await generateNotesFromTranscript({
      transcript,
      templateName,
      templateBody,
      clientFirstName: client.fullName.split(" ")[0] ?? client.fullName,
      clientWorkingOn: client.workingOn,
      sessionType: session.type,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "AI call failed",
    };
  }

  const existingNotes = session.notes?.trim() ?? "";
  const finalNotes =
    replaceExisting || existingNotes.length === 0
      ? result.notes
      : existingNotes + "\n\n---\n\n" + result.notes;

  await db
    .update(sessions)
    .set({ notes: finalNotes, updatedAt: new Date() })
    .where(
      and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId))
    );

  revalidatePath(`/clients/${session.clientId}`);

  return {
    ok: true,
    notes: finalNotes,
    cacheReadTokens: result.cacheReadTokens,
    cacheCreationTokens: result.cacheCreationTokens,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL INVOICE GENERATION
// ─────────────────────────────────────────────────────────────────────────────

export async function generateInvoice(sessionId: string, clientId: string) {
  // requireSession isn't strictly needed here (the invoices helper looks up
  // the session itself), but call it so unauthenticated requests still bounce.
  await requireSession();
  const { generateInvoiceForSession } = await import("./invoices");
  await generateInvoiceForSession(sessionId);
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/payments");
}
