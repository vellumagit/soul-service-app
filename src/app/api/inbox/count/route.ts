// Tiny count endpoint behind the sidebar's Inbox badge.
//
// Counts NEW (untriaged) inbound messages — the pending lead-form submissions
// waiting in /network/inbox: contact-form notes, quiz leads, lead-magnet
// sign-ups. Spam (status "spam") and already-handled items (accepted/rejected)
// don't count, so the badge is "how many new people reached out" and clears as
// she triages. Reuses getLeadInboxCount so the badge and the inbox page can't
// drift apart.
//
// Same shape as /api/requests/count: refetches on navigation (see InboxBadge),
// returns only a number, fails quiet.

import { NextResponse } from "next/server";
import { getSessionEmail } from "@/lib/session-cookies";
import { findAccountByEmail } from "@/lib/account";
import { getLeadInboxCount } from "@/db/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ count: 0 }, { status: 401 });
  const account = await findAccountByEmail(email);
  if (!account) return NextResponse.json({ count: 0 }, { status: 401 });

  try {
    const count = await getLeadInboxCount(account.accountId);
    return NextResponse.json({ count });
  } catch (err) {
    console.error("[inbox] count failed:", err);
    return NextResponse.json({ count: 0 });
  }
}
