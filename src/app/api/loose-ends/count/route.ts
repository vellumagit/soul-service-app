// Tiny count endpoint behind the sidebar's Loose ends badge.
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
import { getPendingPortalRequestsCount } from "@/db/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const email = await getSessionEmail();
  if (!email) return NextResponse.json({ count: 0 }, { status: 401 });
  const account = await findAccountByEmail(email);
  if (!account) return NextResponse.json({ count: 0 }, { status: 401 });

  try {
    const { total } = await getPendingPortalRequestsCount(account.accountId);
    return NextResponse.json({ count: total });
  } catch (err) {
    console.error("[loose-ends] count failed:", err);
    // Fail quiet — a badge that can't load should be invisible, not an error.
    return NextResponse.json({ count: 0 });
  }
}
