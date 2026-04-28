import { db } from "./index";
import {
  souls,
  readings,
  documents,
  goals,
  themes,
  observations,
  invoices,
  consents,
  intakeAnswers,
  timelineEvents,
  type Soul,
} from "./schema";
import { eq, desc, asc, and, gte, lte, sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Soul directory + single-soul reads
// ─────────────────────────────────────────────────────────────────────────────

export async function listSouls() {
  return db
    .select({
      id: souls.id,
      code: souls.code,
      fullName: souls.fullName,
      workingOn: souls.workingOn,
      avatarTone: souls.avatarTone,
      flags: souls.flags,
      status: souls.status,
      // Aggregate counts
      readingCount: sql<number>`(SELECT COUNT(*)::int FROM ${readings} WHERE ${readings.soulId} = ${souls.id} AND ${readings.status} = 'completed')`,
      documentCount: sql<number>`(SELECT COUNT(*)::int FROM ${documents} WHERE ${documents.soulId} = ${souls.id})`,
      lifetimeCents: sql<number>`COALESCE((SELECT SUM(${invoices.amountCents})::int FROM ${invoices} WHERE ${invoices.soulId} = ${souls.id} AND ${invoices.status} = 'paid'), 0)`,
      lastReadingAt: sql<Date | null>`(SELECT MAX(${readings.scheduledAt}) FROM ${readings} WHERE ${readings.soulId} = ${souls.id} AND ${readings.status} = 'completed')`,
      nextReadingAt: sql<Date | null>`(SELECT MIN(${readings.scheduledAt}) FROM ${readings} WHERE ${readings.soulId} = ${souls.id} AND ${readings.status} = 'scheduled')`,
    })
    .from(souls)
    .orderBy(asc(souls.code));
}

export async function getSoulByCode(code: string): Promise<Soul | null> {
  const rows = await db
    .select()
    .from(souls)
    .where(eq(souls.code, code))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSoulFile(code: string) {
  const soul = await getSoulByCode(code);
  if (!soul) return null;

  const [
    readingsList,
    documentsList,
    goalsList,
    themesList,
    observationsList,
    invoicesList,
    consentsList,
    intakeList,
    timelineList,
  ] = await Promise.all([
    db
      .select()
      .from(readings)
      .where(eq(readings.soulId, soul.id))
      .orderBy(desc(readings.scheduledAt)),
    db
      .select()
      .from(documents)
      .where(eq(documents.soulId, soul.id))
      .orderBy(desc(documents.createdAt)),
    db
      .select()
      .from(goals)
      .where(and(eq(goals.soulId, soul.id), eq(goals.archived, false)))
      .orderBy(asc(goals.position)),
    db.select().from(themes).where(eq(themes.soulId, soul.id)),
    db
      .select()
      .from(observations)
      .where(eq(observations.soulId, soul.id))
      .orderBy(desc(observations.createdAt)),
    db
      .select()
      .from(invoices)
      .where(eq(invoices.soulId, soul.id))
      .orderBy(desc(invoices.issuedAt)),
    db.select().from(consents).where(eq(consents.soulId, soul.id)),
    db
      .select()
      .from(intakeAnswers)
      .where(eq(intakeAnswers.soulId, soul.id))
      .orderBy(asc(intakeAnswers.position)),
    db
      .select()
      .from(timelineEvents)
      .where(eq(timelineEvents.soulId, soul.id))
      .orderBy(desc(timelineEvents.occurredAt)),
  ]);

  return {
    soul,
    readings: readingsList,
    documents: documentsList,
    goals: goalsList,
    themes: themesList,
    observations: observationsList,
    invoices: invoicesList,
    consents: consentsList,
    intakeAnswers: intakeList,
    timelineEvents: timelineList,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar — readings within a date window
// ─────────────────────────────────────────────────────────────────────────────

export async function listReadingsInRange(start: Date, end: Date) {
  return db
    .select({
      id: readings.id,
      soulId: readings.soulId,
      soulCode: souls.code,
      soulName: souls.fullName,
      type: readings.type,
      status: readings.status,
      scheduledAt: readings.scheduledAt,
      durationMinutes: readings.durationMinutes,
      meetUrl: readings.meetUrl,
    })
    .from(readings)
    .innerJoin(souls, eq(readings.soulId, souls.id))
    .where(
      and(gte(readings.scheduledAt, start), lte(readings.scheduledAt, end))
    )
    .orderBy(asc(readings.scheduledAt));
}

// ─────────────────────────────────────────────────────────────────────────────
// Exchange — global invoice list
// ─────────────────────────────────────────────────────────────────────────────

export async function listInvoices() {
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      soulId: invoices.soulId,
      soulName: souls.fullName,
      amountCents: invoices.amountCents,
      currency: invoices.currency,
      issuedAt: invoices.issuedAt,
      dueAt: invoices.dueAt,
      status: invoices.status,
      description: invoices.description,
    })
    .from(invoices)
    .innerJoin(souls, eq(invoices.soulId, souls.id))
    .orderBy(desc(invoices.issuedAt));
}
