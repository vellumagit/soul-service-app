// Cookie-bound session helpers — only usable in Server Components / Server Actions
// / Route Handlers (where Next's `cookies()` AsyncLocalStorage is available).
//
// Proxy/middleware code uses the primitives in `./session.ts` instead, reading
// the cookie directly off NextRequest.
//
// Multi-tenancy: every protected page calls `requireSession()` which returns
// BOTH the signed-in email AND the resolved accountId. Pages then pass
// accountId to every DB query so users only see their own data.
import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  SESSION_COOKIE_NAME,
  SESSION_DAYS,
  getEmailFromToken,
  signSessionToken,
} from "./session";
import { findAccountByEmail } from "./account";

/** Set the session cookie after a successful sign-in. */
export async function setSessionCookie(email: string): Promise<void> {
  const token = await signSessionToken(email);
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires,
    path: "/",
  });
}

/** Clear the session cookie (sign out). */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

/**
 * Read & verify current session from cookies. Returns the email (still
 * allowlisted) or null. Used by /signin to know whether to bounce.
 *
 * Wrapped in React's `cache()` so multiple calls during a single render
 * don't re-decrypt the JWT.
 */
export const getSessionEmail = cache(async (): Promise<string | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  return getEmailFromToken(token);
});

/**
 * Resolve the current session to {email, accountId}. Redirects to /signin
 * if there's no valid session, or if the email's account doesn't exist
 * (shouldn't happen — sign-in creates the account).
 *
 * Use at the top of every protected page + every server action that touches DB.
 */
export const requireSession = cache(
  async (): Promise<{ email: string; accountId: string }> => {
    const email = await getSessionEmail();
    if (!email) redirect("/signin");
    const account = await findAccountByEmail(email);
    if (!account) {
      // Cookie is valid but account row was deleted. Bounce to signin —
      // they'll be re-bootstrapped if their email is still allowlisted.
      redirect("/signin?error=missing-account");
    }
    return { email, accountId: account.accountId };
  }
);
