import "server-only";

// Shared Circle-seat fulfillment. Called from BOTH:
//   - the Stripe webhook (card payment confirmed), and
//   - the manual "Mark paid + Confirm" action (Venmo/cash lane).
// So both lanes send the same welcome email.
//
// Idempotent: welcome_sent_at is claimed atomically (UPDATE ... WHERE
// welcome_sent_at IS NULL) before the email goes out, so Stripe webhook
// retries / double-confirms never double-send. On send failure the claim
// is released so a later retry can try again.

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { groupAttendees, groupSessions, groups, practitionerSettings } from "@/db/schema";
import { sendCircleWelcomeEmail } from "./resend";

/** Resolve the meeting link for a circle: the session's own meet_url wins,
 *  else the practitioner's standing circle room link. */
export function resolveCircleMeetingUrl(
  sessionMeetUrl: string | null,
  circleRoomUrl: string | null
): string | null {
  return sessionMeetUrl?.trim() || circleRoomUrl?.trim() || null;
}

function formatWhen(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export async function fulfillCircleSeat(
  attendeeId: string
): Promise<{ sent: boolean }> {
  const [row] = await db
    .select({
      id: groupAttendees.id,
      accountId: groupAttendees.accountId,
      name: groupAttendees.name,
      email: groupAttendees.email,
      welcomeSentAt: groupAttendees.welcomeSentAt,
      scheduledAt: groupSessions.scheduledAt,
      sessionMeetUrl: groupSessions.meetUrl,
      groupName: groups.name,
      paymentInstructions: groups.paymentInstructions,
    })
    .from(groupAttendees)
    .innerJoin(groupSessions, eq(groupSessions.id, groupAttendees.groupSessionId))
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .where(eq(groupAttendees.id, attendeeId))
    .limit(1);

  if (!row) return { sent: false };
  if (row.welcomeSentAt) return { sent: false }; // already fulfilled
  if (!row.email || !row.email.includes("@")) return { sent: false };

  const [settings] = await db
    .select({
      circleRoomUrl: practitionerSettings.circleRoomUrl,
      practitionerName: practitionerSettings.practitionerName,
    })
    .from(practitionerSettings)
    .where(eq(practitionerSettings.accountId, row.accountId))
    .limit(1);

  const meetingUrl = resolveCircleMeetingUrl(
    row.sessionMeetUrl,
    settings?.circleRoomUrl ?? null
  );

  // Atomically claim the welcome send so retries / concurrent confirms
  // don't double-send.
  const now = new Date();
  const claimed = await db
    .update(groupAttendees)
    .set({ welcomeSentAt: now, updatedAt: now })
    .where(
      and(
        eq(groupAttendees.id, attendeeId),
        isNull(groupAttendees.welcomeSentAt)
      )
    )
    .returning({ id: groupAttendees.id });
  if (claimed.length === 0) return { sent: false };

  try {
    await sendCircleWelcomeEmail({
      to: row.email,
      attendeeName: row.name,
      circleName: row.groupName,
      whenLabel: formatWhen(new Date(row.scheduledAt)),
      meetingUrl,
      practitionerName: settings?.practitionerName ?? null,
      note: row.paymentInstructions
        ? null // payment already handled; don't show pay instructions in welcome
        : null,
    });
    return { sent: true };
  } catch (err) {
    // Release the claim so a later retry can re-attempt.
    await db
      .update(groupAttendees)
      .set({ welcomeSentAt: null })
      .where(eq(groupAttendees.id, attendeeId));
    console.error("[circle] welcome email failed for", attendeeId, err);
    return { sent: false };
  }
}
