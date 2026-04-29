"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  clients,
  sessions,
  attachments,
  goals,
} from "@/db/schema";
import { eq } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
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
      howTheyFoundMe: str(formData, "howTheyFoundMe"),
      primarySessionType:
        str(formData, "primarySessionType") ?? "Soul reading",
      tags: tagsFromString(str(formData, "tags")),
      emergencyName: str(formData, "emergencyName"),
      emergencyPhone: str(formData, "emergencyPhone"),
      status: "active",
    })
    .returning({ id: clients.id });

  revalidatePath("/clients");
  redirect(`/clients/${created.id}`);
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
      howTheyFoundMe: str(formData, "howTheyFoundMe"),
      primarySessionType: str(formData, "primarySessionType"),
      tags: tagsFromString(str(formData, "tags")),
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

// Schedule a future session
export async function scheduleSession(formData: FormData) {
  const clientId = required(str(formData, "clientId"), "Client");
  const type = str(formData, "type") ?? "Soul reading";
  const scheduledAtRaw = required(
    str(formData, "scheduledAt"),
    "Date / time"
  );
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

// Log a session that already happened (can mark paid in the same step)
export async function logPastSession(formData: FormData) {
  const clientId = required(str(formData, "clientId"), "Client");
  const type = str(formData, "type") ?? "Soul reading";
  const scheduledAtRaw = required(
    str(formData, "scheduledAt"),
    "Date / time"
  );
  const durationMinutes = num(formData, "durationMinutes") ?? 60;
  const paid = bool(formData, "paid");
  const paymentAmount = num(formData, "paymentAmount");

  await db.insert(sessions).values({
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
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/calendar");
  revalidatePath("/payments");
  revalidatePath("/");
}

// Update an existing session (notes, intention, body states, etc.)
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

  // If marking complete (from scheduled)
  if (str(formData, "markComplete") === "true") {
    updates.status = "completed";
  }

  await db.update(sessions).set(updates).where(eq(sessions.id, id));

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

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT MARKING
// ─────────────────────────────────────────────────────────────────────────────

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
// FILES (Vercel Blob — wired in Step 7)
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteAttachment(
  attachmentId: string,
  clientId: string
) {
  // Best-effort: if Blob token is configured, also delete the blob
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
