import "server-only";

/**
 * Circles ↔ Google Calendar.
 *
 * Two problems this solves, which turned out to be the same problem:
 *
 *  1. Circles never reached her Google Calendar, so there was no phone
 *     notification and she could book a 1-on-1 straight over one.
 *  2. Guests hit Google's "asking to be let in" wall, because a bare Meet link
 *     shared with strangers always requires the host to admit them.
 *
 * Putting each Circle on the calendar as a real event with its confirmed
 * attendees as real Google invitees fixes both: Google recognises an invited
 * address and lets them walk straight in, and the event shows up on her
 * calendar with its own alerts.
 *
 * It also closes a quieter hole. The standing `circleRoomUrl` never changes and
 * is emailed to every guest, so anyone who ever bought one seat kept a working
 * key to every future Circle. A per-Circle Meet link expires with the session.
 *
 * Everything here is BEST-EFFORT: a Google failure must never break scheduling,
 * a sign-up, or a payment. Callers get a warning string at most.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  groupSessions,
  groupAttendees,
  groups,
  practitionerSettings,
} from "@/db/schema";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "./google-calendar";
import { resolveTimeZone } from "./timezone";

export type CircleSyncResult =
  | { ok: true; meetUrl: string | null; created: boolean }
  | { ok: false; error: string };

/**
 * Create or update the Google Calendar event for a Circle session, with every
 * confirmed attendee on the invite. Idempotent: re-running after a new sign-up
 * patches the same event and Google emails only the newly added guest.
 */
export async function syncCircleToGoogle(
  groupSessionId: string
): Promise<CircleSyncResult> {
  const [row] = await db
    .select({
      id: groupSessions.id,
      accountId: groupSessions.accountId,
      scheduledAt: groupSessions.scheduledAt,
      durationMinutes: groupSessions.durationMinutes,
      status: groupSessions.status,
      googleEventId: groupSessions.googleEventId,
      meetUrl: groupSessions.meetUrl,
      groupName: groups.name,
      groupDescription: groups.description,
      practiceTz: practitionerSettings.timezone,
      practitionerEmail: practitionerSettings.businessEmail,
    })
    .from(groupSessions)
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .leftJoin(
      practitionerSettings,
      eq(practitionerSettings.accountId, groupSessions.accountId)
    )
    .where(eq(groupSessions.id, groupSessionId))
    .limit(1);

  if (!row) return { ok: false, error: "Circle session not found" };
  if (row.status === "cancelled") {
    return { ok: false, error: "Circle is cancelled" };
  }

  // Confirmed guests only — a pending sign-up hasn't been approved yet, and
  // putting them on the invite would hand out the room before she says yes.
  const attendees = await db
    .select({ email: groupAttendees.email })
    .from(groupAttendees)
    .where(
      and(
        eq(groupAttendees.groupSessionId, groupSessionId),
        eq(groupAttendees.status, "confirmed")
      )
    );
  const attendeeEmails = [
    ...new Set(
      attendees
        .map((a) => (a.email ?? "").trim().toLowerCase())
        .filter((e) => e.includes("@"))
    ),
  ];

  const tz = resolveTimeZone(row.practiceTz);
  const input = {
    summary: row.groupName,
    description:
      row.groupDescription?.trim() ||
      `${row.groupName} — a Circle held through Soul Service.`,
    startAt: new Date(row.scheduledAt),
    durationMinutes: row.durationMinutes,
    timeZone: tz,
    attendeeEmails,
    practitionerEmail: row.practitionerEmail,
  };

  try {
    if (row.googleEventId) {
      const updated = await updateCalendarEvent(
        row.accountId,
        row.googleEventId,
        input
      );
      if (updated) {
        await db
          .update(groupSessions)
          .set({
            // Keep whatever Meet link the event carries.
            meetUrl: updated.meetUrl ?? row.meetUrl,
            updatedAt: new Date(),
          })
          .where(eq(groupSessions.id, row.id));
        return { ok: true, meetUrl: updated.meetUrl, created: false };
      }
      // Event vanished on Google's side — clear our ref and fall through to
      // create a fresh one below.
      await db
        .update(groupSessions)
        .set({ googleEventId: null, updatedAt: new Date() })
        .where(eq(groupSessions.id, row.id));
    }

    const created = await createCalendarEvent(row.accountId, input);
    if (!created) {
      // Google isn't connected. Not an error worth shouting about — the app's
      // own emails still carry the standing room link.
      return { ok: false, error: "Google Calendar isn't connected" };
    }
    await db
      .update(groupSessions)
      .set({
        googleEventId: created.eventId,
        meetUrl: created.meetUrl ?? row.meetUrl,
        updatedAt: new Date(),
      })
      .where(eq(groupSessions.id, row.id));
    return { ok: true, meetUrl: created.meetUrl, created: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown Google error";
    console.error(`[circle-google] sync failed for ${groupSessionId}:`, err);
    return { ok: false, error: msg };
  }
}

/** Remove a Circle's calendar event — used when the Circle is cancelled.
 *  Google emails the invitees that it's off, which is what we want. */
export async function removeCircleFromGoogle(
  groupSessionId: string
): Promise<void> {
  const [row] = await db
    .select({
      id: groupSessions.id,
      accountId: groupSessions.accountId,
      googleEventId: groupSessions.googleEventId,
    })
    .from(groupSessions)
    .where(eq(groupSessions.id, groupSessionId))
    .limit(1);
  if (!row?.googleEventId) return;
  try {
    await deleteCalendarEvent(row.accountId, row.googleEventId);
  } catch (err) {
    console.error(`[circle-google] delete failed for ${groupSessionId}:`, err);
  }
  await db
    .update(groupSessions)
    .set({ googleEventId: null, updatedAt: new Date() })
    .where(eq(groupSessions.id, row.id));
}
