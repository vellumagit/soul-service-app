import "server-only";

// Stripe client — lazy-init so the app builds/runs before keys are set.
// The whole Circle-payment pipeline degrades gracefully when Stripe isn't
// configured: isStripeConfigured() is false, the storefront shows only the
// manual (Venmo/cash) lane, and nothing throws.
//
// Two env vars drive it:
//   STRIPE_SECRET_KEY      — sk_live_… / sk_test_…
//   STRIPE_WEBHOOK_SECRET  — whsec_… (verifies /api/webhooks/stripe payloads)

import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to your environment to enable card payments."
    );
  }
  // Pin the API version so behavior is stable across Stripe upgrades.
  // Matches the version the installed SDK ships with.
  _stripe = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
  return _stripe;
}

export function getWebhookSecret(): string {
  const s = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
  }
  return s;
}
