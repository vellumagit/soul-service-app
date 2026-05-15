// Every public query in here takes an `accountId` as its first argument.
// That's the multi-tenancy gate: data from other accounts is filtered out at
// the database level via `AND account_id = ?`. Pages call requireSession()
// (which returns the current accountId) and pass it through.
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
  importantPeople,
  themes,
  observations,
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
// Setup status — drives the welcome checklist on Today.
// Each flag answers a single yes/no about whether she's done that step.
// ─────────────────────────────────────────────────────────────────────────────

export type SetupStatus = {
  hasBusinessInfo: boolean; // practitionerName + paymentInstructions
  hasClient: boolean; // ≥1 client
  hasSession: boolean; // ≥1 session ever scheduled or logged
  hasNotes: boolean; // ≥1 session has notes saved
};

export async function getSetupStatus(accountId: string): Promise<SetupStatus> {
  const [settings] = await db
    .select({
      practitionerName: practitionerSettings.practitionerName,
      paymentInstructions: practitionerSettings.paymentInstructions,
    })
    .from(practitionerSettings)
    .where(eq(practitionerSettings.accountId, accountId))
    .limit(1);

  const [clientCount] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(clients)
    .where(eq(clients.accountId, accountId));

  const [sessionCount] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(sessions)
    .where(eq(sessions.accountId, accountId));

  const [notesCount] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(sessions)
    .where(
      and(
        eq(sessions.accountId, accountId),
        sql`${sessions.notes} IS NOT NULL AND length(trim(${sessions.notes})) > 0`
      )
    );

  // Heuristic: "business info set" means she's written her name AND payment
  // instructions. Either alone could be the seeded default.
  const PLACEHOLDER_PAYMENT =
    "Edit me in Settings — e.g. Venmo @yourhandle · Zelle to you@example.com";

  return {
    hasBusinessInfo: Boolean(
      settings?.practitionerName &&
        settings.practitionerName.trim().length > 0 &&
        settings.paymentInstructions &&
        settings.paymentInstructions.trim().length > 0 &&
        settings.paymentInstructions !== PLACEHOLDER_PAYMENT
    ),
    hasClient: (clientCount?.n ?? 0) > 0,
    hasSession: (sessionCount?.n ?? 0) > 0,
    hasNotes: (notesCount?.n ?? 0) > 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings — one row per account, lazy-create on first read
// ─────────────────────────────────────────────────────────────────────────────

export async function getSettings(
  accountId: string
): Promise<PractitionerSettings> {
  const rows = await db
    .select()
    .from(practitionerSettings)
    .where(eq(practitionerSettings.accountId, accountId))
    .limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db
    .insert(practitionerSettings)
    .values({ accountId })
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

export async function listClients(
  accountId: string,
  filter: ClientFilter = "all"
) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const list = await db
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
    .where(eq(clients.accountId, accountId))
    .orderBy(asc(clients.fullName));

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

export async function listClientsForPicker(accountId: string) {
  return db
    .select({
      id: clients.id,
      fullName: clients.fullName,
      avatarUrl: clients.avatarUrl,
    })
    .from(clients)
    .where(
      and(eq(clients.accountId, accountId), ne(clients.status, "archived"))
    )
    .orderBy(asc(clients.fullName));
}

export async function getClientById(
  accountId: string,
  id: string
): Promise<Client | null> {
  const rows = await db
    .select()
    .from(clients)
    .where(and(eq(clients.accountId, accountId), eq(clients.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getClientFile(accountId: string, id: string) {
  const client = await getClientById(accountId, id);
  if (!client) return null;

  // Each leaf-table query is doubly-scoped: the join on clientId is the
  // primary filter, and accountId is defense-in-depth (also catches the
  // rare case where a row's accountId got out of sync with its client's).
  const [
    sessionsList,
    attachmentsList,
    goalsList,
    tasksList,
    communicationsList,
    peopleList,
    themesList,
    observationsList,
  ] = await Promise.all([
    db
      .select()
      .from(sessions)
      .where(
        and(eq(sessions.accountId, accountId), eq(sessions.clientId, id))
      )
      .orderBy(desc(sessions.scheduledAt)),
    db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.accountId, accountId),
          eq(attachments.clientId, id)
        )
      )
      .orderBy(desc(attachments.createdAt)),
    db
      .select()
      .from(goals)
      .where(
        and(
          eq(goals.accountId, accountId),
          eq(goals.clientId, id),
          eq(goals.archived, false)
        )
      )
      .orderBy(asc(goals.position)),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.accountId, accountId), eq(tasks.clientId, id)))
      .orderBy(
        sql`CASE WHEN ${tasks.completedAt} IS NULL THEN 0 ELSE 1 END`,
        asc(tasks.dueAt)
      ),
    db
      .select()
      .from(communications)
      .where(
        and(
          eq(communications.accountId, accountId),
          eq(communications.clientId, id)
        )
      )
      .orderBy(desc(communications.occurredAt)),
    db
      .select()
      .from(importantPeople)
      .where(
        and(
          eq(importantPeople.accountId, accountId),
          eq(importantPeople.clientId, id)
        )
      )
      .orderBy(asc(importantPeople.position), asc(importantPeople.createdAt)),
    db
      .select()
      .from(themes)
      .where(
        and(eq(themes.accountId, accountId), eq(themes.clientId, id))
      )
      .orderBy(asc(themes.label)),
    db
      .select()
      .from(observations)
      .where(
        and(
          eq(observations.accountId, accountId),
          eq(observations.clientId, id)
        )
      )
      .orderBy(desc(observations.createdAt)),
  ]);

  return {
    client,
    sessions: sessionsList,
    attachments: attachmentsList,
    goals: goalsList,
    tasks: tasksList,
    communications: communicationsList,
    importantPeople: peopleList,
    themes: themesList,
    observations: observationsList,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// "Where we left off" — pre-session digest
// ─────────────────────────────────────────────────────────────────────────────

export type ClientDigest = {
  lastSession: {
    when: Date;
    type: string;
    intention: string | null;
    arrivedAs: string | null;
    leftAs: string | null;
    notesExcerpt: string | null;
  } | null;
  nextSession: {
    when: Date;
    type: string;
    durationMinutes: number;
    meetUrl: string | null;
  } | null;
  openTasks: { id: string; title: string; dueAt: Date | null }[];
  workingOn: string | null;
  topGoals: { id: string; label: string; progress: number }[];
  latestIntention: { when: Date; text: string } | null;
};

export async function getClientDigest(
  accountId: string,
  clientId: string
): Promise<ClientDigest> {
  const client = await getClientById(accountId, clientId);
  if (!client) {
    return {
      lastSession: null,
      nextSession: null,
      openTasks: [],
      workingOn: null,
      topGoals: [],
      latestIntention: null,
    };
  }

  const [lastSessions, nextSessions, openTasksRows, goalsRows, intentionRow] =
    await Promise.all([
      db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.accountId, accountId),
            eq(sessions.clientId, clientId),
            eq(sessions.status, "completed")
          )
        )
        .orderBy(desc(sessions.scheduledAt))
        .limit(1),
      db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.accountId, accountId),
            eq(sessions.clientId, clientId),
            eq(sessions.status, "scheduled"),
            gte(sessions.scheduledAt, new Date())
          )
        )
        .orderBy(asc(sessions.scheduledAt))
        .limit(1),
      db
        .select({
          id: tasks.id,
          title: tasks.title,
          dueAt: tasks.dueAt,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.accountId, accountId),
            eq(tasks.clientId, clientId),
            isNull(tasks.completedAt)
          )
        )
        .orderBy(
          sql`CASE WHEN ${tasks.dueAt} IS NULL THEN 1 ELSE 0 END`,
          asc(tasks.dueAt)
        )
        .limit(5),
      db
        .select({
          id: goals.id,
          label: goals.label,
          progress: goals.progress,
        })
        .from(goals)
        .where(
          and(
            eq(goals.accountId, accountId),
            eq(goals.clientId, clientId),
            eq(goals.archived, false)
          )
        )
        .orderBy(asc(goals.position))
        .limit(3),
      db
        .select({
          intention: sessions.intention,
          when: sessions.scheduledAt,
        })
        .from(sessions)
        .where(
          and(
            eq(sessions.accountId, accountId),
            eq(sessions.clientId, clientId),
            isNotNull(sessions.intention)
          )
        )
        .orderBy(desc(sessions.scheduledAt))
        .limit(1),
    ]);

  const last = lastSessions[0] ?? null;
  const next = nextSessions[0] ?? null;
  const intention = intentionRow[0] ?? null;

  return {
    lastSession: last
      ? {
          when: last.scheduledAt,
          type: last.type,
          intention: last.intention,
          arrivedAs: last.arrivedAs,
          leftAs: last.leftAs,
          notesExcerpt: last.notes
            ? last.notes.slice(0, 280) +
              (last.notes.length > 280 ? "…" : "")
            : null,
        }
      : null,
    nextSession: next
      ? {
          when: next.scheduledAt,
          type: next.type,
          durationMinutes: next.durationMinutes,
          meetUrl: next.meetUrl,
        }
      : null,
    openTasks: openTasksRows,
    workingOn: client.workingOn ?? null,
    topGoals: goalsRows,
    latestIntention:
      intention && intention.intention
        ? { when: intention.when, text: intention.intention }
        : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Capacity strip — workload at-a-glance
// ─────────────────────────────────────────────────────────────────────────────

export async function getCapacity(accountId: string) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const [
    activeCount,
    weekSessionCount,
    openTaskCount,
    overdueTaskCount,
    heavyClients,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(clients)
      .where(
        and(eq(clients.accountId, accountId), eq(clients.status, "active"))
      ),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(sessions)
      .where(
        and(
          eq(sessions.accountId, accountId),
          gte(sessions.scheduledAt, startOfWeek),
          lte(sessions.scheduledAt, endOfWeek),
          eq(sessions.status, "scheduled")
        )
      ),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(tasks)
      .where(
        and(eq(tasks.accountId, accountId), isNull(tasks.completedAt))
      ),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.accountId, accountId),
          isNull(tasks.completedAt),
          isNotNull(tasks.dueAt),
          sql`${tasks.dueAt} < NOW()`
        )
      ),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(clients)
      .where(
        and(
          eq(clients.accountId, accountId),
          eq(clients.status, "active"),
          sql`array_length(${clients.sensitivities}, 1) > 0`
        )
      ),
  ]);

  return {
    activeClients: activeCount[0]?.count ?? 0,
    sessionsThisWeek: weekSessionCount[0]?.count ?? 0,
    openTasks: openTaskCount[0]?.count ?? 0,
    overdueTasks: overdueTaskCount[0]?.count ?? 0,
    heavyClients: heavyClients[0]?.count ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity timeline
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
  accountId: string,
  clientId: string
): Promise<ActivityEvent[]> {
  const [client, sessionsList, attachmentsList, tasksList, comms] =
    await Promise.all([
      getClientById(accountId, clientId),
      db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.accountId, accountId),
            eq(sessions.clientId, clientId)
          )
        ),
      db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.accountId, accountId),
            eq(attachments.clientId, clientId)
          )
        ),
      db
        .select()
        .from(tasks)
        .where(
          and(eq(tasks.accountId, accountId), eq(tasks.clientId, clientId))
        ),
      db
        .select()
        .from(communications)
        .where(
          and(
            eq(communications.accountId, accountId),
            eq(communications.clientId, clientId)
          )
        ),
    ]);

  if (!client) return [];

  const events: ActivityEvent[] = [];

  events.push({
    id: `c-${client.id}`,
    kind: "client_created",
    title: "File opened",
    body: client.howTheyFoundMe
      ? `Source: ${client.howTheyFoundMe}`
      : undefined,
    occurredAt: client.createdAt,
  });

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

  for (const a of attachmentsList) {
    events.push({
      id: `a-${a.id}`,
      kind: "file_uploaded",
      title: `Uploaded: ${a.name}`,
      body: a.kind,
      occurredAt: a.createdAt,
    });
  }

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

