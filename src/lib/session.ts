// Session primitives — JWT sign/verify + allowlist check.
//
// Sign-in is email-allowlisted, and there are two ways in: a password
// (practitioner only, /signin) or a one-time emailed link. Either way the
// signed cookie binds the email to the request; getOrCreateAccount maps
// email → accountId at every request via session-cookies.ts. The client
// portal is separate and magic-link only — see portal-auth.ts.
//
// This module avoids importing `next/headers` so it can be called from
// `proxy.ts` (Next 16's renamed middleware), which only has access to
// NextRequest cookies, not the global cookies() API. That's also why the
// cookie OPTIONS live here: proxy.ts refreshes the session (see
// sessionNeedsRefresh) and must write exactly the same cookie that
// setSessionCookie does, or the two would quietly disagree.
import { timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "ss_session";
export const SESSION_DAYS = 30;

export type SessionPayload = {
  email: string;
  /** JWT `exp`, in SECONDS since the epoch — the unit jose uses. Needed so
   *  proxy.ts can tell how much of the session's life is left. */
  exp: number | null;
};

/** The cookie attributes, in one place.
 *
 *  Two different files write this cookie — setSessionCookie at sign-in and
 *  proxy.ts on refresh — and a mismatch between them is the kind of bug that
 *  doesn't announce itself: a refresh written without `secure`, or on a
 *  different path, silently replaces a good cookie with a worse one, or
 *  creates a second cookie the browser sends alongside the first. */
export function sessionCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/" as const,
    expires: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
  };
}

/** Is this session past the half-way point of its life?
 *
 *  The cookie used to be written once at sign-in and never touched again, so
 *  it was a hard 30 days from sign-in no matter how much she used the app.
 *  That lands worst on the installed phone app: a magic link opens in the
 *  BROWSER, which on iOS has its own cookie jar, so the obvious way to
 *  recover from being logged out is the one way that doesn't fix it.
 *
 *  Refreshing at the half-life (not on every request) means an active
 *  session renews itself roughly every two weeks, while a token that leaked
 *  still dies on its original clock once it stops being used. */
export function sessionNeedsRefresh(exp: number | null): boolean {
  if (!exp) return false;
  const lifetimeMs = SESSION_DAYS * 24 * 60 * 60 * 1000;
  const msRemaining = exp * 1000 - Date.now();
  return msRemaining < lifetimeMs / 2;
}

function encodedSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short (need ≥32 chars). Generate one with: openssl rand -base64 32"
    );
  }
  return new TextEncoder().encode(secret);
}

/** Allowlist check — comma-separated emails in ALLOWED_EMAILS env var.
 *  Uses constant-time comparison so an attacker can't infer which emails
 *  are on the list by measuring response times. (Naive Array.includes
 *  exits early on the first match, leaking the position of an allowlist
 *  member via timing.) Always scans the full list and ORs results into
 *  a single boolean. */
export function isAllowed(email: string): boolean {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return false;
  const needle = Buffer.from(email.trim().toLowerCase());
  let matched = 0;
  for (const allowed of list) {
    const candidate = Buffer.from(allowed);
    if (candidate.length !== needle.length) continue;
    // timingSafeEqual throws if lengths differ — we gate above. The
    // comparison itself is constant-time. We OR into `matched` so the
    // entire list is scanned regardless of where the match lives.
    if (timingSafeEqual(candidate, needle)) matched = 1;
  }
  return matched === 1;
}

/** Sign a JWT carrying the user's email. */
export async function signSessionToken(email: string): Promise<string> {
  return new SignJWT({ email: email.toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(encodedSecret());
}

/** Verify and decode. Returns null on any error (expired, bad sig, malformed). */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, encodedSecret(), {
      algorithms: ["HS256"],
    });
    if (typeof payload.email !== "string") return null;
    return {
      email: payload.email,
      exp: typeof payload.exp === "number" ? payload.exp : null,
    };
  } catch {
    return null;
  }
}

/** Verify + re-check allowlist, keeping the payload. Use this where the
 *  expiry matters (proxy.ts, to decide on a refresh). */
export async function getSessionFromToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  if (!isAllowed(payload.email)) return null;
  return payload;
}

/** Combined: verify token + re-check allowlist. Returns the email or null. */
export async function getEmailFromToken(
  token: string | undefined | null
): Promise<string | null> {
  return (await getSessionFromToken(token))?.email ?? null;
}
