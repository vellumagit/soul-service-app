import { db } from "./index";
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
  type Client,
  type PractitionerSettings,
} from "./schema";
import {
  eq,
  desc,
  asc,
  and,
  or,
  gte,
  lte,
  sql,
  isNotNull,
  isNull,
  ilike,
  ne,
} from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Settings — single row, lazy-create on first read
// ─────────────────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<PractitionerSettings> {
  const rows = await db.select().from(practitionerSettings).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db
    .insert(practitionerSettings)
    .values({})
    .returning();
  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────────────

export type ClientFilter =
  | "all"
  | "active"
  | "new"
  | "dormant"
  | "unpaid"
  | "quiet"
  | "recent";

export async function listClients(filter: ClientFilter = "all") {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 30);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const baseSelect = db
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
    .from(clients);

  const list = await baseSelect.orderBy(asc(clients.fullName));

  // Apply filter in JS — small dataset, easier than nested SQL filtering on derived columns
  return list.filter((c) => {
    switch (filter) {
      case "active":
        return c.status === "active";
      case "new":
        return c.status === "new";
      case "dormant":
        return c.status === "dormant";
      case "unpaid":
        return c.unpaidCents > 0;
      case "quiet":
        return (
          c.status !== "archived" &&
          (!c.lastSessionAt ||
            new Date(c.lastSessionAt) < thirtyDaysAgo) &&
          !c.nextSessionAt
        );
      case "recent": {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        return new Date(c.createdAt) >= cutoff;
      }
      default:
        return true;
    }
  });
}

export async function listClientsForPicker() {
  return db
    .select({
      id: clients.id,
      fullName: clients.fullName,
      avatarUrl: clients.avatarUrl,
    })
    .from(clients)
    .where(ne(clients.status, "archived"))
    .orderBy(asc(clients.fullName));
}

