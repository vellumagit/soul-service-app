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

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  groupAttendees,
  groupSessions,
  groups,
  practitionerSettings,
  clients,
} from "@/db/schema";
import { sendCircleWelcomeEmail, sendCircleRefundEmail } from "./resend";
import { formatSessionLong, resolveTimeZone } from "./timezone";

/** Resolve the meeting link for a circle: the session's own meet_url wins,
 *  else the practitioner's standing circle room link. */
export function resolveCircleMeetingUrl(
  sessionMeetUrl: string | null,
  circleRoomUrl: string | null
): string | null {
  return sessionMeetUrl?.trim() || circleRoomUrl?.trim() || null;
}

/**
 * Circle → 1-on-1 pipeline: auto-add a confirmed Circle attendee to her Network
 * as a lead, so the Circle actually feeds her practice instead of stranding
 * names inside the group. Tagged with the Circle + date via `howTheyFoundMe`
 * so she knows where they came from.
 *
 * Idempotent + deduped by email: if a client OR lead with that email already
 * exists (an existing 1-on-1 client, or someone who came through a prior
 * Circle), we skip entirely — never a duplicate, never downgrading an existing
 * client back to a lead. Best-effort by design; the caller wraps it so a hiccup
 * here can't block the welcome email.
 */
export async function convertAttendeeToLead(
  attendeeId: string
): Promise<void> {
  const [row] = await db
    .select({
      accountId: groupAttendees.accountId,
      name: groupAttendees.name,
      email: groupAttendees.email,
      phone: groupAttendees.phone,
      groupName: groups.name,
      scheduledAt: groupSessions.scheduledAt,
    })
    .from(groupAttendees)
    .innerJoin(
      groupSessions,
      eq(groupSessions.id, groupAttendees.groupSessionId)
    )
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .where(eq(groupAttendees.id, attendeeId))
    .limit(1);
  if (!row) return;

  const email = (row.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return; // no email → can't dedupe / follow up

  // Dedupe against ANY existing client or lead for this account, by email.
  const [existing] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.accountId, row.accountId),
        sql`LOWER(${clients.email}) = ${email}`
      )
    )
    .limit(1);
  if (existing) return; // already known — don't duplicate or downgrade

  const when = new Date(row.scheduledAt);
  const dateLabel = when.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  await db.insert(clients).values({
    accountId: row.accountId,
    fullName: row.name?.trim() || email,
    email,
    phone: row.phone ?? null,
    isLead: true,
    status: "new",
    howTheyFoundMe: `Circle · ${row.groupName} (${dateLabel})`,
    metOn: when.toISOString().slice(0, 10), // YYYY-MM-DD
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
      timezone: practitionerSettings.timezone,
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

  // Feed the Circle → 1-on-1 pipeline. Runs for the single winner of the
  // welcome-claim above, so it can't race; best-effort so a lead-creation
  // hiccup never blocks the welcome email. Idempotent + deduped inside.
  try {
    await convertAttendeeToLead(attendeeId);
  } catch (err) {
    console.error("[circle] lead conversion failed for", attendeeId, err);
  }

  try {
    await sendCircleWelcomeEmail({
      to: row.email,
      attendeeName: row.name,
      circleName: row.groupName,
      whenLabel: formatSessionLong(
        new Date(row.scheduledAt),
        resolveTimeZone(settings?.timezone)
      ),
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

/**
 * Refund → seat-release pipeline. Called from the Stripe webhook when a FULL
 * refund fires (charge.refunded). Finds the attendee by the payment intent we
 * stored at checkout, frees the seat (status → cancelled) + stamps refunded_at,
 * and emails them a short confirmation.
 *
 * Idempotent: the release is claimed atomically (UPDATE ... WHERE refunded_at
 * IS NULL), so Stripe's webhook retries / duplicate events never double-process
 * or re-send the email. Safe no-op for manual (non-Stripe) seats — those have
 * no payment intent to match.
 */
export async function refundCircleSeatByPaymentIntent(
  paymentIntentId: string
): Promise<{ refunded: boolean }> {
  if (!paymentIntentId) return { refunded: false };

  // Find the attendee (+ details for the email) by the Stripe PI stored at
  // checkout. If none matches, it wasn't one of ours — nothing to do.
  const [row] = await db
    .select({
      id: groupAttendees.id,
      accountId: groupAttendees.accountId,
      name: groupAttendees.name,
      email: groupAttendees.email,
      refundedAt: groupAttendees.refundedAt,
      scheduledAt: groupSessions.scheduledAt,
      groupName: groups.name,
    })
    .from(groupAttendees)
    .innerJoin(
      groupSessions,
      eq(groupSessions.id, groupAttendees.groupSessionId)
    )
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .where(eq(groupAttendees.stripePaymentIntentId, paymentIntentId))
    .limit(1);
  if (!row) return { refunded: false };
  if (row.refundedAt) return { refunded: false }; // already handled

  // Atomically claim the refund + free the seat. WHERE refunded_at IS NULL so
  // concurrent / retried webhook deliveries can't double-process or re-email.
  const now = new Date();
  const claimed = await db
    .update(groupAttendees)
    .set({ refundedAt: now, status: "cancelled", updatedAt: now })
    .where(
      and(
        eq(groupAttendees.stripePaymentIntentId, paymentIntentId),
        isNull(groupAttendees.refundedAt)
      )
    )
    .returning({ id: groupAttendees.id });
  if (claimed.length === 0) return { refunded: false };

  // Practice tz + name for the email (best-effort — never block the release).
  const [settings] = await db
    .select({
      timezone: practitionerSettings.timezone,
      practitionerName: practitionerSettings.practitionerName,
    })
    .from(practitionerSettings)
    .where(eq(practitionerSettings.accountId, row.accountId))
    .limit(1);

  try {
    if (row.email && row.email.includes("@")) {
      await sendCircleRefundEmail({
        to: row.email,
        attendeeName: row.name,
        circleName: row.groupName,
        whenLabel: formatSessionLong(
          new Date(row.scheduledAt),
          resolveTimeZone(settings?.timezone)
        ),
        practitionerName: settings?.practitionerName ?? null,
      });
    }
  } catch (err) {
    console.error("[circle] refund email failed for", row.id, err);
  }

  return { refunded: true };
}
