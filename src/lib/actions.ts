"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  clients,
  sessions,
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
import { eq, sql } from "drizzle-orm";
import { getSettings } from "@/db/queries";

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

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTS
// ─────────────────────────────────────────────────────────────────────────────

export async function createClient(formData: FormData) {
  const fullName = required(str(formData, "fullName"), "Full name");
  const firstSessionDateRaw = str(formData, "firstSessionDate");
  const firstSessionType =
    str(formData, "firstSessionType") ??
    str(formData, "primarySessionType") ??
    "Soul reading";

  const [created] = await db
    .insert(clients)
    .values({
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
      clientId: created.id,
      type: firstSessionType,
      status: isPast ? "completed" : "scheduled",
      scheduledAt: firstSessionDate,
      durationMinutes: 60,
    });
    await scheduleFirstSessionFollowups(created.id, firstSessionDate, fullName);
  }

  revalidatePath("/clients");
  redirect(`/clients/${created.id}`);
}

// Hardcoded touchpoint cadence: 1 week, 1 month, 3 months after the FIRST session.
// Tasks dated in the past are skipped (kept clean for long-time clients being onboarded).
async function scheduleFirstSessionFollowups(
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
      title: `${f.title} with ${clientName}`,
      clientId,
      dueAt,
      source: "rule",
    });
  }

  if (rows.length > 0) await db.insert(tasks).values(rows);
}

export async function updateClient(formData: FormData) {
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
    .where(eq(clients.id, id));

  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
}

