// POST /api/webhooks/stripe
//
// Source of truth for "a Circle seat was paid." Stripe redirects can be
// abandoned or spoofed; the webhook is the trustworthy signal.
//
// Events handled:
//   - checkout.session.completed → mark the held attendee paid + confirmed,
//     store the payment intent, then fulfill (welcome email). Idempotent.
//   - checkout.session.expired   → release the held seat (cancel the row).
//   - charge.refunded (full)     → release the seat + stamp refunded_at +
//     email the attendee a refund confirmation. Idempotent.
//
// Auth: Stripe signature over the raw request body, verified with
// STRIPE_WEBHOOK_SECRET. The raw body MUST be read with req.text() — any
// JSON re-serialization breaks signature verification.

import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import {
  groupAttendees,
  groupSessions,
  practitionerSettings,
  sessions,
} from "@/db/schema";
import { getStripe, getWebhookSecret, isStripeConfigured } from "@/lib/stripe";
import {
  fulfillCircleSeat,
  refundCircleSeatByPaymentIntent,
} from "@/lib/circle-fulfillment";
import {
  applyAccountUpdate,
  clearConnectedAccountByStripeId,
} from "@/lib/stripe-connect";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A client paid for a 1-on-1 session by card from /portal/billing.
 *
 * Same discipline as the Circle-seat path: verify the event fired on the same
 * connected account that owns the session (metadata is writable by whoever
 * created the Checkout, so it can't be trusted on its own), then flip to paid
 * only if it isn't already — which makes Stripe's retries idempotent.
 */
async function handleSessionPayment(
  sessionId: string | null,
  paymentIntentId: string | null,
  eventAccount: string | null
): Promise<Response> {
  if (!sessionId) {
    return NextResponse.json({ ok: true, ignored: "no sessionId" });
  }

  const [row] = await db
    .select({
      id: sessions.id,
      paid: sessions.paid,
      stripeAccountId: practitionerSettings.stripeAccountId,
    })
    .from(sessions)
    .leftJoin(
      practitionerSettings,
      eq(practitionerSettings.accountId, sessions.accountId)
    )
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ ok: true, ignored: "unknown session" });
  }
  if (eventAccount && eventAccount !== row.stripeAccountId) {
    console.error(
      `[stripe webhook] account mismatch for session ${sessionId}: event on ${eventAccount}, expected ${row.stripeAccountId}`
    );
    return NextResponse.json({ ok: true, ignored: "account mismatch" });
  }

  // paid_at is a DATE column (no time, no zone) — store the calendar day the
  // same way every other payment path in the app does.
  const flipped = await db
    .update(sessions)
    .set({
      paid: true,
      paidAt: new Date().toISOString().slice(0, 10),
      paymentMethod: "stripe",
      stripePaymentIntentId: paymentIntentId,
      updatedAt: new Date(),
    })
    .where(and(eq(sessions.id, sessionId), eq(sessions.paid, false)))
    .returning({ id: sessions.id });

  // Already paid — she may have marked the Venmo lane settled while a card
  // checkout was still open. Record the payment intent anyway so the second
  // charge is visible in-app and can be refunded from her Stripe dashboard.
  if (flipped.length === 0 && paymentIntentId) {
    const stamped = await db
      .update(sessions)
      .set({ stripePaymentIntentId: paymentIntentId, updatedAt: new Date() })
      .where(
        and(
          eq(sessions.id, sessionId),
          isNull(sessions.stripePaymentIntentId)
        )
      )
      .returning({ id: sessions.id });
    if (stamped.length > 0) {
      console.error(
        `[stripe webhook] card payment landed on an ALREADY-PAID session (${sessionId}) — PI stored; likely a double payment to review`
      );
    }
  }

  return NextResponse.json({ ok: true, flipped: flipped.length > 0 });
}

