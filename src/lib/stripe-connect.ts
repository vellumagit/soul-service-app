import "server-only";

/**
 * Stripe Connect (Standard accounts + OAuth) for Soul Service.
 *
 * Ports the proven CleanOps flow to Drizzle/Neon + this app's single-
 * practitioner auth. The practitioner clicks "Connect with Stripe" once;
 * Stripe's hosted flow walks her through sign-in + bank/identity activation;
 * we store only her connected account id (`acct_…`) + cached capability flags.
 *
 * Charge model: DIRECT charges. Circle checkout sessions are created ON her
 * connected account (`{ stripeAccount }`), so she is the merchant of record,
 * sees the charges natively, pays Stripe's fee, and keeps 100% of the money.
 * There is no platform application fee. Because the charge lives on the
 * connected account, the webhook at /api/webhooks/stripe must be registered
 * as a Connect webhook (events on connected accounts) — verification is
 * unchanged (platform signing secret), and we route by our own metadata.
 *
 * Security:
 *   - OAuth uses a single-use CSRF state (`stripe_oauth_states`), 10-min TTL,
 *     scoped to the account that issued it.
 *   - The callback re-verifies that the signed-in account matches the account
 *     the state was issued to before writing anything.
 *   - Connect is gated on isStripeConnectEnabled() (platform key + client id).
 */

import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitionerSettings, stripeOauthStates } from "@/db/schema";
import { getStripe, isStripeConnectEnabled } from "@/lib/stripe";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Generate a one-time CSRF state and persist it (10-min TTL). */
export async function issueOAuthState(args: {
  accountId: string;
}): Promise<string> {
  const state = randomBytes(32).toString("base64url");
  await db.insert(stripeOauthStates).values({
    state,
    accountId: args.accountId,
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
  });
  return state;
}

/**
 * Build the Stripe Connect OAuth authorize URL. Returns null if Connect isn't
 * configured, so callers can degrade gracefully instead of rendering a broken
 * link.
 */
export function buildOAuthUrl(args: {
  state: string;
  redirectUri: string;
}): string | null {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  if (!clientId) return null;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "read_write",
    state: args.state,
    redirect_uri: args.redirectUri,
  });
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

/**
 * Atomically consume a state token and return the account it was issued to.
 * DELETE ... RETURNING makes it single-use even under a double-click. Throws
 * if the state is unknown or expired.
 */
export async function consumeOAuthState(
  state: string
): Promise<{ accountId: string }> {
  const [row] = await db
    .delete(stripeOauthStates)
    .where(eq(stripeOauthStates.state, state))
    .returning({
      accountId: stripeOauthStates.accountId,
      expiresAt: stripeOauthStates.expiresAt,
    });

  if (!row) throw new Error("Unknown OAuth state");
  if (new Date(row.expiresAt) < new Date()) {
    throw new Error("OAuth state expired");
  }
  return { accountId: row.accountId };
}

/**
 * Exchange an authorization code for a connected account id (`acct_…`).
 */
export async function completeOAuth(
  code: string
): Promise<{ stripeAccountId: string }> {
  if (!isStripeConnectEnabled()) {
    throw new Error("Stripe Connect is not configured");
  }
  const stripe = getStripe();
  const response = await stripe.oauth.token({
    grant_type: "authorization_code",
    code,
  });
  if (!response.stripe_user_id) {
    throw new Error("Stripe did not return a connected account id");
  }
  return { stripeAccountId: response.stripe_user_id };
}

/**
 * Persist a connected account to the practitioner's settings, pulling live
 * capability flags so the UI immediately reflects whether she can take cards.
 * Upsert so it works even if the settings row doesn't exist yet.
 */
export async function saveConnectedAccount(args: {
  accountId: string;
  stripeAccountId: string;
}): Promise<void> {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(args.stripeAccountId);
  const now = new Date();

  const values = {
    stripeAccountId: account.id,
    stripeAccountType: account.type ?? null,
    stripeChargesEnabled: Boolean(account.charges_enabled),
    stripePayoutsEnabled: Boolean(account.payouts_enabled),
    stripeDetailsSubmitted: Boolean(account.details_submitted),
    stripeConnectedAt: now,
    stripeDisconnectedAt: null,
    updatedAt: now,
  };

  await db
    .insert(practitionerSettings)
    .values({ accountId: args.accountId, ...values })
    .onConflictDoUpdate({
      target: practitionerSettings.accountId,
      set: values,
    });
}

/**
 * Disconnect: deauthorize on Stripe's side (best-effort) AND clear our row.
 * If Stripe says it's already revoked, we still clear locally.
 */
export async function disconnectAccount(args: {
  accountId: string;
}): Promise<void> {
  const [row] = await db
    .select({ stripeAccountId: practitionerSettings.stripeAccountId })
    .from(practitionerSettings)
    .where(eq(practitionerSettings.accountId, args.accountId))
    .limit(1);

  const stripeAccountId = row?.stripeAccountId ?? null;
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;

  if (stripeAccountId && clientId) {
    try {
      const stripe = getStripe();
      await stripe.oauth.deauthorize({
        client_id: clientId,
        stripe_user_id: stripeAccountId,
      });
    } catch {
      // Swallow — she may have already revoked access from her Stripe dash.
    }
  }

  await db
    .update(practitionerSettings)
    .set({
      stripeAccountId: null,
      stripeAccountType: null,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeDetailsSubmitted: false,
      stripeDisconnectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(practitionerSettings.accountId, args.accountId));
}

/**
 * Clear a connected account by its Stripe id. Used when Stripe tells us the
 * merchant revoked access from THEIR own dashboard
 * (`account.application.deauthorized`) — so our DB stops advertising a card
 * lane that would otherwise fail at checkout time. Mirrors disconnectAccount's
 * clearing, but keyed on the Stripe account id (the webhook doesn't know our
 * accountId).
 */
export async function clearConnectedAccountByStripeId(
  stripeAccountId: string
): Promise<void> {
  await db
    .update(practitionerSettings)
    .set({
      stripeAccountId: null,
      stripeAccountType: null,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeDetailsSubmitted: false,
      stripeDisconnectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(practitionerSettings.stripeAccountId, stripeAccountId));
}

/**
 * Refresh cached capability flags from an `account.updated` webhook so the
 * storefront flips from "manual only" to "pay by card" the moment she finishes
 * Stripe's activation (bank + identity).
 */
export async function applyAccountUpdate(
  account: Stripe.Account
): Promise<void> {
  await db
    .update(practitionerSettings)
    .set({
      stripeChargesEnabled: Boolean(account.charges_enabled),
      stripePayoutsEnabled: Boolean(account.payouts_enabled),
      stripeDetailsSubmitted: Boolean(account.details_submitted),
      updatedAt: new Date(),
    })
    .where(eq(practitionerSettings.stripeAccountId, account.id));
}
