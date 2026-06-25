"use server";

// Email-as-auth. Two modes, controlled by AUTH_REQUIRE_MAGIC_LINK env var:
//
//   off (default) — type allowlisted email → instant cookie + redirect home.
//                   The original flow. Use when Resend has no verified
//                   custom domain yet (sandbox sender lands in spam, so
//                   magic-link email would be unreliable).
//
//   on            — type allowlisted email → email a one-time sign-in
//                   link via Resend → click within 30 min → /signin/<token>
//                   atomically consumes, sets the cookie, redirects home.
//                   Adds the "prove you control the inbox" step. Flip
//                   AUTH_REQUIRE_MAGIC_LINK=true once a real domain is
//                   verified with Resend (~$10/year + a few DNS records).
//
// The ALLOWED_EMAILS env var is the outer gate in BOTH modes — only
// listed emails get past the allowlist check. The magic-link mode adds
// a layer on top of that, not a replacement.
//
// Rate-limit (per-IP + per-email) and constant-time allowlist comparison
// apply in BOTH modes — those are security improvements that don't depend
// on which sign-in flow is active.

import { headers } from "next/headers";
import { isAllowed } from "./session";
import {
  clearSessionCookie,
  createUserMagicLink,
  setSessionCookie,
} from "./session-cookies";
import { getOrCreateAccount } from "./account";
import { sendMagicLinkEmail } from "./resend";
import { startPortalSignInByEmail } from "./portal-signin";
import { checkRateLimit } from "./rate-limit";
import { redirect } from "next/navigation";

function magicLinkMode(): boolean {
  const raw = (process.env.AUTH_REQUIRE_MAGIC_LINK ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

export type SignInResult = {
  ok: boolean;
  message: string;
};

// Neutral, audience-agnostic copy — this door serves both the practitioner
// and clients, so it must not imply "you're not on the admin list."
const SUCCESS_MESSAGE =
  "If your email is on file, a sign-in link is on its way. Check your inbox — it'll expire in 30 minutes.";

export async function signInWithEmail(
  _prev: SignInResult | undefined,
  formData: FormData
): Promise<SignInResult> {
  const rawEmail = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!rawEmail || !rawEmail.includes("@")) {
    return { ok: false, message: "Please enter a valid email address." };
  }

  // Rate-limit BOTH dimensions:
  //   - per-IP: stops a single attacker from spraying many emails to enumerate
  //   - per-email: stops a Resend-quota-drain attack on one valid address
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipLimit = checkRateLimit("signin:ip", ip, {
    limit: 8,
    windowMs: 60_000,
  });
  if (!ipLimit.ok) {
    return {
      ok: false,
      message: `Too many sign-in attempts from this connection. Try again in ${ipLimit.retryAfterSeconds}s.`,
    };
  }
  const emailLimit = checkRateLimit("signin:email", rawEmail, {
    limit: 3,
    windowMs: 60_000,
  });
  if (!emailLimit.ok) {
    // Even though this is the per-email bucket, surface a generic
    // anti-enumeration response — don't reveal whether the email is real.
    return { ok: true, message: SUCCESS_MESSAGE };
  }

  // ── CLIENT / STRANGER PATH ────────────────────────────────────────────
  // Not on the practitioner allowlist → this is a client (or a stranger).
  // This is what makes the door "smart": the same "Sign in" entrance serves
  // both audiences. We try to start a client portal sign-in by email; the
  // helper is anti-enumeration (does nothing if no enrolled client matches),
  // and we ALWAYS return the same neutral success card so the response is
  // identical whether the email belongs to a client, or nobody at all.
  if (!isAllowed(rawEmail)) {
    const base =
      process.env.NEXT_PUBLIC_SITE_URL ||
      `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost"}`;
    try {
      await startPortalSignInByEmail(rawEmail, base, {
        ip: ip === "unknown" ? null : ip,
        userAgent: h.get("user-agent"),
      });
    } catch (err) {
      console.error("[auth] portal fallback send failed:", err);
    }
    return { ok: true, message: SUCCESS_MESSAGE };
  }

  // ── PRACTITIONER PATH ─────────────────────────────────────────────────
  try {
    await getOrCreateAccount(rawEmail);
  } catch (err) {
    console.error("[auth] account bootstrap failed:", err);
    return {
      ok: false,
      message:
        "We couldn't set up your account just now. Try again in a moment.",
    };
  }

  // INSTANT-ENTRY mode (default — Resend domain not yet configured).
  // Set the session cookie and redirect home. This is the pre-magic-link
  // behavior, preserved so Brian can still sign in while he sorts out
  // the Resend domain verification. Flip AUTH_REQUIRE_MAGIC_LINK=true
  // to switch to the email-verification flow.
  if (!magicLinkMode()) {
    await setSessionCookie(rawEmail);
    redirect("/today");
  }

  // MAGIC-LINK mode — opt in via AUTH_REQUIRE_MAGIC_LINK env var.
  try {
    const userAgent = h.get("user-agent");
    const cleartext = await createUserMagicLink(rawEmail, {
      ip,
      userAgent,
    });
    const base =
      process.env.NEXT_PUBLIC_SITE_URL ||
      `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost"}`;
    const url = `${base}/signin/${cleartext}`;
    await sendMagicLinkEmail(rawEmail, url);
  } catch (err) {
    console.error("[auth] magic link send failed:", err);
    return { ok: true, message: SUCCESS_MESSAGE };
  }

  return { ok: true, message: SUCCESS_MESSAGE };
}

/** Sign out — clear the cookie and bounce to /signin. */
export async function signOutAction(): Promise<void> {
  await clearSessionCookie();
  const { redirect } = await import("next/navigation");
  redirect("/signin");
}