export async function deleteClient(clientId: string) {
  await db.delete(clients).where(eq(clients.id, clientId));
  revalidatePath("/clients");
  redirect("/clients");
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function scheduleSession(formData: FormData) {
  const clientId = required(str(formData, "clientId"), "Client");
  const type = str(formData, "type") ?? "Soul reading";
  const scheduledAtRaw = required(str(formData, "scheduledAt"), "Date / time");
  const durationMinutes = num(formData, "durationMinutes") ?? 60;
  const manualMeetUrl = str(formData, "meetUrl");

  const [created] = await db
    .insert(sessions)
    .values({
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

export async function logPastSession(formData: FormData) {
  const clientId = required(str(formData, "clientId"), "Client");
  const type = str(formData, "type") ?? "Soul reading";
  const scheduledAtRaw = required(str(formData, "scheduledAt"), "Date / time");
  const durationMinutes = num(formData, "durationMinutes") ?? 60;
  const paid = bool(formData, "paid");
  const paymentAmount = num(formData, "paymentAmount");

  const [created] = await db
    .insert(sessions)
    .values({
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
  const id = required(str(formData, "id"), "Session id");
  const clientId = required(str(formData, "clientId"), "Client id");

  // Read existing session to detect title/intention changes worth syncing
  const existingRows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
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

  await db.update(sessions).set(updates).where(eq(sessions.id, id));

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
  };
  if (durationMinutes !== null) updates.durationMinutes = durationMinutes;

  await db.update(sessions).set(updates).where(eq(sessions.id, id));

  // Push to Google. If event exists, this updates it (sends "rescheduled"
  // notification to the client). If it doesn't exist yet, this creates one.
  await syncSessionToGoogle(id);

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function cancelSession(sessionId: string, clientId: string) {
  // Look up before update to grab the Google event id
  const existingRows = await db
    .select({ googleEventId: sessions.googleEventId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  await db
    .update(sessions)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(sessions.id, sessionId));

  // Pull from Google Calendar so the client gets a "cancelled" notification
  await deleteSessionFromGoogle(existingRows[0]?.googleEventId ?? null);
  // Clear our reference so a re-schedule doesn't try to update a deleted event
  if (existingRows[0]?.googleEventId) {
    await db
      .update(sessions)
      .set({ googleEventId: null })
      .where(eq(sessions.id, sessionId));
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function deleteSession(sessionId: string, clientId: string) {
  const existingRows = await db
    .select({ googleEventId: sessions.googleEventId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  await db.delete(sessions).where(eq(sessions.id, sessionId));
  await deleteSessionFromGoogle(existingRows[0]?.googleEventId ?? null);

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/payments");
  revalidatePath("/");
}

export async function markSessionPaid(formData: FormData) {
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
    .where(eq(sessions.id, id));

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/payments");
  revalidatePath("/");
}

export async function markSessionUnpaid(sessionId: string, clientId: string) {
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
    .where(eq(sessions.id, sessionId));
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/payments");
}

// ─────────────────────────────────────────────────────────────────────────────
// GOALS
// ─────────────────────────────────────────────────────────────────────────────

export async function addGoal(formData: FormData) {
  const clientId = required(str(formData, "clientId"), "Client id");
  const label = required(str(formData, "label"), "Goal label");
  const progress = Math.max(0, Math.min(100, num(formData, "progress") ?? 0));
  const note = str(formData, "note");

  await db.insert(goals).values({ clientId, label, progress, note });
  revalidatePath(`/clients/${clientId}`);
}

export async function updateGoalProgress(
  goalId: string,
  clientId: string,
  progress: number
) {
  const clamped = Math.max(0, Math.min(100, progress));
  await db
    .update(goals)
    .set({ progress: clamped, updatedAt: new Date() })
    .where(eq(goals.id, goalId));
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteGoal(goalId: string, clientId: string) {
  await db.delete(goals).where(eq(goals.id, goalId));
  revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────────────────────────────────────────

export async function addTask(formData: FormData) {
  const title = required(str(formData, "title"), "Task title");
  const clientId = str(formData, "clientId"); // optional
  const dueAtRaw = str(formData, "dueAt");
  const body = str(formData, "body");

  await db.insert(tasks).values({
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
  // Read the current state, flip it
  const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!t) return;
  await db
    .update(tasks)
    .set({
      completedAt: t.completedAt ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));
  revalidatePath("/");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export async function deleteTask(taskId: string, clientId: string | null) {
  await db.delete(tasks).where(eq(tasks.id, taskId));
  revalidatePath("/");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMUNICATIONS — log emails / calls / messages
// ─────────────────────────────────────────────────────────────────────────────

export async function logCommunication(formData: FormData) {
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
  await db.delete(communications).where(eq(communications.id, commId));
  revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND EMAIL — actually send via Resend + log it on the client.
// Returns { ok: true } on success or { ok: false, message } on failure.
// EmailComposer falls back to mailto: if Resend isn't configured.
// ─────────────────────────────────────────────────────────────────────────────

export type SendEmailResult = { ok: true } | { ok: false; message: string };

export async function sendClientEmail(formData: FormData): Promise<SendEmailResult> {
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
  const settings = await getSettings();

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
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { del } = await import("@vercel/blob");
      const [row] = await db
        .select({ url: attachments.url })
        .from(attachments)
        .where(eq(attachments.id, attachmentId))
        .limit(1);
      if (row?.url) await del(row.url);
    }
  } catch (e) {
    console.warn("Blob delete failed (continuing with DB delete):", e);
  }
  await db.delete(attachments).where(eq(attachments.id, attachmentId));
  revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

export async function updateSettings(formData: FormData) {
  const settings = await getSettings();

  const defaultRate = num(formData, "defaultRate");

  await db
    .update(practitionerSettings)
    .set({
      practitionerName: str(formData, "practitionerName"),
      businessName: str(formData, "businessName"),
      businessEmail: str(formData, "businessEmail"),
      businessPhone: str(formData, "businessPhone"),
      businessAddress: str(formData, "businessAddress"),
      websiteUrl: str(formData, "websiteUrl"),
      defaultRateCents:
        defaultRate !== null ? Math.round(defaultRate * 100) : 13500,
      defaultCurrency: str(formData, "defaultCurrency") ?? "USD",
      paymentInstructions: str(formData, "paymentInstructions"),
      invoiceFooter: str(formData, "invoiceFooter"),
      invoicePrefix: str(formData, "invoicePrefix") ?? "INV",
      autoInvoiceOnComplete: bool(formData, "autoInvoiceOnComplete"),
      birthdayReminderDays: num(formData, "birthdayReminderDays"),
      updatedAt: new Date(),
    })
    .where(eq(practitionerSettings.id, settings.id));

  revalidatePath("/settings");
  revalidatePath("/");
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL TEMPLATES (CRUD)
// ─────────────────────────────────────────────────────────────────────────────

export async function createEmailTemplate(formData: FormData) {
  await db.insert(emailTemplates).values({
    name: required(str(formData, "name"), "Name"),
    subject: required(str(formData, "subject"), "Subject"),
    body: required(str(formData, "body"), "Body"),
  });
  revalidatePath("/settings");
}

export async function updateEmailTemplate(formData: FormData) {
  const id = required(str(formData, "id"), "id");
  await db
    .update(emailTemplates)
    .set({
      name: required(str(formData, "name"), "Name"),
      subject: required(str(formData, "subject"), "Subject"),
      body: required(str(formData, "body"), "Body"),
      updatedAt: new Date(),
    })
    .where(eq(emailTemplates.id, id));
  revalidatePath("/settings");
}

export async function deleteEmailTemplate(id: string) {
  await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
  revalidatePath("/settings");
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTE TEMPLATES (CRUD)
// ─────────────────────────────────────────────────────────────────────────────

export async function createNoteTemplate(formData: FormData) {
  await db.insert(noteTemplates).values({
    name: required(str(formData, "name"), "Name"),
    body: required(str(formData, "body"), "Body"),
  });
  revalidatePath("/settings");
}

export async function updateNoteTemplate(formData: FormData) {
  const id = required(str(formData, "id"), "id");
  await db
    .update(noteTemplates)
    .set({
      name: required(str(formData, "name"), "Name"),
      body: required(str(formData, "body"), "Body"),
      updatedAt: new Date(),
    })
    .where(eq(noteTemplates.id, id));
  revalidatePath("/settings");
}

export async function deleteNoteTemplate(id: string) {
  await db.delete(noteTemplates).where(eq(noteTemplates.id, id));
  revalidatePath("/settings");
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-RULES — runs when a session is marked complete
// ─────────────────────────────────────────────────────────────────────────────

async function runOnSessionCompleted(sessionId: string, _clientId: string) {
  const settings = await getSettings();

  // Auto-invoice when a session is marked complete (toggleable in Settings).
  // The 1wk/1mo/3mo follow-up cadence is hardcoded and triggers when a client
  // is added (based on their first-session date) — not per-session — so it lives
  // in createClient, not here.
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
// IMPORTANT PEOPLE — secondary characters in a client's life
// ─────────────────────────────────────────────────────────────────────────────

export async function addImportantPerson(formData: FormData) {
  const clientId = required(str(formData, "clientId"), "Client id");
  const name = required(str(formData, "name"), "Name");
  const relationship = required(str(formData, "relationship"), "Relationship");
  const notes = str(formData, "notes");
  const isAlive = !bool(formData, "deceased");

  // Position: end of list
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(importantPeople)
    .where(eq(importantPeople.clientId, clientId));

  await db
    .insert(importantPeople)
    .values({ clientId, name, relationship, notes, isAlive, position: count });
  revalidatePath(`/clients/${clientId}`);
}

export async function updateImportantPerson(formData: FormData) {
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
    .where(eq(importantPeople.id, id));
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteImportantPerson(
  personId: string,
  clientId: string
) {
  await db.delete(importantPeople).where(eq(importantPeople.id, personId));
  revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// THEMES — recurring patterns the practitioner is noticing
// ─────────────────────────────────────────────────────────────────────────────

export async function addTheme(formData: FormData) {
  const clientId = required(str(formData, "clientId"), "Client id");
  const label = required(str(formData, "label"), "Theme");
  await db.insert(themes).values({ clientId, label });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteTheme(themeId: string, clientId: string) {
  await db.delete(themes).where(eq(themes.id, themeId));
  revalidatePath(`/clients/${clientId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// OBSERVATIONS — bulleted "what I keep noticing for them"
// ─────────────────────────────────────────────────────────────────────────────

export async function addObservation(formData: FormData) {
  const clientId = required(str(formData, "clientId"), "Client id");
  const body = required(str(formData, "body"), "Observation");
  await db.insert(observations).values({ clientId, body });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteObservation(observationId: string, clientId: string) {
  await db.delete(observations).where(eq(observations.id, observationId));
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
  const { disconnectGoogle } = await import("./google-calendar");
  await disconnectGoogle();
  revalidatePath("/settings");
}

// Internal helper — best-effort Google Calendar push for a session.
// Never throws; any Google failure is logged + returned as an error string.
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

    const settingsRows = await db.select().from(practitionerSettings).limit(1);
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
      result = await updateCalendarEvent(session.googleEventId, eventInput);
      // If event was deleted on Google's side (returns null), recreate it
      if (!result) result = await createCalendarEvent(eventInput);
    } else {
      result = await createCalendarEvent(eventInput);
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

async function deleteSessionFromGoogle(googleEventId: string | null) {
  if (!googleEventId) return;
  try {
    const { deleteCalendarEvent } = await import("./google-calendar");
    await deleteCalendarEvent(googleEventId);
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
  const sessionId = required(str(formData, "sessionId"), "Session id");
  const transcript = required(str(formData, "transcript"), "Transcript");
  const templateId = str(formData, "templateId");
  const replaceExisting = bool(formData, "replaceExisting");

  // Look up the session + client for context
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

  // Optional template lookup
  let templateName: string | null = null;
  let templateBody: string | null = null;
  if (templateId) {
    const tplRows = await db
      .select()
      .from(noteTemplates)
      .where(eq(noteTemplates.id, templateId))
      .limit(1);
    if (tplRows[0]) {
      templateName = tplRows[0].name;
      templateBody = tplRows[0].body;
    }
  }

  // Call the AI
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

  // Decide how to merge with existing notes
  const existingNotes = session.notes?.trim() ?? "";
  const finalNotes = replaceExisting || existingNotes.length === 0
    ? result.notes
    : existingNotes + "\n\n---\n\n" + result.notes;

  await db
    .update(sessions)
    .set({ notes: finalNotes, updatedAt: new Date() })
    .where(eq(sessions.id, sessionId));

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
  const { generateInvoiceForSession } = await import("./invoices");
  await generateInvoiceForSession(sessionId);
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/payments");
}