export async function listSessionsInRange(
  accountId: string,
  start: Date,
  end: Date
) {
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
    .where(
      and(
        eq(sessions.accountId, accountId),
        gte(sessions.scheduledAt, start),
        lte(sessions.scheduledAt, end)
      )
    )
    .orderBy(asc(sessions.scheduledAt));
}

export async function listAllSessionsForPayments(accountId: string) {
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
    .where(eq(sessions.accountId, accountId))
    .orderBy(desc(sessions.scheduledAt));
}

export async function getSessionById(accountId: string, id: string) {
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSessionWithClient(accountId: string, id: string) {
  const rows = await db
    .select()
    .from(sessions)
    .innerJoin(clients, eq(sessions.clientId, clients.id))
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, id)))
    .limit(1);
  if (!rows[0]) return null;
  return { session: rows[0].sessions, client: rows[0].clients };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────────────────────────

export async function listOpenTasks(accountId: string) {
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
    .where(and(eq(tasks.accountId, accountId), isNull(tasks.completedAt)))
    .orderBy(
      sql`CASE WHEN ${tasks.dueAt} IS NULL THEN 1 ELSE 0 END`,
      asc(tasks.dueAt)
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────────

export async function listEmailTemplates(accountId: string) {
  return db
    .select()
    .from(emailTemplates)
    .where(
      and(
        eq(emailTemplates.accountId, accountId),
        eq(emailTemplates.archived, false)
      )
    )
    .orderBy(asc(emailTemplates.name));
}

export async function listNoteTemplates(accountId: string) {
  return db
    .select()
    .from(noteTemplates)
    .where(
      and(
        eq(noteTemplates.accountId, accountId),
        eq(noteTemplates.archived, false)
      )
    )
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

export async function search(
  accountId: string,
  query: string
): Promise<SearchResult[]> {
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
          and(
            eq(clients.accountId, accountId),
            or(
              ilike(clients.fullName, wildcard),
              ilike(clients.email, wildcard),
              ilike(clients.workingOn, wildcard),
              sql`${clients.tags}::text ILIKE ${wildcard}`,
              ilike(clients.aboutClient, wildcard),
              ilike(clients.intakeNotes, wildcard)
            )
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
          and(
            eq(sessions.accountId, accountId),
            or(
              ilike(sessions.notes, wildcard),
              ilike(sessions.intention, wildcard),
              ilike(sessions.type, wildcard)
            )
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
        .where(
          and(
            eq(attachments.accountId, accountId),
            ilike(attachments.name, wildcard)
          )
        )
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
            eq(tasks.accountId, accountId),
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

export async function getDashboardData(accountId: string) {
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
          eq(sessions.accountId, accountId),
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
          eq(sessions.accountId, accountId),
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
      .where(
        and(
          eq(sessions.accountId, accountId),
          eq(sessions.status, "completed"),
          eq(sessions.paid, false)
        )
      )
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
          eq(sessions.accountId, accountId),
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
      .where(
        and(eq(clients.accountId, accountId), eq(clients.status, "active"))
      )
      .orderBy(asc(clients.fullName)),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(clients)
      .where(eq(clients.accountId, accountId)),
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
      .where(and(eq(tasks.accountId, accountId), isNull(tasks.completedAt)))
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

export async function getPaymentTotals(accountId: string) {
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
          eq(sessions.accountId, accountId),
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
          eq(sessions.accountId, accountId),
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
      .where(
        and(
          eq(sessions.accountId, accountId),
          eq(sessions.paid, false),
          eq(sessions.status, "completed")
        )
      ),
  ]);

  return {
    paidThisMonthCents: paidThisMonth[0]?.total ?? 0,
    paidThisYearCents: paidThisYear[0]?.total ?? 0,
    unpaidCents: unpaidTotal[0]?.total ?? 0,
    unpaidCount: unpaidTotal[0]?.count ?? 0,
  };
}