export async function POST(req: Request): Promise<Response> {
  if (!isStripeConfigured()) {
    // Dormant until keys are set — don't 500, just acknowledge.
    return NextResponse.json({ ok: false, error: "stripe not configured" }, { status: 200 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ ok: false, error: "missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, getWebhookSecret());
  } catch (err) {
    console.error("[stripe webhook] signature verification failed:", err);
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      // Only act on paid sessions.
      if (session.payment_status !== "paid") {
        return NextResponse.json({ ok: true, ignored: "not paid yet" });
      }
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);

      // A client paid for a 1-on-1 session from /portal/billing. Distinct
      // shape from a Circle seat: no attendee row, the money settles a
      // `sessions` row instead.
      if (session.metadata?.kind === "session-payment") {
        return await handleSessionPayment(
          session.metadata?.sessionId ?? null,
          paymentIntentId,
          event.account ?? null
        );
      }

      const attendeeId = session.metadata?.attendeeId;
      if (!attendeeId) {
        return NextResponse.json({ ok: true, ignored: "no attendeeId" });
      }

      // The metadata names an attendee, but metadata is writable by whoever
      // created the Checkout Session. Verify the event fired on the SAME
      // connected account that attendee's practitioner owns — otherwise any
      // other connected account could mark a foreign seat paid with a
      // $0.50 session of their own.
      const [att] = await db
        .select({
          id: groupAttendees.id,
          sessionStatus: groupSessions.status,
          stripeAccountId: practitionerSettings.stripeAccountId,
        })
        .from(groupAttendees)
        .innerJoin(
          groupSessions,
          eq(groupSessions.id, groupAttendees.groupSessionId)
        )
        .leftJoin(
          practitionerSettings,
          eq(practitionerSettings.accountId, groupAttendees.accountId)
        )
        .where(eq(groupAttendees.id, attendeeId))
        .limit(1);
      if (!att) {
        return NextResponse.json({ ok: true, ignored: "unknown attendee" });
      }
      if (event.account && event.account !== att.stripeAccountId) {
        console.error(
          `[stripe webhook] account mismatch for attendee ${attendeeId}: event on ${event.account}, expected ${att.stripeAccountId}`
        );
        return NextResponse.json({ ok: true, ignored: "account mismatch" });
      }

      // Mark paid + confirmed, but only if not already paid (idempotent
      // against Stripe's retries). RETURNING tells us if we were the one
      // to flip it.
      const flipped = await db
        .update(groupAttendees)
        .set({
          paid: true,
          paidAt: new Date(),
          status: "confirmed",
          paymentMethod: "stripe",
          stripePaymentIntentId: paymentIntentId,
          updatedAt: new Date(),
        })
        .where(
          and(eq(groupAttendees.id, attendeeId), eq(groupAttendees.paid, false))
        )
        .returning({ id: groupAttendees.id });

      // Already paid (e.g. she marked the Venmo lane paid while a card
      // checkout was in flight)? Still record the payment intent if we have
      // none — otherwise the second charge is invisible in-app and can never
      // be refunded from Requests.
      if (flipped.length === 0 && paymentIntentId) {
        const stamped = await db
          .update(groupAttendees)
          .set({ stripePaymentIntentId: paymentIntentId, updatedAt: new Date() })
          .where(
            and(
              eq(groupAttendees.id, attendeeId),
              isNull(groupAttendees.stripePaymentIntentId)
            )
          )
          .returning({ id: groupAttendees.id });
        if (stamped.length > 0) {
          console.error(
            `[stripe webhook] card payment landed on an ALREADY-PAID seat (attendee ${attendeeId}) — PI stored; likely a double payment to review`
          );
        }
      }

      // Paid for a session that was cancelled while checkout was open:
      // don't confirm or send a welcome for a dead session — queue the
      // refund for her one-tap approval instead.
      if (att.sessionStatus === "cancelled") {
        await db
          .update(groupAttendees)
          .set({ refundRequestedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(groupAttendees.id, attendeeId),
              isNull(groupAttendees.refundRequestedAt)
            )
          );
        console.error(
          `[stripe webhook] payment completed for a CANCELLED circle session — refund queued (attendee ${attendeeId})`
        );
        return NextResponse.json({ ok: true, refundQueued: true });
      }

      // Whether or not we flipped it (it may already be paid from a prior
      // retry), run fulfillment — it's idempotent via welcome_sent_at and
      // safely no-ops if the welcome already went out.
      await fulfillCircleSeat(attendeeId);

      return NextResponse.json({ ok: true, flipped: flipped.length > 0 });
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;

      // Session payment link went stale — drop the stored checkout id so the
      // next Pay click doesn't waste a call trying to expire a dead session.
      if (session.metadata?.kind === "session-payment") {
        const sid = session.metadata?.sessionId;
        if (sid) {
          await db
            .update(sessions)
            .set({ stripeCheckoutSessionId: null, updatedAt: new Date() })
            .where(
              and(
                eq(sessions.id, sid),
                eq(sessions.stripeCheckoutSessionId, session.id),
                eq(sessions.paid, false)
              )
            );
        }
        return NextResponse.json({ ok: true, released: "session-payment" });
      }

      const attendeeId = session.metadata?.attendeeId;
      if (attendeeId) {
        // Release the held seat — only if it never got paid.
        await db
          .update(groupAttendees)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(
            and(
              eq(groupAttendees.id, attendeeId),
              eq(groupAttendees.paid, false),
              isNull(groupAttendees.welcomeSentAt)
            )
          );
      }
      return NextResponse.json({ ok: true, released: true });
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      // Only act on a FULL refund — `refunded` is true only when the whole
      // charge is refunded. A partial refund leaves the seat intact.
      if (!charge.refunded) {
        return NextResponse.json({ ok: true, ignored: "partial refund" });
      }
      const pi =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : (charge.payment_intent?.id ?? null);
      if (!pi) {
        return NextResponse.json({ ok: true, ignored: "no payment_intent" });
      }
      const res = await refundCircleSeatByPaymentIntent(pi);
      return NextResponse.json({ ok: true, refunded: res.refunded });
    }

    if (event.type === "account.updated") {
      // Connect event: her account's capabilities changed (e.g. she finished
      // bank/identity activation). Refresh the cached charges/payouts flags so
      // the storefront flips to the card lane automatically.
      const account = event.data.object as Stripe.Account;
      await applyAccountUpdate(account);
      return NextResponse.json({ ok: true, accountUpdated: account.id });
    }

    if (event.type === "account.application.deauthorized") {
      // She revoked access from her OWN Stripe dashboard (not our Disconnect
      // button). Clear her connect fields so the storefront falls back to the
      // manual lane instead of failing at checkout. The connected account id
      // rides on the event's top-level `account`, not in data.object.
      const acct = event.account ?? null;
      if (acct) await clearConnectedAccountByStripeId(acct);
      return NextResponse.json({ ok: true, deauthorized: acct });
    }

    // Unhandled event types are fine — acknowledge so Stripe stops retrying.
    return NextResponse.json({ ok: true, ignored: event.type });
  } catch (err) {
    console.error("[stripe webhook] handler error:", err);
    // 500 → Stripe will retry, which is what we want for transient failures.
    return NextResponse.json({ ok: false, error: "handler error" }, { status: 500 });
  }
}
