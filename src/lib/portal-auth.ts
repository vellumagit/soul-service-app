// Client portal auth — magic-link tokens (single-use, 30 min) + browser
// session cookies (30 day). Mirrors the lead-tokens hashing pattern: a
// random cleartext value goes into the URL or cookie; the SHA-256 hex
// goes into the DB. A DB read never exposes a working credential.
//
// This is SEPARATE from the practitioner session (lib/session-cookies.ts) —
// different cookie name, different table, different `requireXxx()` helper.
// The two never share state. A client logging in does NOT give them
// practitioner privileges and vice versa.

import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  clientPortalTokens,
  clientPortalSessions,
} from "@/db/schema";

const COOKIE_NAME = "sps_client";
export const MAGIC_LINK_TTL_MIN = 30;
export const SESSION_TTL_DAYS = 30;

/** Generate a random cleartext magic-link token. ~128 bits entropy. */
export function generateMagicLinkToken(): string {
  return crypto.randomBytes(24).toString("base64url"); // 32 char URL-safe
}

/** Generate a random session cookie value. ~256 bits entropy — sessions
 *  live longer than magic links, deserve more entropy. */
export function generateSessionCookieValue(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Hash a token / cookie value for DB storage. */
export function hashToken(cleartext: string): string {
  return crypto.createHash("sha256").update(cleartext).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────
// Magic link lifecycle.
// ─────────────────────────────────────────────────────────────────────────

/** Create a magic-link row + return the cleartext to be emailed. */
export async function createMagicLink(
  accountId: string,
  clientId: string,
  meta?: { ip?: string | null; userAgent?: string | null }
): Promise<string> {
  const cleartext = generateMagicLinkToken();
  const tokenHash = hashToken(cleartext);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MIN * 60 * 1000);

  await db.insert(clientPortalTokens).values({
    accountId,
    clientId,
    tokenHash,
    expiresAt,
    requestedIp: meta?.ip ?? null,
    requestedUserAgent: meta?.userAgent ?? null,
  });

  return cleartext;
}

/** Consume a magic link if it's valid + unexpired + unused. Returns the
 *  (accountId, clientId) for the matching link, or null. ATOMIC: we mark
 *  consumed_at via WHERE consumed_at IS NULL so a double-click on the link
 *  doesn't create two sessions. */
export async function consumeMagicLink(
  cleartext: string
): Promise<{ accountId: string; clientId: string } | null> {
  const tokenHash = hashToken(cleartext);
  const now = new Date();

  // Atomic: the WHERE includes both "not yet consumed" and "not yet expired";
  // .returning() yields 0 rows if either fails. RETURNING gives us the row
  // we need without a separate SELECT.
  const consumed = await db
    .update(clientPortalTokens)
    .set({ consumedAt: now })
    .where(
      and(
        eq(clientPortalTokens.tokenHash, tokenHash),
        isNull(clientPortalTokens.consumedAt),
        gt(clientPortalTokens.expiresAt, now)
      )
    )
    .returning({
      accountId: clientPortalTokens.accountId,
      clientId: clientPortalTokens.clientId,
    });

  if (consumed.length === 0) return null;
  return consumed[0];
}

// ─────────────────────────────────────────────────────────────────────────
// Session cookies.
// ─────────────────────────────────────────────────────────────────────────

/** Create a portal session row + set the cookie on the response. Call
 *  this after consumeMagicLink succeeds. */
export async function setPortalSessionCookie(
  accountId: string,
  clientId: string,
  meta?: { ip?: string | null; userAgent?: string | null }
): Promise<void> {
  const cleartext = generateSessionCookieValue();
  const cookieHash = hashToken(cleartext);
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  await db.insert(clientPortalSessions).values({
    accountId,
    clientId,
    cookieHash,
    expiresAt,
    createdIp: meta?.ip ?? null,
    createdUserAgent: meta?.userAgent ?? null,
  });

  const store = await cookies();
  store.set(COOKIE_NAME, cleartext, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

/** Clear the portal session cookie + invalidate the row server-side. */
export async function clearPortalSessionCookie(): Promise<void> {
  const store = await cookies();
  const cleartext = store.get(COOKIE_NAME)?.value;
  store.delete(COOKIE_NAME);
  if (cleartext) {
    const cookieHash = hashToken(cleartext);
    // Expire the row so a stolen cookie can't be reused even before browser
    // garbage-collects it.
    await db
      .update(clientPortalSessions)
      .set({ expiresAt: new Date(0) })
      .where(eq(clientPortalSessions.cookieHash, cookieHash));
  }
}

/** Read & validate the portal cookie. Returns the client + account
 *  identifiers, or null. Updates `last_seen_at` on the session row so
 *  the practitioner can see when the client was last active. */
export const getPortalSession = cache(
  async (): Promise<{
    accountId: string;
    clientId: string;
    clientFullName: string;
    clientEmail: string | null;
  } | null> => {
    const store = await cookies();
    const cleartext = store.get(COOKIE_NAME)?.value;
    if (!cleartext) return null;
    const cookieHash = hashToken(cleartext);

    const rows = await db
      .select({
        accountId: clientPortalSessions.accountId,
        clientId: clientPortalSessions.clientId,
        sessionId: clientPortalSessions.id,
        expiresAt: clientPortalSessions.expiresAt,
        clientFullName: clients.fullName,
        clientEmail: clients.email,
        portalEnabled: clients.portalEnabled,
      })
      .from(clientPortalSessions)
      .innerJoin(clients, eq(clients.id, clientPortalSessions.clientId))
      .where(eq(clientPortalSessions.cookieHash, cookieHash))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    if (row.expiresAt < new Date()) return null;
    // If the practitioner turned off portal access for this client, every
    // pending session immediately stops working. Don't surface a 401 — let
    // requirePortalSession redirect through sign-in.
    if (!row.portalEnabled) return null;

    // Touch last-seen + the client's last_portal_visit_at. Fire-and-forget
    // — we don't want a write failure to block rendering.
    void db
      .update(clientPortalSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(clientPortalSessions.id, row.sessionId));
    void db
      .update(clients)
      .set({ lastPortalVisitAt: new Date() })
      .where(eq(clients.id, row.clientId));

    return {
      accountId: row.accountId,
      clientId: row.clientId,
      clientFullName: row.clientFullName,
      clientEmail: row.clientEmail,
    };
  }
);

/** Guard for portal pages. Bounces to /portal/sign-in if no session. */
export const requirePortalSession = cache(async () => {
  const session = await getPortalSession();
  if (!session) redirect("/portal/sign-in");
  return session;
});
