// Session primitives — JWT sign/verify + allowlist check.
//
// This module deliberately AVOIDS importing `next/headers` so it can be
// called from `proxy.ts` (Next 16's renamed middleware), which only has
// access to NextRequest cookies, not the global cookies() API.
//
// Cookie helpers that DO use next/headers live in `session-cookies.ts`.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "ss_session";
export const SESSION_DAYS = 30;

export type SessionPayload = {
  email: string;
};

function encodedSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short (need ≥32 chars). Generate one with: openssl rand -base64 32"
    );
  }
  return new TextEncoder().encode(secret);
}

/** Allowlist check — comma-separated emails in ALLOWED_EMAILS env var. Lower-cased. */
export function isAllowed(email: string): boolean {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
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
    return { email: payload.email };
  } catch {
    return null;
  }
}

/** Combined: verify token + re-check allowlist. */
export async function getEmailFromToken(
  token: string | undefined | null
): Promise<string | null> {
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  if (!isAllowed(payload.email)) return null;
  return payload.email;
}
