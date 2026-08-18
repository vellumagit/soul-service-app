// Vercel Cron entrypoint — runs once an hour and sends due session reminders.
// Schedule lives in `vercel.json` at the repo root.
//
// Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron-triggered
// requests. Anyone else hitting this endpoint gets 401.
import { NextResponse } from "next/server";
import { processReminders } from "@/lib/reminders";
import {
  ensureRecurringCircleSessions,
  pruneEmptyCancelledCircleSessions,
} from "@/lib/recurring-circles";

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

  // Top up recurring weekly Circles so the storefront always has the next few
  // weeks of open seats. Idempotent + deduped, so running hourly is safe.
  // The recurring-Circle top-up and the empty-cancelled prune are maintenance,
  // NOT time-sensitive like reminders — running them every hourly tick is just
  // redundant DB work (and write churn, which costs on usage-based billing).
  // Run them at most once a day. Both are idempotent, so a skipped day (a
  // delayed/missed cron run) self-heals on the next daily pass.
  const runDailyMaintenance = new Date().getUTCHours() === 4;
  let recurringCircles = { groups: 0, created: 0 };
  let prunedCircles = 0;
  if (runDailyMaintenance) {
    try {
      recurringCircles = await ensureRecurringCircleSessions();
    } catch (err) {
      console.error("[cron] recurring circles top-up failed", err);
    }
    try {
      prunedCircles = await pruneEmptyCancelledCircleSessions();
    } catch (err) {
      console.error("[cron] empty-cancelled circle prune failed", err);
    }
  }

  return NextResponse.json({
    ok: true,
    ...stats,
    recurringCircles,
    prunedCircles,
  });
}
