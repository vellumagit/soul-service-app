import "server-only";

// Shared "start a portal sign-in by email" helper. Looks up a portal-enabled
// client by email and, if found, mints a magic link and emails it.
//
// ANTI-ENUMERATION CONTRACT: this returns void regardless of whether a
// match existed or the email actually sent. Callers MUST NOT branch on the
// result — there is no result. That's deliberate: a caller that revealed
// "no such client" would leak which emails are enrolled.
//
// Used by BOTH:
//   - the standalone /portal/sign-in page (clients arriving directly)
//   - the unified smart sign-in door (lib/auth-actions.ts) — when a typed
//     email isn't on the practitioner allowlist, we fall through to here so
//     clients can use the same "Sign in" entrance.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, practitionerSettings } from "@/db/schema";
import { createMagicLink } from "./portal-auth";
import { sendPortalMagicLinkEmail } from "./resend";

export async function startPortalSignInByEmail(
  email: string,
  base: string,
  meta: { ip: string | null; userAgent: string | null }
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return;

  // Find a portal-enabled client whose email matches case-insensitively.
  // No accountId filter — portal is global across all practitioner accounts
  // on this deployment; the client_id→account binding lives on the row.
  const matches = await db
    .select({
      accountId: clients.accountId,
      id: clients.id,
      fullName: clients.fullName,
      email: clients.email,
    })
    .from(clients)
    .where(
      and(
        eq(clients.portalEnabled, true),
        sql`LOWER(${clients.email}) = ${normalized}`
      )
    )
    .limit(1);
  const match = matches[0];
  if (!match) return;

  const cleartext = await createMagicLink(match.accountId, match.id, {
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  const url = `${base}/portal/sign-in/${cleartext}`;

  const settingsRows = await db
    .select({ practitionerName: practitionerSettings.practitionerName })
    .from(practitionerSettings)
    .where(eq(practitionerSettings.accountId, match.accountId))
    .limit(1);

  try {
    await sendPortalMagicLinkEmail({
      to: match.email!,
      url,
      clientFirstName: match.fullName.split(" ")[0] ?? null,
      practitionerName: settingsRows[0]?.practitionerName ?? null,
    });
  } catch (err) {
    console.error("[portal sign-in] sendPortalMagicLinkEmail failed:", err);
    // Swallow — the link row exists; she can resend from her side. Never
    // leak "your email isn't on file" via an error.
  }
}
