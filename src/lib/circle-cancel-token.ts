import "server-only";

// Stateless, signed tokens for the "Can't make it?" links in Circle emails.
// An attendee's link carries `<base64url(attendeeId)>.<hmac>`; the cancel page
// verifies the HMAC before showing anything. No DB column needed — the signature
// (keyed by AUTH_SECRET) is what makes a link unforgeable, so only the person we
// emailed can open their own cancellation page.

import crypto from "node:crypto";

function secret(): string {
  const s = process.env.CIRCLE_CANCEL_SECRET || process.env.AUTH_SECRET || "";
  return s;
}

function sign(attendeeId: string): string {
  return crypto
    .createHmac("sha256", secret())
    .update(`circle-cancel:${attendeeId}`)
    .digest("base64url");
}

/** Build the token that goes in the email link. Empty string if no secret is
 *  configured (so callers can omit the link rather than ship a bad one). */
export function makeCircleCancelToken(attendeeId: string): string {
  if (!secret() || !attendeeId) return "";
  const idPart = Buffer.from(attendeeId, "utf8").toString("base64url");
  return `${idPart}.${sign(attendeeId)}`;
}

/** Verify a token and return the attendeeId, or null if invalid/tampered. */
export function verifyCircleCancelToken(token: string): string | null {
  if (!secret() || !token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const idPart = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let attendeeId: string;
  try {
    attendeeId = Buffer.from(idPart, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!attendeeId) return null;
  const expected = sign(attendeeId);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
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
