// Server-side helpers for magic-link token issuance + consumption.
// Kept separate from `auth-actions.ts` because that file uses "use server"
// (every export becomes a callable Server Action), and these are internal helpers.
import "server-only";

import { eq } from "drizzle-orm";
import { db, magicLinks } from "@/db";
import { isAllowed } from "./session";

export const TOKEN_TTL_MINUTES = 15;

/** URL-safe random token (hex). 32 bytes = 64 hex chars. */
export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** sha256 → hex. Web Crypto so it works in any runtime. */
export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Issue a token for an email + persist its hash. Returns the raw token for the email URL. */
export async function issueMagicLinkToken(email: string): Promise<string> {
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);
  await db.insert(magicLinks).values({
    email: email.toLowerCase(),
    tokenHash,
    expiresAt,
  });
  return token;
}

/**
 * Look up the token hash, validate it's unused + unexpired + allowlisted,
 * mark it consumed, return the email. Returns null on any failure.
 */
export async function consumeMagicLinkToken(
  token: string
): Promise<{ email: string } | null> {
  if (!token) return null;
  const tokenHash = await hashToken(token);

  const rows = await db
    .select()
    .from(magicLinks)
    .where(eq(magicLinks.tokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.consumedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  if (!isAllowed(row.email)) return null;

  await db
    .update(magicLinks)
    .set({ consumedAt: new Date() })
    .where(eq(magicLinks.id, row.id));

  return { email: row.email };
}

/** Resolve the app's public origin — same logic as google-calendar.ts. */
export function getAppUrl(): string {
  const explicit = process.env.APP_URL ?? process.env.NEXTAUTH_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
