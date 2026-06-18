// Portal session detail — the page reached via the "Request reschedule"
// link on the home card. Shows the session details and a small form to
// ask for a reschedule. NOT self-serve — the practitioner gets a chip on
// her side and a row in Loose ends; she decides what to do.

import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sessions, rescheduleRequests } from "@/db/schema";
import { requirePortalSession } from "@/lib/portal-auth";
import { fullDate, shortTime } from "@/lib/format";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function saveClientStatedIntention(formData: FormData): Promise<void> {
  "use server";
  const portal = await requirePortalSession();
  const sessionIdRaw = formData.get("sessionId");
  const intentionRaw = formData.get("clientStatedIntention");
  if (typeof sessionIdRaw !== "string") return;
  const intention =
    typeof intentionRaw === "string" ? intentionRaw.trim() : "";
  const valueToSave =
    intention.length === 0 ? null : intention.slice(0, 1000);

  await db
    .update(sessions)
    .set({
      clientStatedIntention: valueToSave,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sessions.id, sessionIdRaw),
        eq(sessions.accountId, portal.accountId),
        eq(sessions.clientId, portal.clientId)
      )
    );

  revalidatePath(`/portal/sessions/${sessionIdRaw}`);
  revalidatePath("/portal/arc");
  // Also surfaces in /sessions/[id]/prep on the practitioner side, so
  // she walks in already holding what the client brought.
  revalidatePath(`/sessions/${sessionIdRaw}/prep`);
  revalidatePath(`/clients/${portal.clientId}`);
}

async function submitRescheduleRequest(formData: FormData): Promise<void> {
  "use server";
  const sessionIdRaw = formData.get("sessionId");
  const reasonRaw = formData.get("reason");
  if (typeof sessionIdRaw !== "string") return;
  const reason =
    typeof reasonRaw === "string" ? reasonRaw.trim().slice(0, 1000) : null;

  const portalSession = await requirePortalSession();

  // Verify the session belongs to this client + account before inserting.
  const owned = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.id, sessionIdRaw),
        eq(sessions.accountId, portalSession.accountId),
        eq(sessions.clientId, portalSession.clientId)
      )
    )
    .limit(1);
  if (owned.length === 0) return;

  await db.insert(rescheduleRequests).values({
    accountId: portalSession.accountId,
    clientId: portalSession.clientId,
    sessionId: sessionIdRaw,
    reason: reason && reason.length > 0 ? reason : null,
    status: "pending",
  });

  // Practitioner-side surfaces — make sure the chip + Loose ends update.
  revalidatePath(`/clients/${portalSession.clientId}`);
  revalidatePath("/loose-ends");

  redirect(`/portal/sessions/${sessionIdRaw}?submitted=1`);
}

