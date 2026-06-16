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

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { userMagicLinks } from "@/db/schema";
import {
  SESSION_COOKIE_NAME,
  SESSION_DAYS,
  getEmailFromToken,
  signSessionToken,
} from "./session";
import { findAccountByEmail } from "./account";

export const USER_MAGIC_LINK_TTL_MIN = 30;

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

// ─────────────────────────────────────────────────────────────────────────
// Magic-link helpers for practitioner sign-in.
//
// Why we have these in addition to the existing JWT-based session cookie:
// the OLD /signin gave instant entry as long as the typed email was on
// the allowlist — there was no email-verification step at all. With magic
// links, even an allowlisted email has to PROVE control of the inbox by
// clicking a link. Cookie / signSessionToken / requireSession all stay
// unchanged — the magic link is only the bootstrap step.
// ─────────────────────────────────────────────────────────────────────────

function generateMagicLinkToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}
function hashMagicLinkToken(cleartext: string): string {
  return crypto.createHash("sha256").update(cleartext).digest("hex");
}

/** Create a magic-link row + return the cleartext to email. 30-min TTL. */
export async function createUserMagicLink(
  email: string,
  meta?: { ip?: string | null; userAgent?: string | null }
): Promise<string> {
  const cleartext = generateMagicLinkToken();
  const tokenHash = hashMagicLinkToken(cleartext);
  const expiresAt = new Date(
    Date.now() + USER_MAGIC_LINK_TTL_MIN * 60 * 1000
  );
  await db.insert(userMagicLinks).values({
    email,
    tokenHash,
    expiresAt,
    requestedIp: meta?.ip ?? null,
    requestedUserAgent: meta?.userAgent ?? null,
  });
  return cleartext;
}

/** Atomic single-use claim. Returns the email for a valid token, or null. */
export async function consumeUserMagicLink(
  cleartext: string
): Promise<{ email: string } | null> {
  const tokenHash = hashMagicLinkToken(cleartext);
  const now = new Date();
  // UPDATE ... RETURNING serializes via Postgres so a double-click on the
  // link can't issue two sessions. Both predicates (not yet consumed,
  // not yet expired) live in the WHERE so a stale or re-replayed link
  // yields 0 rows.
  const consumed = await db
    .update(userMagicLinks)
    .set({ consumedAt: now })
    .where(
      and(
        eq(userMagicLinks.tokenHash, tokenHash),
        isNull(userMagicLinks.consumedAt),
        gt(userMagicLinks.expiresAt, now)
      )
    )
    .returning({ email: userMagicLinks.email });
  if (consumed.length === 0) return null;
  return { email: consumed[0].email };
}
