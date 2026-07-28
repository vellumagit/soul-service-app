// Telling her when a client asks for something from inside their portal.
//
// Both portal requests — "please move this session" and "I'd like another
// one" — used to write a row and stop there. The client saw "Your
// practitioner has been notified"; she saw nothing until she next opened
// Loose ends of her own accord. This closes that gap.
//
// Deliberately best-effort and non-throwing: the request row is already
// committed by the time we're called, so a Resend outage must never surface
// as a failed submit to the client. Failures go to the log; Loose ends is
// still the durable surface.

import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, practitionerSettings } from "@/db/schema";
import { isResendConfigured, sendPortalRequestNotifyEmail } from "./resend";

/** Where a practitioner notification should land: her login email first (it's
 *  the one she definitely reads), then the business address on the storefront. */
async function resolveNotifyTo(
  accountId: string
): Promise<{ to: string | null }> {
  const [acct, pset] = await Promise.all([
    db
      .select({ email: accounts.email })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1),
    db
      .select({ businessEmail: practitionerSettings.businessEmail })
      .from(practitionerSettings)
      .where(eq(practitionerSettings.accountId, accountId))
      .limit(1),
  ]);
  return { to: acct[0]?.email || pset[0]?.businessEmail || null };
}

function workspaceBaseUrl(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return raw ? raw.replace(/\/+$/, "") : null;
}

export async function notifyPractitionerOfPortalRequest(input: {
  accountId: string;
  clientId: string;
  kind: "reschedule" | "booking";
  clientName: string;
  clientEmail: string | null;
  sessionWhenLabel?: string | null;
  preferredTimes?: string | null;
  message: string | null;
}): Promise<void> {
  try {
    if (!isResendConfigured()) return;
    const { to } = await resolveNotifyTo(input.accountId);
    if (!to) return;
    const base = workspaceBaseUrl();
    await sendPortalRequestNotifyEmail({
      to,
      kind: input.kind,
      clientName: input.clientName,
      clientEmail: input.clientEmail,
      sessionWhenLabel: input.sessionWhenLabel ?? null,
      preferredTimes: input.preferredTimes ?? null,
      message: input.message,
      link: base ? `${base}/clients/${input.clientId}` : null,
    });
  } catch (err) {
    console.error("[portal] request notify email failed:", err);
  }
}