export async function getClientById(id: string): Promise<Client | null> {
  const rows = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getClientFile(id: string) {
  const client = await getClientById(id);
  if (!client) return null;

  const [
    sessionsList,
    attachmentsList,
    goalsList,
    tasksList,
    communicationsList,
  ] = await Promise.all([
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
    db
      .select()
      .from(tasks)
      .where(eq(tasks.clientId, id))
      .orderBy(
        sql`CASE WHEN ${tasks.completedAt} IS NULL THEN 0 ELSE 1 END`,
        asc(tasks.dueAt)
      ),
    db
      .select()
      .from(communications)
      .where(eq(communications.clientId, id))
      .orderBy(desc(communications.occurredAt)),
  ]);

  return {
    client,
    sessions: sessionsList,
    attachments: attachmentsList,
    goals: goalsList,
    tasks: tasksList,
    communications: communicationsList,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity timeline — auto-derived feed of every event for a client
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityEvent = {
  id: string;
  kind:
    | "client_created"
    | "session_scheduled"
    | "session_completed"
    | "session_cancelled"
    | "session_paid"
    | "file_uploaded"
    | "task_created"
    | "task_completed"
    | "communication"
    | "invoice_generated";
  title: string;
  body?: string;
  occurredAt: Date;
  meta?: Record<string, string>;
};

export async function getClientActivity(
  clientId: string
): Promise<ActivityEvent[]> {
  const [client, sessionsList, attachmentsList, tasksList, comms] =
    await Promise.all([
      getClientById(clientId),
      db
        .select()
        .from(sessions)
        .where(eq(sessions.clientId, clientId)),
      db
        .select()
        .from(attachments)
        .where(eq(attachments.clientId, clientId)),
      db.select().from(tasks).where(eq(tasks.clientId, clientId)),
      db
        .select()
        .from(communications)
        .where(eq(communications.clientId, clientId)),
    ]);

  if (!client) return [];

  const events: ActivityEvent[] = [];

  // Client created
  events.push({
    id: `c-${client.id}`,
    kind: "client_created",
    title: "File opened",
    body: client.howTheyFoundMe
      ? `Source: ${client.howTheyFoundMe}`
      : undefined,
    occurredAt: client.createdAt,
  });

  // Sessions
  for (const s of sessionsList) {
    events.push({
      id: `s-create-${s.id}`,
      kind: "session_scheduled",
      title: `${s.type} scheduled`,
      body: s.intention ? `"${s.intention}"` : undefined,
      occurredAt: s.createdAt,
    });
    if (s.status === "completed") {
      events.push({
        id: `s-done-${s.id}`,
        kind: "session_completed",
        title: `${s.type} held`,
        body: s.notes
          ? s.notes.slice(0, 240) + (s.notes.length > 240 ? "…" : "")
          : undefined,
        occurredAt: s.scheduledAt,
      });
    }
    if (s.status === "cancelled") {
      events.push({
        id: `s-cx-${s.id}`,
        kind: "session_cancelled",
        title: `${s.type} cancelled`,
        occurredAt: s.updatedAt,
      });
    }
    if (s.paid && s.paidAt) {
      events.push({
        id: `s-paid-${s.id}`,
        kind: "session_paid",
        title: `Payment received${
          s.paymentMethod ? ` via ${s.paymentMethod}` : ""
        }`,
        body: s.paymentAmountCents
          ? `$${(s.paymentAmountCents / 100).toFixed(2)}`
          : undefined,
        occurredAt: new Date(s.paidAt),
      });
    }
    if (s.invoiceUrl && s.invoiceGeneratedAt) {
      events.push({
        id: `s-inv-${s.id}`,
        kind: "invoice_generated",
        title: `Invoice ${s.invoiceNumber ?? ""} generated`.trim(),
        occurredAt: s.invoiceGeneratedAt,
      });
    }
  }

  // Attachments
  for (const a of attachmentsList) {
    events.push({
      id: `a-${a.id}`,
      kind: "file_uploaded",
      title: `Uploaded: ${a.name}`,
      body: a.kind,
      occurredAt: a.createdAt,
    });
  }

  // Tasks
  for (const t of tasksList) {
    events.push({
      id: `t-${t.id}`,
      kind: "task_created",
      title: `Task: ${t.title}`,
      occurredAt: t.createdAt,
    });
    if (t.completedAt) {
      events.push({
        id: `t-done-${t.id}`,
        kind: "task_completed",
        title: `Done: ${t.title}`,
        occurredAt: t.completedAt,
      });
    }
  }

  // Communications
  for (const c of comms) {
    events.push({
      id: `comm-${c.id}`,
      kind: "communication",
      title: c.subject ?? c.kind,
      body: c.body
        ? c.body.slice(0, 160) + (c.body.length > 160 ? "…" : "")
        : undefined,
      occurredAt: c.occurredAt,
    });
  }

  return events.sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()
  );
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
      invoiceUrl: sessions.invoiceUrl,
      invoiceNumber: sessions.invoiceNumber,
    })
    .from(sessions)
    .innerJoin(clients, eq(sessions.clientId, clients.id))
    .orderBy(desc(sessions.scheduledAt));
}

export async function getSessionById(id: string) {
  const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getSessionWithClient(id: string) {
  const rows = await db
    .select()
    .from(sessions)
    .innerJoin(clients, eq(sessions.clientId, clients.id))
    .where(eq(sessions.id, id))
    .limit(1);
  if (!rows[0]) return null;
  return { session: rows[0].sessions, client: rows[0].clients };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────────────────────────

export async function listOpenTasks() {
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      body: tasks.body,
      dueAt: tasks.dueAt,
      clientId: tasks.clientId,
      clientName: clients.fullName,
      completedAt: tasks.completedAt,
      source: tasks.source,
    })
    .from(tasks)
    .leftJoin(clients, eq(tasks.clientId, clients.id))
    .where(isNull(tasks.completedAt))
    .orderBy(
      sql`CASE WHEN ${tasks.dueAt} IS NULL THEN 1 ELSE 0 END`,
      asc(tasks.dueAt)
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────────

export async function listEmailTemplates() {
  return db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.archived, false))
    .orderBy(asc(emailTemplates.name));
}

export async function listNoteTemplates() {
  return db
    .select()
    .from(noteTemplates)
    .where(eq(noteTemplates.archived, false))
    .orderBy(asc(noteTemplates.name));
}

// ─────────────────────────────────────────────────────────────────────────────
// Search — ⌘K palette
// ─────────────────────────────────────────────────────────────────────────────

