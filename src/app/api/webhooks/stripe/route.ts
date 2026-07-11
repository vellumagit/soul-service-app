// POST /api/webhooks/stripe
//
// Source of truth for "a Circle seat was paid." Stripe redirects can be
// abandoned or spoofed; the webhook is the trustworthy signal.
//
// Events handled:
//   - checkout.session.completed → mark the held attendee paid + confirmed,
//     store the payment intent, then fulfill (welcome email). Idempotent.
//   - checkout.session.expired   → release the held seat (cancel the row).
//
// Auth: Stripe signature over the raw request body, verified with
// STRIPE_WEBHOOK_SECRET. The raw body MUST be read with req.text() — any
// JSON re-serialization breaks signature verification.

import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { groupAttendees } from "@/db/schema";
import { getStripe, getWebhookSecret, isStripeConfigured } from "@/lib/stripe";
import { fulfillCircleSeat } from "@/lib/circle-fulfillment";
import {
  applyAccountUpdate,
  clearConnectedAccountByStripeId,
} from "@/lib/stripe-connect";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
      const attendeeId = session.metadata?.attendeeId;
      if (!attendeeId) {
        return NextResponse.json({ ok: true, ignored: "no attendeeId" });
      }
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);

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

      // Whether or not we flipped it (it may already be paid from a prior
      // retry), run fulfillment — it's idempotent via welcome_sent_at and
      // safely no-ops if the welcome already went out.
      await fulfillCircleSeat(attendeeId);

      return NextResponse.json({ ok: true, flipped: flipped.length > 0 });
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
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
