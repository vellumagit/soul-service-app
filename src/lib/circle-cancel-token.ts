import "server-only";

// Stateless, signed tokens for the "Can't make it?" links in Circle emails.
// An attendee's link carries `<base64url(attendeeId)>.<exp>.<hmac>`; the cancel
// page verifies the HMAC before showing anything. No DB column needed — the
// signature (keyed by AUTH_SECRET) is what makes a link unforgeable, so only the
// person we emailed can open their own cancellation page.
//
// The token also carries a signed EXPIRY: a leaked/forwarded confirmation email
// can't be used to cancel someone's seat forever, only within the window. The
// expiry is part of the signed payload, so it can't be extended without the
// secret. (Not single-use — that would need DB state; a bounded lifetime is the
// meaningful hardening here, since the scope is one seat and refunds still need
// the practitioner's approval.)

import crypto from "node:crypto";

// Long enough to cover the scheduling horizon of a Circle someone signed up for,
// short enough that a forwarded email doesn't stay actionable indefinitely.
const TOKEN_TTL_MS = 120 * 24 * 60 * 60 * 1000; // 120 days

function secret(): string {
  const s = process.env.CIRCLE_CANCEL_SECRET || process.env.AUTH_SECRET || "";
  return s;
}

function sign(attendeeId: string, exp: string): string {
  return crypto
    .createHmac("sha256", secret())
    .update(`circle-cancel:${attendeeId}:${exp}`)
    .digest("base64url");
}

/** Build the token that goes in the email link. Empty string if no secret is
 *  configured (so callers can omit the link rather than ship a bad one). */
export function makeCircleCancelToken(attendeeId: string): string {
  if (!secret() || !attendeeId) return "";
  const exp = String(Date.now() + TOKEN_TTL_MS);
  const idPart = Buffer.from(attendeeId, "utf8").toString("base64url");
  return `${idPart}.${exp}.${sign(attendeeId, exp)}`;
}

/** Verify a token and return the attendeeId, or null if invalid/tampered/expired. */
export function verifyCircleCancelToken(token: string): string | null {
  if (!secret() || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [idPart, expPart, sig] = parts;
  let attendeeId: string;
  try {
    attendeeId = Buffer.from(idPart, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!attendeeId) return null;
  // Verify the signature over id + exp BEFORE trusting the expiry value.
  const expected = sign(attendeeId, expPart);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  const exp = Number(expPart);
  if (!Number.isFinite(exp) || exp < Date.now()) return null; // expired
  return attendeeId;
}

/** Absolute base URL for building the email links (env, else the live domain). */
export function circleBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    "https://www.svit.live";
  return raw.replace(/\/$/, "");
}

/** Full "Can't make it?" cancel URL for an attendee, or null if unavailable. */
export function circleCancelUrl(attendeeId: string): string | null {
  const token = makeCircleCancelToken(attendeeId);
  if (!token) return null;
  return `${circleBaseUrl()}/circles/cancel/${token}`;
}
