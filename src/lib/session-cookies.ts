// Cookie-bound session helpers — only usable in Server Components / Server Actions
// / Route Handlers (where Next's `cookies()` AsyncLocalStorage is available).
//
// Proxy/middleware code should use the primitives in `./session.ts` instead,
// reading the cookie directly off NextRequest.
import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE_NAME,
  SESSION_DAYS,
  getEmailFromToken,
  isAuthDisabled,
  signSessionToken,
} from "./session";

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

/** Read & verify current session from cookies. Returns the email or null.
 *  When auth is disabled (AUTH_DISABLED=true or AUTH_SECRET unset) returns
 *  null so the sidebar shows its neutral fallback instead of an email. */
export async function getSessionEmail(): Promise<string | null> {
  if (isAuthDisabled()) return null;
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  return getEmailFromToken(token);
}

/** Clear the session cookie (sign out). */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

/** Redirects to /signin if no valid session. Use at the top of protected pages/actions.
 *  When auth is disabled, returns an empty email so the page renders without
 *  a redirect and the sidebar falls back to its default chip. */
export async function requireSession(): Promise<{ email: string }> {
  if (isAuthDisabled()) return { email: "" };
  const email = await getSessionEmail();
  if (!email) redirect("/signin");
  return { email };
}
