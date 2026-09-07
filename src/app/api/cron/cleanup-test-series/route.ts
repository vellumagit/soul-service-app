// ONE-OFF cleanup — remove the recurring-series TEST DATA that bloated two
// client profiles (Vlado + Svitlana-as-client) to 500+ empty sessions each,
// froze their profile pages, and littered Google Calendar with hundreds of
// 5-minute events. Runs in PRODUCTION on purpose: the Google refresh token is
// encrypted with TOKEN_ENCRYPTION_KEY, which only exists in the deployment
// env — it can't be decrypted from a local script.
//
// Lives under /api/cron/ (not because it's scheduled — it isn't) but because
// proxy.ts treats that prefix as public, so a CRON_SECRET-bearer call reaches
// the handler instead of being redirected to /signin by the session gate.
//
// This route is TEMPORARY. Remove it once the cleanup is confirmed done.
//
// Safety:
//   - Auth: same CRON_SECRET bearer as the cron routes. 401 otherwise.
//   - DRY RUN by default. Add ?execute=true to actually delete.
//   - Deletable set is narrow: FUTURE + scheduled + in a series + empty (no
//     transcript/summary/notes) + unpaid. Real completed/paid history and any
//     standalone (non-series) sessions are never touched.
//   - Per row: delete the Google event FIRST (notify:false → no client email),
//     THEN delete the DB row. A row whose Google delete fails is left in place,
//     so nothing is ever orphaned. Resumable — call until remaining hits 0.
//   - Bounded batch per call (?limit=, default 300) to stay under maxDuration.
import { NextResponse } from "next/server";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { deleteCalendarEventsForSessions } from "@/lib/google-calendar";
import { cancelBot } from "@/lib/recall";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ACCOUNT = "8041ea06-4cdc-4cd3-aaea-3754a11998b1";
const CLIENT_IDS = [
  "2ee7410d-1ea0-49d3-8515-d30dc55634ec", // Vlado Kanizaj
  "89fd9af8-f07b-424b-be53-c55d639bf893", // Svitlana Pavliuk (as client)
];

function deletableWhere() {
  return and(
    eq(sessions.accountId, ACCOUNT),
    inArray(sessions.clientId, CLIENT_IDS),
    eq(sessions.status, "scheduled"),
    isNotNull(sessions.seriesId),
    sql`${sessions.scheduledAt} > now()`,
    sql`(${sessions.transcript} IS NULL OR length(${sessions.transcript}) = 0)`,
    sql`(${sessions.aiSummary} IS NULL OR length(${sessions.aiSummary}) = 0)`,
    sql`(${sessions.notes} IS NULL OR length(${sessions.notes}) = 0)`,
    sql`${sessions.paid} IS NOT TRUE`
  );
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const execute = url.searchParams.get("execute") === "true";
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "300", 10) || 300, 1),
    500
  );

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(sessions)
    .where(deletableWhere());

  if (!execute) {
    const [{ withGoogle }] = await db
      .select({ withGoogle: sql<number>`count(*)::int` })
      .from(sessions)
      .where(and(deletableWhere(), isNotNull(sessions.googleEventId)));
    return NextResponse.json({
      ok: true,
      mode: "dry-run",
      totalDeletable: total,
      withGoogleEvent: withGoogle,
      note: "Add ?execute=true to delete. Re-run until remaining = 0.",
    });
  }

  // Grab one bounded batch.
  const batch = await db
    .select({
      id: sessions.id,
      googleEventId: sessions.googleEventId,
      recallBotId: sessions.recallBotId,
    })
    .from(sessions)
    .where(deletableWhere())
    .limit(limit);

  // 1) Google events first — the app helper deletes with notify:false and
  //    nulls googleEventId on the rows it clears (or that were already gone).
  const withGoogle = batch.filter(
    (r): r is { id: string; googleEventId: string; recallBotId: string | null } =>
      !!r.googleEventId
  );
  const gres = await deleteCalendarEventsForSessions(
    ACCOUNT,
    withGoogle.map((r) => ({ id: r.id, googleEventId: r.googleEventId })),
    { notify: false }
  );
  const clearedSet = new Set(gres.cleared);

  // 2) A row is safe to delete if it had no Google event, or its event cleared.
  const failedSet = new Set(gres.failed);
  const deletableNow = batch.filter((r) => !failedSet.has(r.id));

  // 3) Cancel any Recall bots on those rows (best-effort).
  let botsCancelled = 0;
  for (const r of deletableNow) {
    if (!r.recallBotId) continue;
    try {
      await cancelBot(r.recallBotId);
      botsCancelled++;
    } catch {
      // best-effort — a stuck bot shouldn't block row deletion
    }
  }

  // 4) Delete the rows.
  let deleted = 0;
  const ids = deletableNow.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const res = await db
      .delete(sessions)
      .where(and(eq(sessions.accountId, ACCOUNT), inArray(sessions.id, part)))
      .returning({ id: sessions.id });
    deleted += res.length;
  }

  const [{ remaining }] = await db
    .select({ remaining: sql<number>`count(*)::int` })
    .from(sessions)
    .where(deletableWhere());

  return NextResponse.json({
    ok: true,
    mode: "execute",
    batchSize: batch.length,
    googleCleared: clearedSet.size,
    googleFailed: gres.failed.length,
    botsCancelled,
    rowsDeleted: deleted,
    remaining,
    note: remaining > 0 ? "Re-run to continue." : "Done — cleanup complete.",
  });
}
