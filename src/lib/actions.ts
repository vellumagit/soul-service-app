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

  await db.insert(sessions).values({
    clientId,
    type,
    status: "scheduled",
    scheduledAt: new Date(scheduledAtRaw),
    durationMinutes,
    intention: str(formData, "intention"),
    meetUrl: str(formData, "meetUrl"),
  });

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

  const updates: Record<string, unknown> = {
    intention: str(formData, "intention"),
    arrivedAs: str(formData, "arrivedAs"),
    leftAs: str(formData, "leftAs"),
    notes: str(formData, "notes"),
    type: str(formData, "type") ?? undefined,
    updatedAt: new Date(),
  };

  const isMarkComplete = str(formData, "markComplete") === "true";
  if (isMarkComplete) updates.status = "completed";

  await db.update(sessions).set(updates).where(eq(sessions.id, id));

  if (isMarkComplete) {
    await runOnSessionCompleted(id, clientId);
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function cancelSession(sessionId: string, clientId: string) {
  await db
    .update(sessions)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(sessions.id, sessionId));
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function deleteSession(sessionId: string, clientId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
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
// MANUAL INVOICE GENERATION
// ─────────────────────────────────────────────────────────────────────────────

export async function generateInvoice(sessionId: string, clientId: string) {
  const { generateInvoiceForSession } = await import("./invoices");
  await generateInvoiceForSession(sessionId);
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/payments");
}
