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
  gt,
  lte,
  lt,
  sql,
  isNotNull,
  isNull,
  ilike,
  inArray,
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

  // /clients shows clients — by default this means NOT leads. Network entries
  // (is_lead = true) live on /network. The query is filtered at the DB level
  // so the page doesn't pay for fetching+discarding lead rows.
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
    .where(and(eq(clients.accountId, accountId), eq(clients.isLead, false)))
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

// ─────────────────────────────────────────────────────────────────────────────
// Network — light contact-book of people orbiting the practice before (and
// optionally after) they become clients.
// ─────────────────────────────────────────────────────────────────────────────

export type NetworkFilter = "all" | "recent" | "no-source" | "warm";

export type NetworkEntry = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  source: string | null; // howTheyFoundMe
  metOn: string | null; // ISO date string from Postgres DATE column
  metViaClientId: string | null;
  metViaClientName: string | null; // joined display name when linked
  email: string | null;
  phone: string | null;
  workingOn: string | null;
  tags: string[];
  notesCount: number; // communications + observations + tasks combined
  createdAt: Date;
  /** Most recent activity touch — max of communications.occurred_at and
   *  clients.updated_at. Used for sort + the "last touched" column. */
  lastTouchedAt: Date | null;
};

export async function listNetwork(
  accountId: string,
  filter: NetworkFilter = "all"
): Promise<NetworkEntry[]> {
  // Self-join clients to resolve metViaClientId → metViaClientName in one trip.
  const referrer = {
    id: sql`referrer.id`.as("referrer_id"),
    fullName: sql`referrer.full_name`.as("referrer_full_name"),
  } as const;
  const list = await db
    .select({
      id: clients.id,
      fullName: clients.fullName,
      avatarUrl: clients.avatarUrl,
      source: clients.howTheyFoundMe,
      metOn: clients.metOn,
      metViaClientId: clients.metViaClientId,
      metViaClientName: sql<string | null>`referrer.full_name`,
      email: clients.email,
      phone: clients.phone,
      workingOn: clients.workingOn,
      tags: clients.tags,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
      // Light "activity" signal — how much she's written in / around them.
      // Used to surface warm leads at the top.
      noteHits: sql<number>`(
        (SELECT COUNT(*)::int FROM ${communications} WHERE ${communications.clientId} = ${clients.id})
      + (SELECT COUNT(*)::int FROM ${observations} WHERE ${observations.clientId} = ${clients.id})
      + (SELECT COUNT(*)::int FROM ${tasks} WHERE ${tasks.clientId} = ${clients.id})
      )`,
      lastCommAt: sql<Date | null>`(SELECT MAX(${communications.occurredAt}) FROM ${communications} WHERE ${communications.clientId} = ${clients.id})`,
    })
    .from(clients)
    .leftJoin(
      sql`${clients} AS referrer`,
      sql`referrer.id = ${clients.metViaClientId}`
    )
    .where(and(eq(clients.accountId, accountId), eq(clients.isLead, true)))
    .orderBy(desc(clients.createdAt));
  void referrer; // alias kept for clarity even though we read via raw sql

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const mapped: NetworkEntry[] = list.map((r) => {
    // Convert MAX(timestamp) string → Date (same neon-http aggregate caveat
    // as elsewhere in this file).
    const lastComm = r.lastCommAt ? new Date(r.lastCommAt) : null;
    const updated = new Date(r.updatedAt);
    const lastTouchedAt =
      lastComm && lastComm > updated ? lastComm : updated;
    return {
      id: r.id,
      fullName: r.fullName,
      avatarUrl: r.avatarUrl,
      source: r.source,
      metOn: r.metOn,
      metViaClientId: r.metViaClientId,
      metViaClientName: r.metViaClientName,
      email: r.email,
      phone: r.phone,
      workingOn: r.workingOn,
      tags: r.tags,
      notesCount: r.noteHits,
      createdAt: new Date(r.createdAt),
      lastTouchedAt,
    };
  });

  return mapped.filter((c) => {
    switch (filter) {
      case "recent":
        return c.createdAt >= thirtyDaysAgo;
      case "no-source":
        return !c.source || c.source.trim().length === 0;
      case "warm":
        // Anyone she's written something about — comms / observations / tasks
        return c.notesCount > 0;
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
    id: string;
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
          id: next.id,
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

/** Everything she needs in the doorway, in one query. Used by /sessions/[id]/prep
 *  — the full-bleed "Threshold" view she pulls up 5 min before walking into a
 *  session. Returns null if the session doesn't belong to her account. */
export type SessionPrep = {
  session: {
    id: string;
    clientId: string;
    type: string;
    scheduledAt: Date;
    durationMinutes: number;
    intention: string | null;
    meetUrl: string | null;
    status: string;
  };
  client: {
    id: string;
    fullName: string;
    workingOn: string | null;
    sensitivities: string[];
    avatarUrl: string | null;
  };
  /** The most recent completed session for this client, if any. */
  lastSession: {
    id: string;
    scheduledAt: Date;
    type: string;
    arrivedAs: string | null;
    leftAs: string | null;
    notesExcerpt: string | null;
    closingLanded: string | null;
    closingRemember: string | null;
    closingNeverForget: string | null;
  } | null;
  /** Active themes (tag-cloud) — gives her the "still alive" texture. */
  themes: { id: string; label: string }[];
};

export async function getSessionPrep(
  accountId: string,
  sessionId: string
): Promise<SessionPrep | null> {
  const [pair] = await db
    .select()
    .from(sessions)
    .innerJoin(clients, eq(sessions.clientId, clients.id))
    .where(and(eq(sessions.accountId, accountId), eq(sessions.id, sessionId)))
    .limit(1);
  if (!pair) return null;

  const s = pair.sessions;
  const c = pair.clients;

  // Most recent completed session for this client, EXCLUDING this one.
  const [last] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.accountId, accountId),
        eq(sessions.clientId, c.id),
        eq(sessions.status, "completed"),
        sql`${sessions.id} <> ${sessionId}`
      )
    )
    .orderBy(desc(sessions.scheduledAt))
    .limit(1);

  // Recent themes (up to 12), newest-first by creation.
  const themeRows = await db
    .select({ id: themes.id, label: themes.label })
    .from(themes)
    .where(
      and(eq(themes.accountId, accountId), eq(themes.clientId, c.id))
    )
    .orderBy(desc(themes.createdAt))
    .limit(12);

  return {
    session: {
      id: s.id,
      clientId: s.clientId,
      type: s.type,
      scheduledAt: s.scheduledAt,
      durationMinutes: s.durationMinutes,
      intention: s.intention,
      meetUrl: s.meetUrl,
      status: s.status,
    },
    client: {
      id: c.id,
      fullName: c.fullName,
      workingOn: c.workingOn,
      sensitivities: (c.sensitivities ?? []) as string[],
      avatarUrl: c.avatarUrl,
    },
    lastSession: last
      ? {
          id: last.id,
          scheduledAt: last.scheduledAt,
          type: last.type,
          arrivedAs: last.arrivedAs,
          leftAs: last.leftAs,
          notesExcerpt: last.notes
            ? last.notes.slice(0, 280) + (last.notes.length > 280 ? "…" : "")
            : null,
          closingLanded: last.closingLanded,
          closingRemember: last.closingRemember,
          closingNeverForget: last.closingNeverForget,
        }
      : null,
    themes: themeRows,
  };
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
// Anniversaries / birthdays — what to surface on Today
// ─────────────────────────────────────────────────────────────────────────────

export type AnniversaryEvent =
  | {
      kind: "birthday";
      clientId: string;
      clientName: string;
      /** Years old today (null if dob has no year, which can happen if she
       *  typed "00-04-15"-style placeholders, though our form prevents it). */
      yearsOld: number | null;
    }
  | {
      kind: "first-session";
      clientId: string;
      clientName: string;
      /** How many years ago today the first session was. 1, 2, 3, … */
      yearsTogether: number;
    };

/** Find every client whose birthday is today (month + day match) and every
 *  client whose first-ever session was on today's date in a previous year.
 *  Computed in JS rather than SQL because Postgres date-part queries against
 *  text-stored dates are awkward and the dataset is small. */
export async function getTodaysAnniversaries(
  accountId: string
): Promise<AnniversaryEvent[]> {
  const today = new Date();
  const todayMonth = today.getMonth(); // 0-11
  const todayDate = today.getDate();
  const thisYear = today.getFullYear();

  // Pull every non-archived client with a dob OR a first session, in one
  // round-trip. Cheap for any practitioner's lifetime client count.
  const rows = await db
    .select({
      id: clients.id,
      fullName: clients.fullName,
      dob: clients.dob,
      // First non-cancelled session anywhere in time
      firstSessionAt: sql<Date | null>`(
        SELECT MIN(${sessions.scheduledAt})
        FROM ${sessions}
        WHERE ${sessions.clientId} = ${clients.id}
          AND ${sessions.status} <> 'cancelled'
      )`,
    })
    .from(clients)
    .where(
      and(eq(clients.accountId, accountId), ne(clients.status, "archived"))
    );

  const events: AnniversaryEvent[] = [];

  for (const c of rows) {
    // Birthday match — dob is a string ("YYYY-MM-DD") OR a Date depending
    // on the driver. Normalize.
    if (c.dob) {
      const dobDate =
        typeof c.dob === "string" ? new Date(c.dob + "T12:00:00Z") : new Date(c.dob);
      if (
        !Number.isNaN(dobDate.getTime()) &&
        dobDate.getUTCMonth() === todayMonth &&
        dobDate.getUTCDate() === todayDate
      ) {
        const dobYear = dobDate.getUTCFullYear();
        const yearsOld =
          dobYear > 1900 && dobYear <= thisYear ? thisYear - dobYear : null;
        events.push({
          kind: "birthday",
          clientId: c.id,
          clientName: c.fullName,
          yearsOld,
        });
      }
    }

    // First-session anniversary — same calendar day, earlier year
    if (c.firstSessionAt) {
      const fs = new Date(c.firstSessionAt);
      if (
        fs.getMonth() === todayMonth &&
        fs.getDate() === todayDate &&
        fs.getFullYear() < thisYear
      ) {
        events.push({
          kind: "first-session",
          clientId: c.id,
          clientName: c.fullName,
          yearsTogether: thisYear - fs.getFullYear(),
        });
      }
    }
  }

  return events;
}

// ─────────────────────────────────────────────────────────────────────────────
// Year in review — "Your practice this year"
// ─────────────────────────────────────────────────────────────────────────────

export type YearInReview = {
  year: number;
  /** Total non-cancelled sessions held this calendar year (status=completed
   *  or status=scheduled that already happened). */
  sessionsHeld: number;
  /** Unique clients she met with this year. */
  clientsSeen: number;
  /** Sum of session durations in minutes, completed sessions only. */
  totalMinutes: number;
  /** Months in the year she had at least one session in. */
  monthsActive: number;
  /** Top themes across all clients this year (label + how many clients used it). */
  topThemes: { label: string; count: number }[];
  /** Milestones pinned to sessions this year — show as a small ledger. */
  milestones: {
    sessionId: string;
    clientId: string;
    clientName: string;
    label: string;
    sessionAt: Date;
  }[];
  /** "Never want to forget" lines from this year — the most precious threads. */
  anchorMoments: {
    sessionId: string;
    clientId: string;
    clientName: string;
    line: string;
    sessionAt: Date;
  }[];
  /** Clients whose first session was in this year — new beginnings. */
  newBeginnings: { clientId: string; clientName: string; firstAt: Date }[];
  /** Clients whose first-session anniversary fell within this year — those
   *  she crossed a year (or more) with. */
  anniversariesPassed: {
    clientId: string;
    clientName: string;
    yearsTogether: number;
    date: Date;
  }[];
  /** Sessions per month, for a small rhythm chart. Length 12, index 0 = Jan. */
  monthlyRhythm: number[];
};

export async function getYearInReview(
  accountId: string,
  year: number
): Promise<YearInReview> {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  // All sessions IN this year (any status), joined to clients for names
  const sessionRows = await db
    .select({
      id: sessions.id,
      clientId: sessions.clientId,
      clientName: clients.fullName,
      scheduledAt: sessions.scheduledAt,
      durationMinutes: sessions.durationMinutes,
      status: sessions.status,
      closingNeverForget: sessions.closingNeverForget,
      milestoneLabel: sessions.milestoneLabel,
      milestoneAt: sessions.milestoneAt,
    })
    .from(sessions)
    .innerJoin(clients, eq(sessions.clientId, clients.id))
    .where(
      and(
        eq(sessions.accountId, accountId),
        gte(sessions.scheduledAt, yearStart),
        lt(sessions.scheduledAt, yearEnd)
      )
    );

  const held = sessionRows.filter((s) => s.status !== "cancelled");
  const completed = sessionRows.filter((s) => s.status === "completed");
  const sessionsHeld = held.length;
  const clientsSeen = new Set(held.map((s) => s.clientId)).size;
  const totalMinutes = completed.reduce((sum, s) => sum + s.durationMinutes, 0);
  const monthsActive = new Set(
    held.map((s) => new Date(s.scheduledAt).getMonth())
  ).size;

  const monthlyRhythm = Array.from({ length: 12 }, () => 0);
  for (const s of held) monthlyRhythm[new Date(s.scheduledAt).getMonth()]++;

  // Themes: pull every theme for every client she met this year. Count by
  // label (case-insensitive), tally distinct clients.
  const heldClientIds = Array.from(new Set(held.map((s) => s.clientId)));
  let themeRows: { label: string; clientId: string }[] = [];
  if (heldClientIds.length > 0) {
    themeRows = await db
      .select({ label: themes.label, clientId: themes.clientId })
      .from(themes)
      .where(
        and(
          eq(themes.accountId, accountId),
          inArray(themes.clientId, heldClientIds)
        )
      );
  }
  const themeBuckets = new Map<string, Set<string>>();
  for (const t of themeRows) {
    const key = t.label.trim().toLowerCase();
    if (!key) continue;
    if (!themeBuckets.has(key)) themeBuckets.set(key, new Set());
    themeBuckets.get(key)!.add(t.clientId);
  }
  const topThemes = Array.from(themeBuckets.entries())
    .map(([label, clientSet]) => ({
      // Use the first occurrence's original casing for display
      label:
        themeRows.find((t) => t.label.trim().toLowerCase() === label)?.label ??
        label,
      count: clientSet.size,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // Milestones pinned this year — could be on past sessions she revisited,
  // so we filter by milestoneAt (when she pinned it) rather than by session
  // date. But include the session's own scheduledAt for context.
  const milestoneRows = sessionRows
    .filter(
      (s) =>
        s.milestoneLabel &&
        s.milestoneLabel.trim().length > 0 &&
        s.milestoneAt &&
        s.milestoneAt >= yearStart &&
        s.milestoneAt < yearEnd
    )
    .map((s) => ({
      sessionId: s.id,
      clientId: s.clientId,
      clientName: s.clientName,
      label: s.milestoneLabel!.trim(),
      sessionAt: s.scheduledAt,
    }))
    .sort((a, b) => a.sessionAt.getTime() - b.sessionAt.getTime());

  // Anchor moments — closingNeverForget lines from sessions THIS year
  const anchorMoments = sessionRows
    .filter(
      (s) => s.closingNeverForget && s.closingNeverForget.trim().length > 0
    )
    .map((s) => ({
      sessionId: s.id,
      clientId: s.clientId,
      clientName: s.clientName,
      line: s.closingNeverForget!.trim(),
      sessionAt: s.scheduledAt,
    }))
    .sort((a, b) => a.sessionAt.getTime() - b.sessionAt.getTime());

  // New beginnings: clients whose FIRST non-cancelled session was within
  // this year (regardless of which year that first session falls in within
  // the row set — we need to look across ALL their sessions). Cheap join.
  //
  // CRITICAL: the neon-http driver returns MIN(timestamp) aggregates as
  // STRINGS, not Date objects, even though `sql<Date>` types it as Date.
  // Comparing a string with a Date silently coerces both to NaN and returns
  // false for every comparison — which previously made newBeginnings and
  // anniversariesPassed always empty in prod. Normalize to Date at the
  // boundary so everything downstream is safe. The same caution applies
  // anywhere else MIN/MAX(timestamp) is read; the existing codebase already
  // wraps `lastSessionAt`/`nextSessionAt` in `new Date(...)` for this reason.
  const firstSessionRowsRaw = await db
    .select({
      clientId: sessions.clientId,
      clientName: clients.fullName,
      firstAt: sql<Date>`MIN(${sessions.scheduledAt})`.as("firstAt"),
    })
    .from(sessions)
    .innerJoin(clients, eq(sessions.clientId, clients.id))
    .where(
      and(eq(sessions.accountId, accountId), ne(sessions.status, "cancelled"))
    )
    .groupBy(sessions.clientId, clients.fullName);
  const firstSessionRows = firstSessionRowsRaw.map((r) => ({
    clientId: r.clientId,
    clientName: r.clientName,
    firstAt: new Date(r.firstAt),
  }));

  const newBeginnings = firstSessionRows
    .filter((r) => r.firstAt >= yearStart && r.firstAt < yearEnd)
    .sort((a, b) => a.firstAt.getTime() - b.firstAt.getTime());

  // Anniversaries that passed this year — first session in an earlier year,
  // their (month, day) anniversary fell within `year`. Years together = year
  // minus the year of first session. Leap-day note: a Feb 29 first session
  // in a non-leap target year rolls forward to Mar 1 (JS Date semantics),
  // which is a tolerable surprise — better than silently missing the
  // anniversary altogether.
  const anniversariesPassed = firstSessionRows
    .filter((r) => r.firstAt < yearStart) // started before this year
    .map((r) => {
      const fs = r.firstAt;
      const anniv = new Date(year, fs.getMonth(), fs.getDate());
      return {
        clientId: r.clientId,
        clientName: r.clientName,
        yearsTogether: year - fs.getFullYear(),
        date: anniv,
      };
    })
    .filter((r) => r.date >= yearStart && r.date < yearEnd)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    year,
    sessionsHeld,
    clientsSeen,
    totalMinutes,
    monthsActive,
    topThemes,
    milestones: milestoneRows,
    anchorMoments,
    newBeginnings,
    anniversariesPassed,
    monthlyRhythm,
  };
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
