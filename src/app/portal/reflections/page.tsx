// "Reflections" — the journal room of the portal.
//
// Free-form entries the client writes between sessions. Can be attached
// to a specific past session, or stand alone ("just something I noticed
// this week"). The practitioner sees these on the client overview as
// the most valuable kind of pre-session context — what's been alive for
// the client outside the held hour.
//
// The form lives at the top. The list is below, newest first. Each
// existing entry has a small edit + delete action via a tiny client
// component. No tagging, no streaks, no "you've reflected N days in a
// row" — those would be the wrong shape for soul work.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { clientReflections, sessions } from "@/db/schema";
import { requirePortalSession } from "@/lib/portal-auth";
import { fullDate } from "@/lib/format";
import { ReflectionEntry } from "@/components/ReflectionEntry";

export const dynamic = "force-dynamic";

async function submitReflection(formData: FormData): Promise<void> {
  "use server";
  const portal = await requirePortalSession();
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length === 0) return;
  const sessionIdRaw = formData.get("sessionId");
  let sessionId: string | null = null;
  if (typeof sessionIdRaw === "string" && sessionIdRaw.length > 0) {
    // Verify that session belongs to this client BEFORE we attach.
    const owned = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.id, sessionIdRaw),
          eq(sessions.accountId, portal.accountId),
          eq(sessions.clientId, portal.clientId)
        )
      )
      .limit(1);
    if (owned.length > 0) sessionId = sessionIdRaw;
  }
  await db.insert(clientReflections).values({
    accountId: portal.accountId,
    clientId: portal.clientId,
    sessionId,
    body: body.slice(0, 5000),
  });
  revalidatePath("/portal/reflections");
  revalidatePath(`/clients/${portal.clientId}`);
  redirect("/portal/reflections");
}

export default async function PortalReflectionsPage() {
  const session = await requirePortalSession();
  const firstName =
    session.clientFullName.split(" ")[0] ?? session.clientFullName;

  // Past non-cancelled sessions for the optional "attach to" dropdown.
  // We allow attaching to ANY past session, completed or not (e.g., she
  // wants to reflect on a session that's already happened but isn't
  // marked completed yet by the practitioner).
  const [reflections, attachableSessions] = await Promise.all([
    db
      .select({
        id: clientReflections.id,
        body: clientReflections.body,
        createdAt: clientReflections.createdAt,
        sessionId: clientReflections.sessionId,
        sessionScheduledAt: sessions.scheduledAt,
        sessionType: sessions.type,
      })
      .from(clientReflections)
      .leftJoin(sessions, eq(sessions.id, clientReflections.sessionId))
      .where(
        and(
          eq(clientReflections.accountId, session.accountId),
          eq(clientReflections.clientId, session.clientId)
        )
      )
      .orderBy(desc(clientReflections.createdAt)),
    db
      .select({
        id: sessions.id,
        scheduledAt: sessions.scheduledAt,
        type: sessions.type,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.accountId, session.accountId),
          eq(sessions.clientId, session.clientId),
          ne(sessions.status, "cancelled")
        )
      )
      .orderBy(desc(sessions.scheduledAt))
      .limit(12),
  ]);

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-8 md:py-10">
      <header className="mb-7">
        <h1
          className="text-2xl md:text-3xl text-ink-900 serif mb-1"
          style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
        >
          Reflections
        </h1>
        <p className="text-sm text-ink-500 italic serif-italic">
          A quiet place to write between sessions, {firstName}. What you
          notice here helps your practitioner walk in already holding
          some of it.
        </p>
      </header>

      <section className="paper-card paper-card--feature p-5 md:p-6 mb-8">
        <form action={submitReflection} className="space-y-4">
          <label className="block">
            <span className="serif-italic text-base text-plum-700 block mb-2" style={{ fontWeight: 400 }}>
              Write a reflection
            </span>
            <textarea
              name="body"
              required
              rows={5}
              maxLength={5000}
              placeholder="A texture, a noticing, a question, a fragment from your week…"
              className="w-full px-3 py-2.5 text-sm leading-relaxed border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100 resize-y"
            />
          </label>
          <div className="flex items-baseline gap-3 flex-wrap">
            <label className="block flex-1 min-w-[200px]">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-mono">
                Attach to a session (optional)
              </span>
              <select
                name="sessionId"
                defaultValue=""
                className="mt-1.5 w-full px-2.5 py-1.5 text-sm border border-ink-200 rounded-md bg-white"
              >
                <option value="">— no session, just standalone —</option>
                {attachableSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fullDate(new Date(s.scheduledAt))} · {s.type}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium transition-colors shrink-0 self-end"
            >
              Save reflection
            </button>
          </div>
        </form>
      </section>

      {reflections.length === 0 ? (
        <div className="paper-card p-10 text-center text-sm text-ink-500 italic">
          Nothing here yet. The first note is yours to write.
        </div>
      ) : (
        <ol className="space-y-4">
          {reflections.map((r) => (
            <ReflectionEntry
              key={r.id}
              id={r.id}
              body={r.body}
              createdAt={new Date(r.createdAt)}
              sessionLabel={
                r.sessionId && r.sessionScheduledAt
                  ? `${fullDate(new Date(r.sessionScheduledAt))} · ${r.sessionType ?? "session"}`
                  : null
              }
            />
          ))}
        </ol>
      )}
    </div>
  );
}
