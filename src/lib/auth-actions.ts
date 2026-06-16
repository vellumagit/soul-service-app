"use server";

// Email-as-auth via MAGIC LINK.
//
// Old flow (replaced): type email → instant entry if allowlisted.
// New flow: type email → if allowlisted, generate a magic link, email it
// via Resend → click link → /signin/<token> consumes atomically, sets
// the session cookie, redirects home.
//
// The allowlist (ALLOWED_EMAILS env var) is still the outer gate — only
// allowlisted emails get a link generated. The magic link adds the
// "proves control of the inbox" step that was previously missing.
//
// Anti-enumeration: the form response is identical regardless of whether
// the email is allowlisted (same "check your email" card). A non-allowlist
// email gets no email + no DB row, so a timing measurement could still
// distinguish them in theory — but we gate the action with a rate limit
// (3/min/email + 8/min/IP) which makes any enumeration probe slow + noisy.

import { headers } from "next/headers";
import { isAllowed } from "./session";
import { clearSessionCookie, createUserMagicLink } from "./session-cookies";
import { getOrCreateAccount } from "./account";
import { sendMagicLinkEmail } from "./resend";
import { checkRateLimit } from "./rate-limit";

export type SignInResult = {
  ok: boolean;
  message: string;
};

const SUCCESS_MESSAGE =
  "If your email is on the access list, a sign-in link is on its way. Check your inbox — it'll expire in 30 minutes.";

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

  if (!isAllowed(rawEmail)) {
    console.log(`[auth] rejected sign-in for non-allowlisted: ${rawEmail}`);
    // Anti-enumeration: same success card as the happy path. The user
    // gets no email and no link is created.
    return { ok: true, message: SUCCESS_MESSAGE };
  }

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
    // Don't leak whether the email is real via an error — the row is
    // already created; user can try again. Keep the response success-shaped.
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
