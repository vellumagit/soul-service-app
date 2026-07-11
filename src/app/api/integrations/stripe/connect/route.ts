/**
 * GET /api/integrations/stripe/connect
 *
 * Kicks off the Stripe Connect OAuth flow: issues a one-time CSRF state bound
 * to the signed-in account, then redirects to Stripe's hosted consent screen.
 * The practitioner approves once; Stripe handles her sign-in + bank/identity
 * activation and redirects back to /callback.
 *
 * Auth: the proxy already requires a practitioner session for /api/integrations/*;
 * we re-resolve it here so the state is bound to the right account.
 */

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session-cookies";
import { isStripeConnectEnabled } from "@/lib/stripe";
import { issueOAuthState, buildOAuthUrl } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function siteUrl(): string {
  // Must be the canonical www host — Stripe redirects here and the practitioner
  // session cookie lives on www.svit.live. This exact URI must also be
  // whitelisted in the Connect app's OAuth redirect settings.
  return process.env.NEXT_PUBLIC_SITE_URL || "https://www.svit.live";
}

export async function GET() {
  if (!isStripeConnectEnabled()) {
    return NextResponse.redirect(`${siteUrl()}/status?stripe=disabled`);
  }

  const { accountId } = await requireSession();
  const state = await issueOAuthState({ accountId });

  const url = buildOAuthUrl({
    state,
    redirectUri: `${siteUrl()}/api/integrations/stripe/callback`,
  });
  if (!url) {
    return NextResponse.redirect(`${siteUrl()}/status?stripe=disabled`);
  }
  return NextResponse.redirect(url);
}
