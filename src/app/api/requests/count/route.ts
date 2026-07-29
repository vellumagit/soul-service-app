// Tiny count endpoint behind the sidebar's Requests badge.
//
// Counts ONLY the categories where a *person* is waiting on her — a client, an
// attendee, a buyer. Her own backlog (unwritten notes, missing intentions,
// un-retried bots) is deliberately excluded: those never reach zero, and a
// badge that never clears stops being read within a week.
//
// It previously counted just the two portal request types, so three people
// waiting on Circle seats — or anyone waiting on a refund — showed as nothing
// at all in the sidebar. Reuses getLooseEnds rather than re-deriving the
// conditions, so the badge and the page can't drift apart about who's waiting.
// Affordable because the badge refetches on navigation, not on a timer.
//
// The sidebar (AppShell) is a client component rendered by ~18 different
// pages. Threading a server-computed count through every one of them would
// mean touching all of them and keeping them in sync forever; a single
// fetch-on-navigate is the cheaper, self-contained shape.
//
// Returns only a number — no client names, no request bodies — so there's
// nothing sensitive to leak even if the session check were ever loosened.

import { NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session-cookies";
import { findAccountByEmail } from "@/lib/account";
import { getLooseEnds } from "@/db/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ count: 0 }, { status: 401 });
  const account = await findAccountByEmail(email);
  if (!account) return NextResponse.json({ count: 0 }, { status: 401 });

  try {
    const le = await getLooseEnds(account.accountId);
    const count =
      le.rescheduleRequests.length +
      le.bookingRequests.length +
      le.groupSignups.length +
      le.refundRequests.length +
      le.productPurchases.length;
    return NextResponse.json({ count });
  } catch (err) {
    console.error("[requests] count failed:", err);
    // Fail quiet — a badge that can't load should be invisible, not an error.
    return NextResponse.json({ count: 0 });
  }
}