export type SearchResult = {
  kind: "client" | "session" | "file" | "task";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

export async function search(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const wildcard = `%${q}%`;

  const [matchedClients, matchedSessions, matchedFiles, matchedTasks] =
    await Promise.all([
      db
        .select({
          id: clients.id,
          fullName: clients.fullName,
          workingOn: clients.workingOn,
          email: clients.email,
        })
        .from(clients)
        .where(
          or(
            ilike(clients.fullName, wildcard),
            ilike(clients.email, wildcard),
            ilike(clients.workingOn, wildcard),
            sql`${clients.tags}::text ILIKE ${wildcard}`,
            ilike(clients.aboutClient, wildcard),
            ilike(clients.intakeNotes, wildcard)
          )
        )
        .limit(8),
      db
        .select({
          id: sessions.id,
          clientId: sessions.clientId,
          clientName: clients.fullName,
          type: sessions.type,
          notes: sessions.notes,
          scheduledAt: sessions.scheduledAt,
        })
        .from(sessions)
        .innerJoin(clients, eq(sessions.clientId, clients.id))
        .where(
          or(
            ilike(sessions.notes, wildcard),
            ilike(sessions.intention, wildcard),
            ilike(sessions.type, wildcard)
          )
        )
        .orderBy(desc(sessions.scheduledAt))
        .limit(6),
      db
        .select({
          id: attachments.id,
          clientId: attachments.clientId,
          clientName: clients.fullName,
          name: attachments.name,
        })
        .from(attachments)
        .innerJoin(clients, eq(attachments.clientId, clients.id))
        .where(ilike(attachments.name, wildcard))
        .limit(5),
      db
        .select({
          id: tasks.id,
          title: tasks.title,
          clientId: tasks.clientId,
          clientName: clients.fullName,
          completedAt: tasks.completedAt,
        })
        .from(tasks)
        .leftJoin(clients, eq(tasks.clientId, clients.id))
        .where(
          and(
            isNull(tasks.completedAt),
            or(ilike(tasks.title, wildcard), ilike(tasks.body, wildcard))
          )
        )
        .limit(5),
    ]);

  const results: SearchResult[] = [];

  for (const c of matchedClients) {
    results.push({
      kind: "client",
      id: c.id,
      title: c.fullName,
      subtitle: c.workingOn ?? c.email ?? undefined,
      href: `/clients/${c.id}`,
    });
  }
  for (const s of matchedSessions) {
    results.push({
      kind: "session",
      id: s.id,
      title: `${s.type} · ${s.clientName}`,
      subtitle: s.notes
        ? s.notes.slice(0, 80) + (s.notes.length > 80 ? "…" : "")
        : s.scheduledAt.toLocaleDateString(),
      href: `/clients/${s.clientId}?tab=sessions#${s.id}`,
    });
  }
  for (const f of matchedFiles) {
    results.push({
      kind: "file",
      id: f.id,
      title: f.name,
      subtitle: f.clientName,
      href: `/clients/${f.clientId}?tab=files`,
    });
  }
  for (const t of matchedTasks) {
    results.push({
      kind: "task",
      id: t.id,
      title: t.title,
      subtitle: t.clientName ?? "(no client)",
      href: t.clientId ? `/clients/${t.clientId}` : `/`,
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
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

  const [
    todays,
    thisWeek,
    unpaidSessions,
    missingNotes,
    dormantClients,
    totalClients,
    openTasks,
  ] = await Promise.all([
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
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(sessions)
      .where(
        and(
          gte(sessions.scheduledAt, startOfWeek),
          lte(sessions.scheduledAt, endOfWeek)
        )
      ),
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
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueAt: tasks.dueAt,
        clientId: tasks.clientId,
        clientName: clients.fullName,
      })
      .from(tasks)
      .leftJoin(clients, eq(tasks.clientId, clients.id))
      .where(isNull(tasks.completedAt))
      .orderBy(
        sql`CASE WHEN ${tasks.dueAt} IS NULL THEN 1 ELSE 0 END`,
        asc(tasks.dueAt)
      )
      .limit(15),
  ]);

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
    openTasks,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Payments
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
        total: sql<number>`COALESCE(SUM(COALESCE(${sessions.paymentAmountCents}, 0)), 0)::int`,
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
