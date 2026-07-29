// What a portal client can see about Circles.
//
// Two questions, two queries:
//   getBookedForClient  → everything they've booked, 1-on-1s AND Circles, merged
//   getOpenCircles      → upcoming Circles they could still join
//
// Matching a Circle signup back to a client: `group_attendees.client_id` is now
// set at signup (see findClientIdByEmail in group-actions.ts), but every row
// created before that shipped has it NULL. So both queries match on
// `client_id OR lower(email)` — the id is authoritative, the email is the
// fallback that keeps history visible.

import "server-only";

import { and, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  sessions,
  groups,
  groupSessions,
  groupAttendees,
  practitionerSettings,
} from "@/db/schema";

/** One upcoming thing in the client's own calendar. */
export type BookedItem = {
  kind: "session" | "circle";
  /** Route to open it — the portal session page, or the public circle page. */
  href: string;
  title: string;
  scheduledAt: Date;
  durationMinutes: number;
  meetUrl: string | null;
  /** Circles only — whether their seat is confirmed or still pending payment. */
  pending?: boolean;
};

export type OpenCircle = {
  groupSessionId: string;
  name: string;
  description: string | null;
  scheduledAt: Date;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  seatsLeft: number;
  language: string;
};

/**
 * Everything the client has booked and hasn't happened yet — their own
 * sessions and any Circle seat they hold — merged and sorted by time.
 *
 * A session counts as still-upcoming through its whole length plus 30 minutes,
 * matching the portal home's late-join window so the two never disagree.
 */
export async function getBookedForClient(
  accountId: string,
  clientId: string,
  clientEmail: string | null
): Promise<BookedItem[]> {
  // No JS `now` here on purpose — both windows below are evaluated by Postgres
  // via now(), so the cutoff can't drift from the server's clock.
  const email = clientEmail?.trim().toLowerCase() ?? null;

  const [sessionRows, circleRows] = await Promise.all([
    db
      .select({
        id: sessions.id,
        scheduledAt: sessions.scheduledAt,
        durationMinutes: sessions.durationMinutes,
        type: sessions.type,
        meetUrl: sessions.meetUrl,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.accountId, accountId),
          eq(sessions.clientId, clientId),
          ne(sessions.status, "cancelled"),
          ne(sessions.status, "no_show"),
          ne(sessions.status, "completed"),
          // Still joinable: start + duration + 30 min tail.
          sql`${sessions.scheduledAt} + make_interval(mins => ${sessions.durationMinutes} + 30) > now()`
        )
      ),
    db
      .select({
        attendeeId: groupAttendees.id,
        status: groupAttendees.status,
        groupSessionId: groupSessions.id,
        scheduledAt: groupSessions.scheduledAt,
        durationMinutes: groupSessions.durationMinutes,
        meetUrl: groupSessions.meetUrl,
        name: groups.name,
      })
      .from(groupAttendees)
      .innerJoin(
        groupSessions,
        eq(groupSessions.id, groupAttendees.groupSessionId)
      )
      .innerJoin(groups, eq(groups.id, groupSessions.groupId))
      .where(
        and(
          eq(groupAttendees.accountId, accountId),
          ne(groupAttendees.status, "cancelled"),
          eq(groupSessions.status, "scheduled"),
          sql`${groupSessions.scheduledAt} + make_interval(mins => ${groupSessions.durationMinutes} + 30) > now()`,
          email
            ? or(
                eq(groupAttendees.clientId, clientId),
                sql`LOWER(${groupAttendees.email}) = ${email}`
              )
            : eq(groupAttendees.clientId, clientId)
        )
      ),
  ]);

  const items: BookedItem[] = [
    ...sessionRows.map((s) => ({
      kind: "session" as const,
      href: `/portal/sessions/${s.id}`,
      title: s.type,
      scheduledAt: new Date(s.scheduledAt),
      durationMinutes: s.durationMinutes,
      meetUrl: s.meetUrl,
    })),
    ...circleRows.map((c) => ({
      kind: "circle" as const,
      href: `/circles/${c.groupSessionId}`,
      title: c.name,
      scheduledAt: new Date(c.scheduledAt),
      durationMinutes: c.durationMinutes,
      meetUrl: c.meetUrl,
      pending: c.status === "pending",
    })),
  ];

  return items.sort(
    (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()
  );
}

/**
 * Upcoming Circles this client could still join — published, scheduled, not
 * full, and not one they're already in. Returns [] when she's switched Circle
 * signups off entirely, so the tab reads as "nothing open" rather than
 * offering a seat that can't be taken.
 */
export async function getOpenCircles(
  accountId: string,
  clientId: string,
  clientEmail: string | null
): Promise<OpenCircle[]> {
  const [settings] = await db
    .select({ signupsOpen: practitionerSettings.circleSignupsOpen })
    .from(practitionerSettings)
    .where(eq(practitionerSettings.accountId, accountId))
    .limit(1);
  if (!settings?.signupsOpen) return [];

  const email = clientEmail?.trim().toLowerCase() ?? null;
  // Literal, fully-qualified SQL. Interpolating Drizzle column objects inside
  // sql`` renders them UNQUALIFIED, so `group_attendees.group_session_id =
  // group_sessions.id` came out as `"group_session_id" = "id"` — both binding
  // to group_attendees, never true, every count 0. Bound values (${clientId},
  // ${email}) are fine: those become real parameters.
  const mineSql = email
    ? sql`(group_attendees.client_id = ${clientId}::uuid OR LOWER(group_attendees.email) = ${email})`
    : sql`(group_attendees.client_id = ${clientId}::uuid)`;

  const rows = await db
    .select({
      groupSessionId: groupSessions.id,
      name: groups.name,
      description: groups.description,
      scheduledAt: groupSessions.scheduledAt,
      durationMinutes: groupSessions.durationMinutes,
      priceCents: groupSessions.priceCents,
      capacity: groupSessions.capacity,
      currency: groups.defaultCurrency,
      language: groups.language,
      taken: sql<number>`(
        SELECT COUNT(*)::int FROM group_attendees
        WHERE group_attendees.group_session_id = group_sessions.id
          AND group_attendees.status <> 'cancelled'
      )`,
      alreadyIn: sql<number>`(
        SELECT COUNT(*)::int FROM group_attendees
        WHERE group_attendees.group_session_id = group_sessions.id
          AND group_attendees.status <> 'cancelled'
          AND ${mineSql}
      )`,
    })
    .from(groupSessions)
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .where(
      and(
        eq(groupSessions.accountId, accountId),
        eq(groupSessions.status, "scheduled"),
        eq(groups.published, true),
        isNull(groups.archivedAt),
        gt(groupSessions.scheduledAt, new Date())
      )
    )
    .orderBy(groupSessions.scheduledAt);

  return rows
    .filter((r) => r.alreadyIn === 0 && r.taken < r.capacity)
    .map((r) => ({
      groupSessionId: r.groupSessionId,
      name: r.name,
      description: r.description,
      scheduledAt: new Date(r.scheduledAt),
      durationMinutes: r.durationMinutes,
      priceCents: r.priceCents,
      currency: r.currency,
      seatsLeft: r.capacity - r.taken,
      language: r.language,
    }));
}
