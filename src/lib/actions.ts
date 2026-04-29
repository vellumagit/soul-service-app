"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  souls,
  readings,
  goals,
  themes,
  observations,
  intakeAnswers,
  invoices,
  consents,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";

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

function required(value: string | null, fieldName: string): string {
  if (!value) throw new Error(`${fieldName} is required`);
  return value;
}

async function nextSoulCode(): Promise<string> {
  // Soul codes look like "#S-01", "#S-02"… Use the count + 1, padded to 2 digits.
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(souls);
  const next = (count + 1).toString().padStart(2, "0");
  return `#S-${next}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SOULS
// ─────────────────────────────────────────────────────────────────────────────

export async function createSoul(formData: FormData) {
  const fullName = required(str(formData, "fullName"), "Full name");
  const code = await nextSoulCode();

  const [created] = await db
    .insert(souls)
    .values({
      code,
      fullName,
      pronouns: str(formData, "pronouns"),
      email: str(formData, "email"),
      phone: str(formData, "phone"),
      city: str(formData, "city"),
      timezone: str(formData, "timezone"),
      workingOn: str(formData, "workingOn"),
      pinnedNote: str(formData, "pinnedNote"),
      source: str(formData, "source"),
      avatarTone: str(formData, "avatarTone") ?? "ink",
      primaryReadingType:
        (str(formData, "primaryReadingType") as
          | "soul_reading"
          | "heart_clearing"
          | "ancestral_reading"
          | "love_alignment"
          | "inner_child"
          | "forgiveness_ritual"
          | "first_reading_intake"
          | "reconnection_call"
          | "cord_cutting"
          | null) ?? null,
      emergencyName: str(formData, "emergencyName"),
      emergencyPhone: str(formData, "emergencyPhone"),
      status: "active",
    })
    .returning({ code: souls.code });

  revalidatePath("/souls");
  redirect(`/souls/${encodeURIComponent(created.code)}`);
}

export async function updateSoulField(
  soulId: string,
  field: string,
  value: string | null
) {
  const allowed = new Set([
    "fullName",
    "pronouns",
    "email",
    "phone",
    "city",
    "timezone",
    "workingOn",
    "pinnedNote",
    "source",
    "primaryReadingType",
    "emergencyName",
    "emergencyPhone",
    "avatarTone",
  ]);
  if (!allowed.has(field)) throw new Error(`Field "${field}" is not editable`);

  const cleaned = value && value.trim().length > 0 ? value.trim() : null;
  await db
    .update(souls)
    .set({ [field]: cleaned, updatedAt: new Date() })
    .where(eq(souls.id, soulId));

  revalidatePath("/souls");
  revalidatePath("/souls/[code]", "page");
}

export async function deleteSoul(soulId: string) {
  await db.delete(souls).where(eq(souls.id, soulId));
  revalidatePath("/souls");
  redirect("/souls");
}

// ─────────────────────────────────────────────────────────────────────────────
// READINGS
// ─────────────────────────────────────────────────────────────────────────────

export async function scheduleReading(formData: FormData) {
  const soulId = required(str(formData, "soulId"), "Soul");
  const type = required(str(formData, "type"), "Reading type") as
    | "soul_reading"
    | "heart_clearing"
    | "ancestral_reading"
    | "love_alignment"
    | "inner_child"
    | "forgiveness_ritual"
    | "first_reading_intake"
    | "reconnection_call"
    | "cord_cutting";
  const scheduledAtRaw = required(
    str(formData, "scheduledAt"),
    "Date / time"
  );
  const durationMinutes = num(formData, "durationMinutes") ?? 60;
  const intention = str(formData, "intention");
  const meetUrl = str(formData, "meetUrl");

  await db.insert(readings).values({
    soulId,
    type,
    status: "scheduled",
    scheduledAt: new Date(scheduledAtRaw),
    durationMinutes,
    intention,
    meetUrl,
  });

  revalidatePath("/souls/[code]", "page");
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function completeReading(formData: FormData) {
  const id = required(str(formData, "id"), "Reading id");
  const log = str(formData, "log");
  const intention = str(formData, "intention");
  const preHeartOpen = num(formData, "preHeartOpen");
  const preSelfLove = num(formData, "preSelfLove");
  const preBody = str(formData, "preBody");
  const postHeartOpen = num(formData, "postHeartOpen");
  const postSelfLove = num(formData, "postSelfLove");
  const postBody = str(formData, "postBody");

  await db
    .update(readings)
    .set({
      status: "completed",
      log,
      intention,
      preHeartOpen,
      preSelfLove,
      preBody,
      postHeartOpen,
      postSelfLove,
      postBody,
      updatedAt: new Date(),
    })
    .where(eq(readings.id, id));

  revalidatePath("/souls/[code]", "page");
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function updateReadingLog(readingId: string, log: string) {
  await db
    .update(readings)
    .set({ log, updatedAt: new Date() })
    .where(eq(readings.id, readingId));
  revalidatePath("/souls/[code]", "page");
}

export async function cancelReading(readingId: string) {
  await db
    .update(readings)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(readings.id, readingId));
  revalidatePath("/souls/[code]", "page");
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function deleteReading(readingId: string) {
  await db.delete(readings).where(eq(readings.id, readingId));
  revalidatePath("/souls/[code]", "page");
  revalidatePath("/calendar");
}

// ─────────────────────────────────────────────────────────────────────────────
// GOALS
// ─────────────────────────────────────────────────────────────────────────────

export async function addGoal(formData: FormData) {
  const soulId = required(str(formData, "soulId"), "Soul id");
  const label = required(str(formData, "label"), "Goal label");
  const progress = Math.max(0, Math.min(100, num(formData, "progress") ?? 0));
  const note = str(formData, "note");

  // Position = end of list
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(goals)
    .where(eq(goals.soulId, soulId));

  await db.insert(goals).values({ soulId, label, progress, note, position: count });
  revalidatePath("/souls/[code]", "page");
}

export async function updateGoalProgress(goalId: string, progress: number) {
  const clamped = Math.max(0, Math.min(100, progress));
  await db
    .update(goals)
    .set({ progress: clamped, updatedAt: new Date() })
    .where(eq(goals.id, goalId));
  revalidatePath("/souls/[code]", "page");
}

export async function deleteGoal(goalId: string) {
  await db.delete(goals).where(eq(goals.id, goalId));
  revalidatePath("/souls/[code]", "page");
}

// ─────────────────────────────────────────────────────────────────────────────
// THEMES
// ─────────────────────────────────────────────────────────────────────────────

export async function addTheme(formData: FormData) {
  const soulId = required(str(formData, "soulId"), "Soul id");
  const label = required(str(formData, "label"), "Theme label");
  await db.insert(themes).values({ soulId, label });
  revalidatePath("/souls/[code]", "page");
}

export async function deleteTheme(themeId: string) {
  await db.delete(themes).where(eq(themes.id, themeId));
  revalidatePath("/souls/[code]", "page");
}

// ─────────────────────────────────────────────────────────────────────────────
// OBSERVATIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function addObservation(formData: FormData) {
  const soulId = required(str(formData, "soulId"), "Soul id");
  const body = required(str(formData, "body"), "Observation");
  await db.insert(observations).values({ soulId, body });
  revalidatePath("/souls/[code]", "page");
}

export async function deleteObservation(observationId: string) {
  await db.delete(observations).where(eq(observations.id, observationId));
  revalidatePath("/souls/[code]", "page");
}

// ─────────────────────────────────────────────────────────────────────────────
// INTAKE ANSWERS
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertIntakeAnswer(formData: FormData) {
  const soulId = required(str(formData, "soulId"), "Soul id");
  const question = required(str(formData, "question"), "Question");
  const answer = str(formData, "answer");
  const id = str(formData, "id");

  if (id) {
    await db
      .update(intakeAnswers)
      .set({ answer })
      .where(eq(intakeAnswers.id, id));
  } else {
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(intakeAnswers)
      .where(eq(intakeAnswers.soulId, soulId));
    await db
      .insert(intakeAnswers)
      .values({ soulId, question, answer, position: count });
  }
  revalidatePath("/souls/[code]", "page");
}

export async function deleteIntakeAnswer(answerId: string) {
  await db.delete(intakeAnswers).where(eq(intakeAnswers.id, answerId));
  revalidatePath("/souls/[code]", "page");
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSENTS (lightweight — full audit trail comes later)
// ─────────────────────────────────────────────────────────────────────────────

export async function addConsent(formData: FormData) {
  const soulId = required(str(formData, "soulId"), "Soul id");
  const label = required(str(formData, "label"), "Consent label");
  const status = str(formData, "status") ?? "Acknowledged";
  await db.insert(consents).values({ soulId, label, status });
  revalidatePath("/souls/[code]", "page");
}

export async function deleteConsent(consentId: string) {
  await db.delete(consents).where(eq(consents.id, consentId));
  revalidatePath("/souls/[code]", "page");
}

// ─────────────────────────────────────────────────────────────────────────────
// INVOICES (manual — Stripe wiring is a later milestone)
// ─────────────────────────────────────────────────────────────────────────────

export async function addInvoice(formData: FormData) {
  const soulId = required(str(formData, "soulId"), "Soul id");
  const number = required(str(formData, "number"), "Invoice number");
  const amountDollars = num(formData, "amount");
  if (amountDollars === null || amountDollars < 0)
    throw new Error("Amount must be a positive number");
  const issuedAt = required(str(formData, "issuedAt"), "Issued date");
  const dueAt = str(formData, "dueAt");
  const description = str(formData, "description");
  const status =
    (str(formData, "status") as
      | "paid"
      | "outstanding"
      | "overdue"
      | "draft"
      | "sent"
      | "void"
      | null) ?? "outstanding";

  await db.insert(invoices).values({
    soulId,
    number,
    amountCents: Math.round(amountDollars * 100),
    issuedAt,
    dueAt,
    description,
    status,
  });
  revalidatePath("/souls/[code]", "page");
  revalidatePath("/exchange");
}

export async function markInvoicePaid(invoiceId: string) {
  await db
    .update(invoices)
    .set({
      status: "paid",
      paidAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId));
  revalidatePath("/souls/[code]", "page");
  revalidatePath("/exchange");
}

export async function deleteInvoice(invoiceId: string) {
  await db.delete(invoices).where(eq(invoices.id, invoiceId));
  revalidatePath("/souls/[code]", "page");
  revalidatePath("/exchange");
}
