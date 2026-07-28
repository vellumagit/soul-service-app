"use server";

// Card payment for a 1-on-1 session, initiated by the CLIENT from
// /portal/billing. Mirrors createCircleCheckout: a DIRECT charge on her
// connected Stripe account, so she's the merchant of record and the money is
// 100% hers. The webhook — not the success redirect — is what marks it paid.
//
// EVERY export here is a public POST endpoint ("use server" does that), so the
// only argument taken is a session id and ownership is re-verified against the
// portal cookie before anything happens. A caller who guesses another client's
// session id gets the same generic error as a nonexistent one.

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { sessions, practitionerSettings } from "@/db/schema";
import { requirePortalSession } from "./portal-auth";
import { getStripe, isStripeConfigured } from "./stripe";
import { checkRateLimit } from "./rate-limit";
import { safeCurrency } from "./format";
import { fullDate } from "./format";
import { getPortalTimeZone } from "./portal-timezone";

export type PortalCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** Generic, non-enumerating failure — never reveals whether the id exists. */
const UNAVAILABLE =
  "This session isn't available to pay for right now. Refresh and try again.";

export async function createSessionPaymentCheckout(
  sessionId: string
): Promise<PortalCheckoutResult> {
  if (!isStripeConfigured()) {
    return {
      ok: false,
      error: "Card payment isn't set up yet — see the payment note above.",
    };
  }
  const id = String(sessionId ?? "");
  if (!id) return { ok: false, error: UNAVAILABLE };

  const portal = await requirePortalSession();

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = checkRateLimit("portal-pay", `${portal.clientId}:${ip}`, {
    limit: 6,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return {
      ok: false,
      error: `Slow down a moment. Try again in ${limit.retryAfterSeconds}s.`,
    };
  }

  // Ownership + payability in one query, scoped to BOTH the account and the
  // client on the portal cookie.
  const [row] = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      paid: sessions.paid,
      amountCents: sessions.paymentAmountCents,
      scheduledAt: sessions.scheduledAt,
      type: sessions.type,
      existingCheckoutId: sessions.stripeCheckoutSessionId,
      currency: practitionerSettings.defaultCurrency,
      practitionerName: practitionerSettings.practitionerName,
      stripeAccountId: practitionerSettings.stripeAccountId,
      stripeChargesEnabled: practitionerSettings.stripeChargesEnabled,
    })
    .from(sessions)
    .leftJoin(
      practitionerSettings,
      eq(practitionerSettings.accountId, sessions.accountId)
    )
    .where(
      and(
        eq(sessions.id, id),
        eq(sessions.accountId, portal.accountId),
        eq(sessions.clientId, portal.clientId)
      )
    )
    .limit(1);

  if (!row) return { ok: false, error: UNAVAILABLE };
  if (row.paid) {
    return { ok: false, error: "This session is already marked paid." };
  }
  if (row.status !== "completed") {
    return {
      ok: false,
      error: "Only sessions that have already happened can be paid for here.",
    };
  }
  if (!row.amountCents || row.amountCents <= 0) {
    return {
      ok: false,
      error: "No amount has been set for this session yet.",
    };
  }
  // She must have connected Stripe AND finished activation. Until then the
  // Pay button isn't rendered at all — this is belt and suspenders.
  if (!row.stripeAccountId || !row.stripeChargesEnabled) {
    return {
      ok: false,
      error: "Card payment isn't set up yet — see the payment note above.",
    };
  }
  const connectedAccountId = row.stripeAccountId;

  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost"}`;

  const { timeZone } = await getPortalTimeZone(
    portal.accountId,
    portal.clientId
  );
  const whenLabel = fullDate(new Date(row.scheduledAt), timeZone);
  const withName = row.practitionerName
    ? ` with ${row.practitionerName}`
    : "";

  try {
    const stripe = getStripe();

    // Kill any previous link for this session first, so a client who clicks
    // Pay twice can't end up holding two payable checkouts for one session.
    if (row.existingCheckoutId) {
      try {
        await stripe.checkout.sessions.expire(
          row.existingCheckoutId,
          undefined,
          { stripeAccount: connectedAccountId }
        );
      } catch {
        // Already expired or completed — either way the paid=false guard in
        // the webhook keeps a straggler completion idempotent.
      }
    }

    const checkout = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: portal.clientEmail ?? undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: safeCurrency(row.currency ?? "USD").toLowerCase(),
              unit_amount: row.amountCents,
              product_data: {
                name: `${row.type}${withName} — ${whenLabel}`,
              },
            },
          },
        ],
        metadata: {
          kind: "session-payment",
          sessionId: row.id,
          accountId: portal.accountId,
        },
        payment_intent_data: {
          metadata: { kind: "session-payment", sessionId: row.id },
        },
        success_url: `${base}/portal/billing?paid=1`,
        cancel_url: `${base}/portal/billing?canceled=1`,
      },
      // DIRECT charge on her account — same posture as Circle seats.
      { stripeAccount: connectedAccountId }
    );

    await db
      .update(sessions)
      .set({ stripeCheckoutSessionId: checkout.id, updatedAt: new Date() })
      .where(eq(sessions.id, row.id));

    if (!checkout.url) {
      return { ok: false, error: "Couldn't open checkout. Please try again." };
    }
    return { ok: true, url: checkout.url };
  } catch (err) {
    console.error("[portal] session payment checkout failed", err);
    return { ok: false, error: "Couldn't open checkout. Please try again." };
  }
}
