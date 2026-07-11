/**
 * POST /api/integrations/stripe/disconnect
 *
 * Deauthorizes the connected Stripe account and clears the stored id/flags.
 * After this, the storefront falls back to the manual (Venmo/cash) lane until
 * she reconnects.
 */

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session-cookies";
import { isStripeConnectEnabled } from "@/lib/stripe";
import { disconnectAccount } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isStripeConnectEnabled()) {
    return NextResponse.json(
      { error: "Stripe Connect is not configured" },
      { status: 503 }
    );
  }
  const { accountId } = await requireSession();
  await disconnectAccount({ accountId });
  return NextResponse.json({ disconnected: true });
}
