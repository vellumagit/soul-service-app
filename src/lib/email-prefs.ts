// Per-person email preferences — which AUTOMATED emails a client gets.
//
// Stored as `clients.email_opt_outs`: the categories this person should NOT
// be sent. Empty (the default) = everything on, so nothing changes for anyone
// until she switches something off. "all" = no automated email whatsoever.
//
// What each category covers:
//   reminders — the 24h(ish) session reminder and the 10-minute "join now"
//   bookings  — booking/series confirmations, "session moved", "back on",
//               cancellations, time-off notices, AND the Google Calendar
//               invite/update/cancel emails Google sends on our behalf
//   portal    — "something new in your space" when she shares a note
//   circles   — Circle reminders, "walk in now", the thank-you after, the
//               "go deeper one-to-one" invite, and lead-magnet follow-ups
//
// Never gated, because a person or Svitlana explicitly asked for them right
// then: emails she writes herself (composer, request replies), portal sign-in
// links, and replies to a form the person just submitted. Circle seat
// confirmations, moves, cancellations and refunds follow only the "all"
// switch — they're about a seat the person paid for.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";

export const EMAIL_CATEGORIES = ["reminders", "bookings", "portal", "circles"] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

/** Pass "essential" for mail that only the master switch can stop. */
export function emailAllowed(
  optOuts: readonly string[] | null | undefined,
  category: EmailCategory | "essential"
): boolean {
  const o = optOuts ?? [];
  if (o.includes("all")) return false;
  return category === "essential" || !o.includes(category);
}

/** The opt-out list a submitted profile form describes. The form sends
 *  `emailAll` and one `email_<category>` checkbox per category, each ticked
 *  when that email is ON. */
export function optOutsFromForm(fd: FormData): string[] {
  const on = (k: string) => fd.get(k) === "true";
  const out: string[] = EMAIL_CATEGORIES.filter((c) => !on(`email_${c}`));
  if (!on("emailAll")) out.unshift("all");
  return out;
}

/** For senders that only know an email address (Circle guests, lead-magnet
 *  subscribers): allowed unless a client in this practice with that address
 *  has switched this category off. */
export async function emailAllowedForAddress(
  accountId: string,
  email: string | null | undefined,
  category: EmailCategory | "essential"
): Promise<boolean> {
  if (!email) return true;
  const rows = await db
    .select({ optOuts: clients.emailOptOuts })
    .from(clients)
    .where(
      and(
        eq(clients.accountId, accountId),
        sql`lower(${clients.email}) = lower(${email.trim()})`
      )
    );
  return rows.every((r) => emailAllowed(r.optOuts, category));
}

/** Same check by client id — for senders that know who, but haven't loaded
 *  the row. A missing client reads as allowed (nothing to honour). */
export async function emailAllowedForClient(
  clientId: string | null | undefined,
  category: EmailCategory | "essential"
): Promise<boolean> {
  if (!clientId) return true;
  const [row] = await db
    .select({ optOuts: clients.emailOptOuts })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  return emailAllowed(row?.optOuts, category);
}
