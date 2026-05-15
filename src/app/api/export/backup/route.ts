// Full JSON backup for the signed-in account.
// Dumps every user-data table scoped to this account into a single file.
// Designed to be human-readable + future-restorable.
import { eq } from "drizzle-orm";
import {
  db,
  accounts,
  clients,
  sessions,
  sessionSeries,
  attachments,
  goals,
  tasks,
  communications,
  emailTemplates,
  noteTemplates,
  practitionerSettings,
  importantPeople,
  themes,
  observations,
} from "@/db";
import { requireSession } from "@/lib/session-cookies";

export const dynamic = "force-dynamic";

export async function GET() {
  const { accountId } = await requireSession();

  // Run all the queries in parallel — they're independent.
  const [
    account,
    clientRows,
    sessionRows,
    seriesRows,
    attachmentRows,
    goalRows,
    taskRows,
    commRows,
    emailTplRows,
    noteTplRows,
    settingsRows,
    peopleRows,
    themeRows,
    observationRows,
  ] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1),
    db.select().from(clients).where(eq(clients.accountId, accountId)),
    db.select().from(sessions).where(eq(sessions.accountId, accountId)),
    db
      .select()
      .from(sessionSeries)
      .where(eq(sessionSeries.accountId, accountId)),
    db.select().from(attachments).where(eq(attachments.accountId, accountId)),
    db.select().from(goals).where(eq(goals.accountId, accountId)),
    db.select().from(tasks).where(eq(tasks.accountId, accountId)),
    db
      .select()
      .from(communications)
      .where(eq(communications.accountId, accountId)),
    db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.accountId, accountId)),
    db
      .select()
      .from(noteTemplates)
      .where(eq(noteTemplates.accountId, accountId)),
    db
      .select()
      .from(practitionerSettings)
      .where(eq(practitionerSettings.accountId, accountId)),
    db
      .select()
      .from(importantPeople)
      .where(eq(importantPeople.accountId, accountId)),
    db.select().from(themes).where(eq(themes.accountId, accountId)),
    db
      .select()
      .from(observations)
      .where(eq(observations.accountId, accountId)),
  ]);

  // Don't leak Google OAuth tokens or other secrets in the backup. The
  // settings row stays but we null out fields that aren't meaningful to
  // restore manually.
  const sanitizedSettings = settingsRows.map((s) => ({
    ...s,
    googleAccessToken: null,
    googleRefreshToken: null,
    googleTokenExpiresAt: null,
  }));

  const backup = {
    exportedAt: new Date().toISOString(),
    appVersion: "soul-service v1",
    account: account[0] ?? null,
    counts: {
      clients: clientRows.length,
      sessions: sessionRows.length,
      sessionSeries: seriesRows.length,
      attachments: attachmentRows.length,
      goals: goalRows.length,
      tasks: taskRows.length,
      communications: commRows.length,
      emailTemplates: emailTplRows.length,
      noteTemplates: noteTplRows.length,
      importantPeople: peopleRows.length,
      themes: themeRows.length,
      observations: observationRows.length,
    },
    settings: sanitizedSettings,
    clients: clientRows,
    sessions: sessionRows,
    sessionSeries: seriesRows,
    attachments: attachmentRows,
    goals: goalRows,
    tasks: taskRows,
    communications: commRows,
    emailTemplates: emailTplRows,
    noteTemplates: noteTplRows,
    importantPeople: peopleRows,
    themes: themeRows,
    observations: observationRows,
  };

  const ymd = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="soul-service-backup-${ymd}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
