"use server";

// Client-facing portal actions (authenticated as the CLIENT via the portal
// session, not the practitioner). Kept separate from actions.ts so there's no
// chance of mixing practitioner-gated and client-gated logic.

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { getPortalSession, requirePortalSession } from "./portal-auth";
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

export type PortalDetailsResult = { ok: true } | { ok: false; error: string };

/**
 * The client corrects their own details from /portal.
 *
 * Only ever writes the row named by the portal cookie — the client id is never
 * taken from the caller. Deliberately scoped to the facts that are THEIRS:
 * name, pronouns, email, phone, city, timezone. Everything else on the client
 * record (her notes, tags, what they're working on) stays hers alone.
 *
 * Timezone matters more than it looks: the whole portal renders in it, and it
 * was captured silently from the browser on first visit. This is the only way
 * a client can fix it if that guess was wrong.
 */
export async function updatePortalClientDetails(input: {
  fullName: string;
  pronouns?: string;
  email?: string;
  phone?: string;
  city?: string;
  timezone?: string;
}): Promise<PortalDetailsResult> {
  const portal = await requirePortalSession();

  const clean = (v: unknown, max: number): string =>
    typeof v === "string" ? v.trim().slice(0, max) : "";

  const fullName = clean(input.fullName, 200);
  if (fullName.length === 0) {
    return { ok: false, error: "Please keep a name here." };
  }

  const email = clean(input.email, 200).toLowerCase();
  if (email.length > 0 && !email.includes("@")) {
    return { ok: false, error: "That email doesn't look right." };
  }

  const timezone = clean(input.timezone, 64);
  if (timezone.length > 0 && !isValidTimeZone(timezone)) {
    return { ok: false, error: "That timezone wasn't recognized." };
  }

  await db
    .update(clients)
    .set({
      fullName,
      pronouns: clean(input.pronouns, 32) || null,
      email: email || null,
      phone: clean(input.phone, 32) || null,
      city: clean(input.city, 120) || null,
      timezone: timezone || null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(clients.id, portal.clientId),
        eq(clients.accountId, portal.accountId)
      )
    );

  // Their own surfaces, plus hers — she should see the corrected details
  // without having to hunt for what changed.
  revalidatePath("/portal");
  revalidatePath("/portal/billing");
  revalidatePath(`/clients/${portal.clientId}`);
  return { ok: true };
}
