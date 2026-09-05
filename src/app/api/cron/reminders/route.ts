// Vercel Cron entrypoint — runs once an hour and sends due session reminders.
// Schedule lives in `vercel.json` at the repo root.
//
// Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron-triggered
// requests. Anyone else hitting this endpoint gets 401.
import { NextResponse } from "next/server";
import { processReminders } from "@/lib/reminders";
import { processLeadMagnetFollowups } from "@/lib/lead-magnet-nurture";
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

  // Just-in-time notetaker bots: send a Recall bot for every session starting
  // in the next ~45 min that has a Meet link, auto-add on, and no bot yet.
  // A few calls per tick instead of a 52-bot burst at series-creation time.
  // Best-effort; no-op when Recall isn't configured.
  let recallBots = { due: 0, created: 0, failed: 0, errors: [] as string[] };
  try {
    const { scheduleDueRecallBots } = await import("@/lib/recall-scheduler");
    recallBots = await scheduleDueRecallBots();
  } catch (err) {
    console.error("[cron] recall bot sweep failed", err);
  }

  // Lead-magnet follow-up "flow" — nurture emails due since the last tick.
  // Cheap when nobody has set one up (early-returns after one small query), so
  // it rides every tick without adding Neon wake cost. Best-effort.
  let leadMagnetFollowups = { candidates: 0, sent: 0 };
  try {
    leadMagnetFollowups = await processLeadMagnetFollowups();
  } catch (err) {
    console.error("[cron] lead-magnet follow-ups failed", err);
  }

  // Top up recurring weekly Circles so the storefront always has the next few
  // weeks of open seats. Idempotent + deduped, so running hourly is safe.
  // The recurring-Circle top-up and the empty-cancelled prune are maintenance,
  // NOT time-sensitive like reminders — running them on every tick is just
  // redundant DB work (and write churn, which costs on usage-based billing).
  // Run them at most once a day, at the ~04:00 UTC tick. The minute guard
  // matters because the cron fires every 10 min, so hour-only would run this
  // six times during hour 4. Both are idempotent, so a skipped day (a delayed
  // or missed cron run) self-heals on the next daily pass.
  const nowUtc = new Date();
  const runDailyMaintenance =
    nowUtc.getUTCHours() === 4 && nowUtc.getUTCMinutes() < 10;
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
    recallBots,
    leadMagnetFollowups,
    recurringCircles,
    prunedCircles,
  });
}
