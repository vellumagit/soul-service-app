"use server";

// Magic-link auth server actions.
//
// Flow:
//   1) /signin form submits → `requestMagicLink` checks the allowlist, issues
//      a one-time token, persists its sha256 in `magic_links`, emails the
//      raw token in a /auth/verify?t=… URL.
//   2) User clicks email → /auth/verify route handler consumes the token and
//      sets the session cookie, then redirects /.
//   3) `signOutAction` clears the cookie.

import { redirect } from "next/navigation";
import { isAllowed } from "./session";
import { clearSessionCookie } from "./session-cookies";
import { sendMagicLinkEmail } from "./resend";
import { getAppUrl, issueMagicLinkToken } from "./auth-tokens";

export type RequestMagicLinkResult = {
  ok: boolean;
  message: string;
};

/**
 * Submitted by the /signin form. We always return the same generic
 * "check your email" message — even if the email isn't allowlisted — so we
 * don't leak who has access. Server logs show what actually happened.
 */
export async function requestMagicLink(
  _prev: RequestMagicLinkResult | undefined,
  formData: FormData
): Promise<RequestMagicLinkResult> {
  const rawEmail = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!rawEmail || !rawEmail.includes("@")) {
    return { ok: false, message: "Please enter a valid email address." };
  }

  const generic: RequestMagicLinkResult = {
    ok: true,
    message:
      "If that email is on the allowlist, a sign-in link is on its way. Check your inbox.",
  };

  if (!isAllowed(rawEmail)) {
    console.log(
      `[auth] rejected sign-in request for non-allowlisted: ${rawEmail}`
    );
    return generic;
  }

  let token: string;
  try {
    token = await issueMagicLinkToken(rawEmail);
  } catch (err) {
    console.error("[auth] failed to issue token:", err);
    return {
      ok: false,
      message:
        "Database error issuing your sign-in link. Try again in a moment.",
    };
  }

  const url = `${getAppUrl()}/auth/verify?t=${token}`;

  try {
    await sendMagicLinkEmail(rawEmail, url);
  } catch (err) {
    console.error("[auth] failed to send magic-link email:", err);
    return {
      ok: false,
      message:
        "We couldn't send the sign-in email. Check that RESEND_API_KEY is configured, then try again.",
    };
  }

  return generic;
}

/** Server action used by the sign-out button. */
export async function signOutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/signin");
}
