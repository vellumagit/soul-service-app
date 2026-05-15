// Vercel Cron entrypoint — runs once an hour and sends due session reminders.
// Schedule lives in `vercel.json` at the repo root.
//
// Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron-triggered
// requests. Anyone else hitting this endpoint gets 401.
import { NextResponse } from "next/server";
import { processReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";
// Reminders can take a few seconds across many accounts — give it room.
export const maxDuration = 60;

export async function GET(request: Request) {
  // Auth: must carry the cron secret. Reject everyone else.
  const auth = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const stats = await processReminders();
  return NextResponse.json({ ok: true, ...stats });
}
