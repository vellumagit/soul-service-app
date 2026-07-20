"use server";

// Quiz workbook opt-in. Public (no auth) — called after someone finishes the
// "Find your compass" quiz and asks for the workbook. Routes through the same
// lead_submissions table the landing form + /api/leads/intake use, so quiz
// leads land in /network/inbox alongside every other channel — tagged with the
// result they landed on ("Quiz · <state>") so Svit sees where they placed
// themselves. Mirrors submitLandingLead's anti-abuse (honeypot + per-IP rate
// limit + email normalization + deterministic account anchoring).

import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  leadForms,
  leadSubmissions,
  practitionerSettings,
} from "@/db/schema";
import { checkRateLimit } from "./rate-limit";
import { resolveStorefrontAccountId } from "./storefront-account";
import {
  generateLeadFormToken,
  hashLeadFormToken,
  leadFormTokenPrefix,
} from "./lead-tokens";
import {
  isResendConfigured,
  sendLandingInquiryAckEmail,
  sendLandingInquiryNotifyEmail,
} from "./resend";
import {
  type QuizResultKey,
  QUIZ_RESULTS,
  quizResultLabel,
} from "./quiz-content";

const QUIZ_FORM_SLUG = "quiz";

export type QuizLeadResult = { ok: true } | { ok: false; error: string };

export async function submitQuizLead(input: {
  resultKey: QuizResultKey;
  name: string;
  email: string;
  _hp?: string; // honeypot
}): Promise<QuizLeadResult> {
  if ((input._hp ?? "").trim().length > 0) {
    return { ok: true }; // bot — pretend success, do nothing
  }

  const resultKey = input.resultKey;
  if (!QUIZ_RESULTS[resultKey]) {
    return { ok: false, error: "Something went off — please try again." };
  }
  const name = String(input.name ?? "").trim().slice(0, 200);
  const emailRaw = String(input.email ?? "").trim();
  if (!name) return { ok: false, error: "Please share your name." };
  if (!emailRaw || !emailRaw.includes("@")) {
    return { ok: false, error: "Please share a valid email." };
  }
  const email = emailRaw.toLowerCase().slice(0, 200);

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = checkRateLimit("quiz-lead", ip, { limit: 8, windowMs: 60_000 });
  if (!limit.ok) {
    return {
      ok: false,
      error: `Slow down a moment — try again in ${limit.retryAfterSeconds}s.`,
    };
  }

  const accountId = await resolveStorefrontAccountId();
  if (!accountId) {
    return {
      ok: false,
      error: "The practice isn't set up yet. Try again shortly.",
    };
  }

  // Find or create the "quiz" lead form (idempotent).
  const existing = await db
    .select({ id: leadForms.id })
    .from(leadForms)
    .where(
      and(eq(leadForms.accountId, accountId), eq(leadForms.slug, QUIZ_FORM_SLUG))
    )
    .limit(1);

  let formId: string;
  if (existing[0]) {
    formId = existing[0].id;
  } else {
    const cleartext = generateLeadFormToken();
    const inserted = await db
      .insert(leadForms)
      .values({
        accountId,
        name: "Compass quiz",
        slug: QUIZ_FORM_SLUG,
        tokenHash: hashLeadFormToken(cleartext),
        tokenPrefix: leadFormTokenPrefix(cleartext),
        autoAccept: false,
        defaultIntent: "Took the compass quiz",
      })
      .returning({ id: leadForms.id });
    formId = inserted[0].id;
  }

  const resultLabel = quizResultLabel(resultKey);
  await db.insert(leadSubmissions).values({
    accountId,
    formId,
    name,
    email,
    fields: {
      quizResult: resultKey,
      quizResultLabel: resultLabel,
      wantsWorkbook: true,
      source: "compass-quiz",
    },
    sourceIp: ip === "unknown" ? null : ip,
    userAgent: h.get("user-agent") ?? null,
    referer: h.get("referer") ?? null,
    status: "pending",
  });

  // Best-effort notifications — the lead is already saved above, so a mail
  // hiccup must never fail the submission or hide it from her inbox.
  try {
    if (isResendConfigured()) {
      const [acct] = await db
        .select({ email: accounts.email })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .limit(1);
      const [pset] = await db
        .select({
          practitionerName: practitionerSettings.practitionerName,
          businessEmail: practitionerSettings.businessEmail,
        })
        .from(practitionerSettings)
        .where(eq(practitionerSettings.accountId, accountId))
        .limit(1);

      const practitionerName = pset?.practitionerName ?? null;
      const notifyTo = acct?.email || pset?.businessEmail || null;

      try {
        await sendLandingInquiryAckEmail({
          to: email,
          name,
          practitionerName,
          replyTo: pset?.businessEmail || acct?.email || undefined,
        });
      } catch (err) {
        console.error("[quiz] ack email failed:", err);
      }

      if (notifyTo) {
        try {
          await sendLandingInquiryNotifyEmail({
            to: notifyTo,
            practitionerName,
            fromName: name,
            fromEmail: email,
            message: `Took the compass quiz → "${resultLabel}". Asked for the workbook.`,
            preferredWhenLabel: null,
          });
        } catch (err) {
          console.error("[quiz] notify email failed:", err);
        }
      }
    }
  } catch (err) {
    console.error("[quiz] notification block failed:", err);
  }

  return { ok: true };
}
