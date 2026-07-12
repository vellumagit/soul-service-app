/**
 * GET /api/integrations/stripe/callback
 *
 * Stripe redirects here with ?code=&state= after the practitioner approves the
 * connection (or ?error= if she declines). We:
 *   1. Validate the state (single-use, 10-min TTL).
 *   2. Confirm the signed-in account matches the account that issued the state.
 *   3. Exchange the code for her connected account id.
 *   4. Save it (+ live capability flags) to her settings.
 *   5. Redirect to /status with a result flag.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/session-cookies";
import { isStripeConnectEnabled } from "@/lib/stripe";
import {
  consumeOAuthState,
  completeOAuth,
  saveConnectedAccount,
} from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://www.svit.live";
}

export async function GET(req: NextRequest) {
  const base = siteUrl();

  if (!isStripeConnectEnabled()) {
    return NextResponse.redirect(`${base}/settings?stripe=disabled`);
  }

  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (error) {
    return NextResponse.redirect(`${base}/settings?stripe=denied`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${base}/settings?stripe=missing_params`);
  }

  // Re-verify the signed-in account matches the one that issued the state.
  const { accountId } = await requireSession();

  let consumed: { accountId: string };
  try {
    consumed = await consumeOAuthState(state);
  } catch {
    return NextResponse.redirect(`${base}/settings?stripe=bad_state`);
  }
  if (consumed.accountId !== accountId) {
    return NextResponse.redirect(`${base}/settings?stripe=identity_mismatch`);
  }

  try {
    const { stripeAccountId } = await completeOAuth(code);
    await saveConnectedAccount({ accountId, stripeAccountId });
  } catch (err) {
    console.error("[stripe connect callback] exchange failed", err);
    return NextResponse.redirect(`${base}/settings?stripe=exchange_failed`);
  }

  return NextResponse.redirect(`${base}/settings?stripe=connected`);
}
