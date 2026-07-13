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
  requireSession,
  setSessionCookie,
} from "./session-cookies";
import {
  getOrCreateAccount,
  getAccountAuthByEmail,
  getAccountPasswordHash,
  setAccountPasswordHash,
} from "./account";
import {
  hashPassword,
  verifyPassword,
  MIN_PASSWORD_LENGTH,
} from "./password";
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

  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost"}`;
  const userAgent = h.get("user-agent");
  const intent = String(formData.get("intent") ?? "password").trim();
  const password = String(formData.get("password") ?? "");

  const auth = await getAccountAuthByEmail(rawEmail);
  const hasPassword = !!auth?.passwordHash;

  // Explicit "email me a sign-in link" — bootstrap, fallback, or password
  // reset. Always sends a link regardless of whether a password is set, so she
  // can never be locked out.
  if (intent === "link") {
    await sendPractitionerLink(rawEmail, { base, ip, userAgent });
    return { ok: true, message: SUCCESS_MESSAGE };
  }

  // Once a password exists, it (or an emailed link) is the ONLY way in — no
  // more instant entry.
  if (hasPassword) {
    if (!password) {
      return {
        ok: false,
        message:
          "Enter your password, or choose “Email me a sign-in link” below.",
      };
    }
    const good = await verifyPassword(password, auth!.passwordHash);
    if (!good) {
      return {
        ok: false,
        message:
          "That email and password don’t match. Try again, or use “Email me a sign-in link.”",
      };
    }
    await setSessionCookie(rawEmail);
    redirect("/today");
  }

  // No password set yet → bootstrap with the prior behavior so she's never
  // locked out: instant entry (default) or an emailed link.
  if (!magicLinkMode()) {
    await setSessionCookie(rawEmail);
    redirect("/today");
  }
  await sendPractitionerLink(rawEmail, { base, ip, userAgent });
  return { ok: true, message: SUCCESS_MESSAGE };
}

/** Send a one-time practitioner sign-in link (bootstrap / fallback / reset).
 *  Best-effort; swallows send errors so we return the neutral card either way. */
async function sendPractitionerLink(
  email: string,
  opts: { base: string; ip: string; userAgent: string | null }
): Promise<void> {
  try {
    const cleartext = await createUserMagicLink(email, {
      ip: opts.ip,
      userAgent: opts.userAgent,
    });
    await sendMagicLinkEmail(email, `${opts.base}/signin/${cleartext}`);
  } catch (err) {
    console.error("[auth] magic link send failed:", err);
  }
}

export type PasswordUpdateResult = { ok: boolean; message: string };

/** Set or change the signed-in practitioner's password. Requires the current
 *  password when one is already set. Clients never reach this (requireSession
 *  gates it to the practitioner). */
export async function setPractitionerPassword(
  _prev: PasswordUpdateResult | undefined,
  formData: FormData
): Promise<PasswordUpdateResult> {
  const { accountId } = await requireSession();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const existing = await getAccountPasswordHash(accountId);
  if (existing) {
    const good = await verifyPassword(current, existing);
    if (!good) {
      return { ok: false, message: "Your current password isn’t right." };
    }
  }
  if (next.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Please use at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (next !== confirm) {
    return { ok: false, message: "The two new-password fields don’t match." };
  }

  const hash = await hashPassword(next);
  await setAccountPasswordHash(accountId, hash);

  return {
    ok: true,
    message: existing
      ? "Password updated."
      : "Password set — you can now sign in with it from anywhere.",
  };
}

/** Sign out — clear the cookie and bounce to /signin. */
export async function signOutAction(): Promise<void> {
  await clearSessionCookie();
  const { redirect } = await import("next/navigation");
  redirect("/signin");
}
