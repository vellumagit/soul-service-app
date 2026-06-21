"use server";

// Landing-page lead-capture action. Lives on the PUBLIC home page so it
// doesn't require any auth. Routes the submission through the same
// lead_submissions table that /api/leads/intake uses — meaning landing
// leads show up alongside any other channel in /network/inbox.
//
// Anchoring to an account: we resolve the FIRST practitioner_settings
// row (in practice each Soul Service deployment has exactly one
// account). Could be wrapped in an env var later if Brian ever runs
// multi-practitioner from the same deployment.
//
// Anti-abuse: honeypot field (_hp), per-IP rate limit (8/min — generous
// for honest visitors, slow enough to make spray noisy), email
// normalization, basic JSON-bomb-resistant via small captured field
// sizes.

import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  leadForms,
  leadSubmissions,
  practitionerSettings,
} from "@/db/schema";
import { checkRateLimit } from "./rate-limit";
import {
  generateLeadFormToken,
  hashLeadFormToken,
  leadFormTokenPrefix,
} from "./lead-tokens";

const LANDING_FORM_SLUG = "landing-page";

export type LandingLeadResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitLandingLead(
  _prev: LandingLeadResult | undefined,
  formData: FormData
): Promise<LandingLeadResult> {
  // Honeypot — non-empty value means a bot filled the hidden field.
  // Return "ok" so the bot thinks it succeeded; do nothing.
  const honeypot = String(formData.get("_hp") ?? "");
  if (honeypot.trim().length > 0) {
    return { ok: true };
  }

  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  const emailRaw = String(formData.get("email") ?? "").trim();
  const message = String(formData.get("message") ?? "")
    .trim()
    .slice(0, 2000);
  // Optional ISO timestamp from the "available windows" chip picker.
  // Stored as a free-shape field so it appears alongside the inquiry
  // when Svit triages from /network/inbox.
  const preferredWindowIso = String(
    formData.get("preferredWindowIso") ?? ""
  ).trim();

  if (!name) {
    return { ok: false, error: "Please share your name." };
  }
  if (!emailRaw || !emailRaw.includes("@")) {
    return { ok: false, error: "Please share a valid email." };
  }
  const email = emailRaw.toLowerCase().slice(0, 200);

  // Rate-limit per-IP. Honest visitor scenarios send one submission per
  // page; 8/min is plenty. A bot trying to spray gets stalled fast.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = checkRateLimit("landing-lead", ip, {
    limit: 8,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return {
      ok: false,
      error: `Slow down a moment — too many submissions from this connection. Try again in ${limit.retryAfterSeconds}s.`,
    };
  }

  // Resolve the anchor account. Each Soul Service deployment has one
  // practitioner; first row wins. If the deployment ever runs multiple
  // accounts (unlikely), we'd want a LANDING_ACCOUNT_EMAIL env var.
  const settingsRow = await db
    .select({ accountId: practitionerSettings.accountId })
    .from(practitionerSettings)
    .limit(1);
  const accountId = settingsRow[0]?.accountId;
  if (!accountId) {
    return {
      ok: false,
      error: "The practice isn't set up yet. Try again shortly.",
    };
  }

  // Find or create the "landing page" lead form. Idempotent — if a
  // previous submission already created it, reuse the row.
  const existing = await db
    .select({ id: leadForms.id })
    .from(leadForms)
    .where(
      and(
        eq(leadForms.accountId, accountId),
        eq(leadForms.slug, LANDING_FORM_SLUG)
      )
    )
    .limit(1);

  let formId: string;
  if (existing[0]) {
    formId = existing[0].id;
  } else {
    // Generate a real bearer token for the form even though no one will
    // call /api/leads/intake against it — keeps the row consistent with
    // every other lead_forms row, and means Brian can later expose this
    // form to external integrations if he wants.
    const cleartext = generateLeadFormToken();
    const tokenHash = hashLeadFormToken(cleartext);
    const tokenPrefix = leadFormTokenPrefix(cleartext);
    const inserted = await db
      .insert(leadForms)
      .values({
        accountId,
        name: "Landing page",
        slug: LANDING_FORM_SLUG,
        tokenHash,
        tokenPrefix,
        autoAccept: false,
        defaultIntent: "Reached out via the landing page",
      })
      .returning({ id: leadForms.id });
    formId = inserted[0].id;
  }

  const fields: Record<string, unknown> = {};
  if (message) fields.message = message;
  if (preferredWindowIso) fields.preferredWindow = preferredWindowIso;
  await db.insert(leadSubmissions).values({
    accountId,
    formId,
    name,
    email,
    fields,
    sourceIp: ip === "unknown" ? null : ip,
    userAgent: h.get("user-agent") ?? null,
    referer: h.get("referer") ?? null,
    status: "pending",
  });

  return { ok: true };
}
