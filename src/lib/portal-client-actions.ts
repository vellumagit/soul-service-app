"use server";

// Client-facing portal actions (authenticated as the CLIENT via the portal
// session, not the practitioner). Kept separate from actions.ts so there's no
// chance of mixing practitioner-gated and client-gated logic.

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { getPortalSession } from "./portal-auth";
import { isValidTimeZone } from "./timezone";

/**
 * Record the signed-in client's browser timezone so their reminder /
 * confirmation emails render in THEIR local time (not the practitioner's).
 *
 * Sets it only when we don't already have one — so it never overrides a value
 * the practitioner set by hand, and doesn't flap as the client travels. Silent
 * + best-effort; called from the portal on load.
 */
export async function capturePortalClientTimezone(tz: string): Promise<void> {
  if (!isValidTimeZone(tz)) return;
  const session = await getPortalSession();
  if (!session) return;
  await db
    .update(clients)
    .set({ timezone: tz, updatedAt: new Date() })
    .where(and(eq(clients.id, session.clientId), isNull(clients.timezone)));
}
