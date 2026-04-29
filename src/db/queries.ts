import { db } from "./index";
import {
  clients,
  sessions,
  attachments,
  goals,
  type Client,
} from "./schema";
import { eq, desc, asc, and, gte, lte, sql, isNotNull } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────────────

export async function listClients() {
  return db
    .select({
      id: clients.id,
      fullName: clients.fullName,
      avatarUrl: clients.avatarUrl,
      workingOn: clients.workingOn,
      tags: clients.tags,
      status: clients.status,
      createdAt: clients.createdAt,
      sessionCount: sql<number>`(SELECT COUNT(*)::int FROM ${sessions} WHERE ${sessions.clientId} = ${clients.id} AND ${sessions.status} = 'completed')`,
      attachmentCount: sql<number>`(SELECT COUNT(*)::int FROM ${attachments} WHERE ${attachments.clientId} = ${clients.id})`,
      lifetimeCents: sql<number>`COALESCE((SELECT SUM(${sessions.paymentAmountCents})::int FROM ${sessions} WHERE ${sessions.clientId} = ${clients.id} AND ${sessions.paid} = true), 0)`,
      unpaidCents: sql<number>`COALESCE((SELECT SUM(COALESCE(${sessions.paymentAmountCents}, 0))::int FROM ${sessions} WHERE ${sessions.clientId} = ${clients.id} AND ${sessions.paid} = false AND ${sessions.status} = 'completed'), 0)`,
      lastSessionAt: sql<Date | null>`(SELECT MAX(${sessions.scheduledAt}) FROM ${sessions} WHERE ${sessions.clientId} = ${clients.id} AND ${sessions.status} = 'completed')`,
      nextSessionAt: sql<Date | null>`(SELECT MIN(${sessions.scheduledAt}) FROM ${sessions} WHERE ${sessions.clientId} = ${clients.id} AND ${sessions.status} = 'scheduled')`,
    })
    .from(clients)
    .orderBy(asc(clients.fullName));
}

export async function listClientsForPicker() {
  return db
    .select({
      id: clients.id,
      fullName: clients.fullName,
      avatarUrl: clients.avatarUrl,
    })
    .from(clients)
    .orderBy(asc(clients.fullName));
}