export default async function PortalSessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const portalSession = await requirePortalSession();
  const { id } = await params;
  const { submitted } = await searchParams;

  const rows = await db
    .select({
      id: sessions.id,
      scheduledAt: sessions.scheduledAt,
      durationMinutes: sessions.durationMinutes,
      type: sessions.type,
      status: sessions.status,
      meetUrl: sessions.meetUrl,
      intention: sessions.intention,
      clientStatedIntention: sessions.clientStatedIntention,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.id, id),
        eq(sessions.accountId, portalSession.accountId),
        eq(sessions.clientId, portalSession.clientId)
      )
    )
    .limit(1);
  const session = rows[0];
  if (!session) {
    redirect("/portal");
  }

  // Any pending reschedule request for this session already?
  const pending = await db
    .select({
      id: rescheduleRequests.id,
      status: rescheduleRequests.status,
      createdAt: rescheduleRequests.createdAt,
    })
    .from(rescheduleRequests)
    .where(
      and(
        eq(rescheduleRequests.sessionId, id),
        eq(rescheduleRequests.accountId, portalSession.accountId)
      )
    )
    .orderBy(desc(rescheduleRequests.createdAt))
    .limit(1);
  const hasPending = pending[0]?.status === "pending";

  const scheduled = new Date(session.scheduledAt);

  return (
    <div className="max-w-xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <Link
        href="/portal"
        className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 mb-6"
      >
        ← Back to your space
      </Link>

      <section className="paper-card p-6 md:p-8 mb-6">
        <p className="text-[10px] uppercase tracking-widest text-honey-700 font-mono mb-2">
          {session.status === "completed" ? "Session held" : "Scheduled"}
        </p>
        <h1
          className="text-2xl text-ink-900 serif mb-1"
          style={{ fontWeight: 500, letterSpacing: "-0.01em" }}
        >
          {fullDate(scheduled)}
        </h1>
        <p className="text-sm text-ink-600">
          {shortTime(scheduled)} · {session.durationMinutes} min · {session.type}
        </p>
        {session.intention && (
          <p
            className="serif-italic text-base text-ink-700 leading-relaxed mt-4 pl-4 border-l-2 border-honey-300"
            style={{ fontWeight: 400 }}
          >
            &ldquo;{session.intention}&rdquo;
          </p>
        )}
        {session.meetUrl && session.status !== "completed" && (
          <a
            href={session.meetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-4 px-4 py-2 text-sm rounded-md border border-ink-200 text-ink-700 hover:bg-ink-50"
          >
            Open Meet link
          </a>
        )}
      </section>

      {/* What you're bringing — client sets their own intention for the
          session. Only on upcoming sessions; past sessions are no longer
          a place to set intentions. */}
      {session.status !== "completed" && (
        <section className="paper-card p-6 md:p-8 mb-6">
          <h2
            className="serif-italic text-xl text-plum-700 mb-1"
            style={{ fontWeight: 400 }}
          >
            What you&apos;re bringing
          </h2>
          <p className="text-sm text-ink-600 italic mb-4 leading-relaxed">
            Anything you&apos;d like to name for yourself before the session.
            Your practitioner sees this in her prep view so she can walk in
            holding it with you. Optional.
          </p>
          <form action={saveClientStatedIntention} className="space-y-3">
            <input type="hidden" name="sessionId" value={session.id} />
            <textarea
              name="clientStatedIntention"
              defaultValue={session.clientStatedIntention ?? ""}
              rows={4}
              maxLength={1000}
              placeholder="A question, a feeling, a fragment, something you&apos;re sitting with…"
              className="w-full px-3 py-2 text-sm leading-relaxed border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100 resize-y"
            />
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium transition-colors"
            >
              Save
            </button>
          </form>
        </section>
      )}

      {/* Reschedule request form — only for upcoming sessions */}
      {session.status !== "completed" && (
        <section className="paper-card p-6 md:p-8">
          <h2
            className="serif-italic text-xl text-plum-700 mb-1"
            style={{ fontWeight: 400 }}
          >
            Need to reschedule?
          </h2>
          <p className="text-sm text-ink-600 italic mb-4 leading-relaxed">
            Send a note. Your practitioner will reach out to find a new time
            — this isn't an automatic change.
          </p>

          {submitted === "1" ? (
            <div
              className="rounded-md p-4 text-sm leading-relaxed"
              style={{
                background: "var(--color-honey-50)",
                border: "1px solid var(--color-honey-100)",
                color: "var(--color-honey-700)",
              }}
            >
              Sent. Your practitioner will be in touch.
            </div>
          ) : hasPending ? (
            <div
              className="rounded-md p-4 text-sm leading-relaxed"
              style={{
                background: "var(--color-plum-50)",
                border: "1px solid var(--color-plum-100)",
                color: "var(--color-plum-700)",
              }}
            >
              You already sent a request for this session. Your practitioner
              has been notified.
            </div>
          ) : (
            <form
              action={submitRescheduleRequest}
              className="space-y-4"
            >
              <input type="hidden" name="sessionId" value={session.id} />
              <label className="block">
                <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
                  Anything you'd like her to know? (optional)
                </span>
                <textarea
                  name="reason"
                  rows={4}
                  maxLength={1000}
                  placeholder="Out of town that week — could we move it later in the month?"
                  className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100 resize-y leading-relaxed"
                />
              </label>
              <button
                type="submit"
                className="px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium transition-colors"
              >
                Send the request
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