export async function getClientById(id: string): Promise<Client | null> {
  const rows = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getClientFile(id: string) {
  const client = await getClientById(id);
  if (!client) return null;

  const [sessionsList, attachmentsList, goalsList] = await Promise.all([
    db
      .select()
      .from(sessions)
      .where(eq(sessions.clientId, id))
      .orderBy(desc(sessions.scheduledAt)),
    db
      .select()
      .from(attachments)
      .where(eq(attachments.clientId, id))
      .orderBy(desc(attachments.createdAt)),
    db
      .select()
      .from(goals)
      .where(and(eq(goals.clientId, id), eq(goals.archived, false)))
      .orderBy(asc(goals.position)),
  ]);

  return {
    client,
    sessions: sessionsList,
    attachments: attachmentsList,
    goals: goalsList,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────────────────────

export async function listSessionsInRange(start: Date, end: Date) {
  return db
    .select({
      id: sessions.id,
      clientId: sessions.clientId,
      clientName: clients.fullName,
      type: sessions.type,
      status: sessions.status,
      scheduledAt: sessions.scheduledAt,
      durationMinutes: sessions.durationMinutes,
      meetUrl: sessions.meetUrl,
      paid: sessions.paid,
    })
    .from(sessions)
    .innerJoin(clients, eq(sessions.clientId, clients.id))
    .where(and(gte(sessions.scheduledAt, start), lte(sessions.scheduledAt, end)))
    .orderBy(asc(sessions.scheduledAt));
}

export async function listAllSessionsForPayments() {
  return db
    .select({
      id: sessions.id,
      clientId: sessions.clientId,
      clientName: clients.fullName,
      type: sessions.type,
      scheduledAt: sessions.scheduledAt,
      status: sessions.status,
      paid: sessions.paid,
      paymentMethod: sessions.paymentMethod,
      paymentAmountCents: sessions.paymentAmountCents,
      paidAt: sessions.paidAt,
    })
    .from(sessions)
    .innerJoin(clients, eq(sessions.clientId, clients.id))
    .orderBy(desc(sessions.scheduledAt));
}

export async function getSessionById(id: string) {
  const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return rows[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard — "today's thread" data
// ─────────────────────────────────────────────────────────────────────────────

export async function getDashboardData() {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const [todays, thisWeek, unpaidSessions, missingNotes, dormantClients, totalClients] =
    await Promise.all([
      // Today's scheduled sessions
      db
        .select({
          id: sessions.id,
          clientId: sessions.clientId,
          clientName: clients.fullName,
          type: sessions.type,
          scheduledAt: sessions.scheduledAt,
          durationMinutes: sessions.durationMinutes,
          meetUrl: sessions.meetUrl,
          status: sessions.status,
        })
        .from(sessions)
        .innerJoin(clients, eq(sessions.clientId, clients.id))
        .where(
          and(
            gte(sessions.scheduledAt, startOfToday),
            lte(sessions.scheduledAt, endOfToday)
          )
        )
        .orderBy(asc(sessions.scheduledAt)),
      // This week's count
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(sessions)
        .where(
          and(
            gte(sessions.scheduledAt, startOfWeek),
            lte(sessions.scheduledAt, endOfWeek)
          )
        ),
      // Completed sessions that are unpaid
      db
        .select({
          id: sessions.id,
          clientId: sessions.clientId,
          clientName: clients.fullName,
          type: sessions.type,
          scheduledAt: sessions.scheduledAt,
        })
        .from(sessions)
        .innerJoin(clients, eq(sessions.clientId, clients.id))
        .where(and(eq(sessions.status, "completed"), eq(sessions.paid, false)))
        .orderBy(desc(sessions.scheduledAt))
        .limit(10),
      // Past sessions without notes
      db
        .select({
          id: sessions.id,
          clientId: sessions.clientId,
          clientName: clients.fullName,
          type: sessions.type,
          scheduledAt: sessions.scheduledAt,
        })
        .from(sessions)
        .innerJoin(clients, eq(sessions.clientId, clients.id))
        .where(
          and(
            eq(sessions.status, "completed"),
            sql`${sessions.notes} IS NULL OR length(trim(${sessions.notes})) = 0`
          )
        )
        .orderBy(desc(sessions.scheduledAt))
        .limit(10),
      // Active clients with no session in the last 14 days and no upcoming
      db
        .select({
          id: clients.id,
          fullName: clients.fullName,
          lastSessionAt: sql<Date | null>`(SELECT MAX(${sessions.scheduledAt}) FROM ${sessions} WHERE ${sessions.clientId} = ${clients.id})`,
        })
        .from(clients)
        .where(eq(clients.status, "active"))
        .orderBy(asc(clients.fullName)),
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(clients),
    ]);

  // Filter dormant in JS — easier than complex SQL
  const dormant = dormantClients.filter((c) => {
    if (!c.lastSessionAt) return false;
    return new Date(c.lastSessionAt) < fourteenDaysAgo;
  });

  return {
    todaySessions: todays,
    thisWeekCount: thisWeek[0]?.count ?? 0,
    unpaidSessions,
    missingNotes,
    dormantClients: dormant.slice(0, 5),
    totalClients: totalClients[0]?.count ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Payments page
// ─────────────────────────────────────────────────────────────────────────────

export async function getPaymentTotals() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const [paidThisMonth, paidThisYear, unpaidTotal] = await Promise.all([
    db
      .select({
        total: sql<number>`COALESCE(SUM(${sessions.paymentAmountCents}), 0)::int`,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.paid, true),
          isNotNull(sessions.paidAt),
          sql`${sessions.paidAt} >= ${startOfMonth.toISOString().slice(0, 10)}`
        )
      ),
    db
      .select({
        total: sql<number>`COALESCE(SUM(${sessions.paymentAmountCents}), 0)::int`,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.paid, true),
          isNotNull(sessions.paidAt),
          sql`${sessions.paidAt} >= ${startOfYear.toISOString().slice(0, 10)}`
        )
      ),
    db
      .select({
        total: sql<number>`COALESCE(SUM(${sessions.paymentAmountCents}), 0)::int`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(sessions)
      .where(and(eq(sessions.paid, false), eq(sessions.status, "completed"))),
  ]);

  return {
    paidThisMonthCents: paidThisMonth[0]?.total ?? 0,
    paidThisYearCents: paidThisYear[0]?.total ?? 0,
    unpaidCents: unpaidTotal[0]?.total ?? 0,
    unpaidCount: unpaidTotal[0]?.count ?? 0,
  };
}
