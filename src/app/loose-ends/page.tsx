// "Loose ends" — the quiet mop page.
//
// Surfaces sessions that have something unfinished about them. The point
// isn't to nag her into an inbox-zero compulsion; the point is so she can
// scan once at the end of a week and say "ah, that one needs a Closing"
// instead of remembering on her own. Order is by urgency: the failed
// notetaker bot first (might still be recoverable for a recent session),
// then reflections + notes for completed work, then ambient stuff
// (intentions for the week ahead, unpaid sessions).
//
// URL: /loose-ends — sidebar nav item, shortcut `g l`.
//
// Empty state is the win, not a thing to apologize for:
//   "Nothing waiting. The work is clean."

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { QuickActions } from "@/components/QuickActions";
import { requireSession } from "@/lib/session-cookies";
import {
  getLooseEnds,
  getSettings,
  listClientsForPicker,
  type LooseEndRow,
  type RescheduleRequestRow,
  type BookingRequestRow,
  type GroupSignupRow,
} from "@/db/queries";
import { fullDate, shortTime } from "@/lib/format";
import { asLocale } from "@/lib/i18n";
import { LooseEndRowActions } from "@/components/LooseEndRowActions";
import { RescheduleRequestRowActions } from "@/components/RescheduleRequestRowActions";
import { BookingRequestRowActions } from "@/components/BookingRequestRowActions";
import { GroupSignupRowActions } from "@/components/GroupSignupRowActions";

export const dynamic = "force-dynamic";

export default async function LooseEndsPage() {
  const { email, accountId } = await requireSession();

  const [ends, settings, clients] = await Promise.all([
    getLooseEnds(accountId),
    getSettings(accountId),
    listClientsForPicker(accountId),
  ]);
  const locale = asLocale(settings.uiLanguage);

  return (
    <AppShell
      breadcrumb={[{ label: "Loose ends" }]}
      rightAction={<QuickActions clients={clients} />}
      userEmail={email}
      locale={locale}
    >
      <header className="mb-8 max-w-3xl">
        <h1
          className="text-3xl md:text-4xl text-ink-900 serif mb-2"
          style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
        >
          Loose ends
        </h1>
        <p className="text-sm text-ink-500 italic serif-italic">
          {ends.totalCount === 0
            ? "Nothing waiting. The work is clean."
            : `${ends.totalCount} ${ends.totalCount === 1 ? "thread" : "threads"} waiting for you.`}
        </p>
      </header>

      {ends.totalCount === 0 ? (
        <div className="paper-card p-12 text-center max-w-2xl">
          <div className="serif-italic text-lg text-plum-700 mb-2" style={{ fontWeight: 400 }}>
            All clear.
          </div>
          <p className="text-sm text-ink-500">
            Every completed session has notes, a closing, and a payment marked.
            Every upcoming session has an intention. Come back the next time
            something feels half-finished — this page will surface it for you.
          </p>
        </div>
      ) : (
        <div className="space-y-8 max-w-3xl">
          {/* Reschedule requests from the portal — most time-sensitive of all,
              because the client is actively asking for an answer. */}
          {ends.rescheduleRequests.length > 0 && (
            <RescheduleRequestsSection rows={ends.rescheduleRequests} />
          )}

          {/* New booking requests — "I'd like to book another session." */}
          {ends.bookingRequests.length > 0 && (
            <BookingRequestsSection rows={ends.bookingRequests} />
          )}

          {/* Group sign-ups awaiting confirmation or payment. Time-sensitive
              because the session is upcoming. */}
          {ends.groupSignups.length > 0 && (
            <GroupSignupsSection rows={ends.groupSignups} />
          )}

          {/* Most time-sensitive first: a failed notetaker bot might still
              be recoverable if the meeting was recent. */}
          {ends.botFailed.length > 0 && (
            <Section
              title="Notetaker didn't show up"
              hint="The Recall bot hit a fatal status. You can try sending a new one (if the session is happening now), or write notes by hand."
              count={ends.botFailed.length}
              tone="warning"
              rows={ends.botFailed}
              actionLabel="Open session →"
              showRetryBot
            />
          )}

          {ends.needReflection.length > 0 && (
            <Section
              title="Waiting for a closing"
              hint="Completed sessions where you didn't pause for the three quiet questions. Doing it now still counts — the work is fresh until you say it isn't."
              count={ends.needReflection.length}
              rows={ends.needReflection}
              actionLabel="Reflect →"
              showReflectInline
            />
          )}

          {ends.needNotes.length > 0 && (
            <Section
              title="Notes to write up"
              hint="Sessions you marked complete but never typed into. Even a few lines is enough — the texture of the thing is what matters."
              count={ends.needNotes.length}
              rows={ends.needNotes}
              actionLabel="Open session →"
            />
          )}

          {ends.needIntention.length > 0 && (
            <Section
              title="Intentions to set"
              hint="Upcoming sessions without anything in the intention field. Not required — just a kindness to your future self walking in."
              count={ends.needIntention.length}
              rows={ends.needIntention}
              actionLabel="Open session →"
            />
          )}

          {ends.needPayment.length > 0 && (
            <Section
              title="Payments to mark"
              hint="Completed but not yet marked paid. Mark as gifted / no charge if it wasn't a paying session."
              count={ends.needPayment.length}
              rows={ends.needPayment}
              actionLabel="Open session →"
            />
          )}
        </div>
      )}
    </AppShell>
  );
}

function GroupSignupsSection({ rows }: { rows: GroupSignupRow[] }) {
  return (
    <section className="paper-card p-6">
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <h2
          className="serif-italic text-xl text-plum-700"
          style={{ fontWeight: 400 }}
        >
          Group sign-ups
        </h2>
        <span
          className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded"
          style={{
            background: "var(--color-honey-50)",
            color: "var(--color-honey-700)",
          }}
        >
          {rows.length}
        </span>
      </div>
      <p className="text-[13px] text-ink-500 italic mb-4 leading-relaxed">
        People who held a seat on an upcoming circle and are waiting on you
        to confirm or mark paid. Once you&apos;ve received payment, mark
        them paid + confirmed here.
      </p>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li
            key={r.attendeeId}
            className="border-l-2 border-honey-300 pl-4 py-2"
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
              <div>
                <span className="text-sm font-medium text-ink-900">
                  {r.attendeeName}
                </span>
                <span className="text-[12px] text-ink-500 ml-2 break-all">
                  {r.attendeeEmail}
                </span>
              </div>
              <span className="text-[11px] text-ink-400 font-mono">
                {fullDate(r.signedUpAt)}
              </span>
            </div>
            <div className="text-[12px] text-ink-600 mt-0.5">
              <Link
                href={`/groups/${r.groupId}`}
                className="text-plum-700 hover:underline"
              >
                {r.groupName}
              </Link>{" "}
              · {fullDate(r.scheduledAt)} · {shortTime(r.scheduledAt)}
              {!r.paid && r.status === "confirmed" && (
                <span className="ml-2 text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-honey-100 text-honey-700">
                  confirmed · unpaid
                </span>
              )}
              {r.status === "pending" && (
                <span className="ml-2 text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-plum-100 text-plum-700">
                  pending
                </span>
              )}
            </div>
            <div className="mt-2">
              <GroupSignupRowActions
                attendeeId={r.attendeeId}
                isPending={r.status === "pending"}
                isPaid={r.paid}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BookingRequestsSection({ rows }: { rows: BookingRequestRow[] }) {
  return (
    <section className="paper-card p-6">
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <h2
          className="serif-italic text-xl text-plum-700"
          style={{ fontWeight: 400 }}
        >
          Session requests
        </h2>
        <span
          className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded"
          style={{
            background: "var(--color-honey-50)",
            color: "var(--color-honey-700)",
          }}
        >
          {rows.length}
        </span>
      </div>
      <p className="text-[13px] text-ink-500 italic mb-4 leading-relaxed">
        Clients asking to book a new session. Reach out to find a time, then
        resolve the request here to clear it.
      </p>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li
            key={r.requestId}
            className="border-l-2 border-honey-300 pl-4 py-2"
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
              <Link
                href={`/clients/${r.clientId}`}
                className="text-sm font-medium text-ink-900 hover:text-plum-700"
              >
                {r.clientName}
              </Link>
              <span className="text-[11px] text-ink-400 font-mono">
                {fullDate(r.requestedAt)}
              </span>
            </div>
            {r.preferredTimes && (
              <p className="text-[13px] text-ink-700 mt-1.5">
                <span className="text-ink-500 italic">Times: </span>
                {r.preferredTimes}
              </p>
            )}
            {r.reason && (
              <p className="serif-italic text-sm text-ink-700 leading-relaxed mt-1.5">
                &ldquo;{r.reason}&rdquo;
              </p>
            )}
            <div className="mt-2">
              <BookingRequestRowActions
                requestId={r.requestId}
                clientId={r.clientId}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RescheduleRequestsSection({ rows }: { rows: RescheduleRequestRow[] }) {
  return (
    <section className="paper-card p-6">
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <h2
          className="serif-italic text-xl text-plum-700"
          style={{ fontWeight: 400 }}
        >
          Reschedule requests
        </h2>
        <span
          className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded"
          style={{
            background: "var(--color-honey-50)",
            color: "var(--color-honey-700)",
          }}
        >
          {rows.length}
        </span>
      </div>
      <p className="text-[13px] text-ink-500 italic mb-4 leading-relaxed">
        Notes from clients asking to move a session. Reach out to find a
        new time — when the session is rescheduled (or you've decided to
        leave it), resolve the request here to clear it.
      </p>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li
            key={r.requestId}
            className="border-l-2 border-honey-300 pl-4 py-2"
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
              <Link
                href={`/clients/${r.clientId}?tab=sessions#${r.sessionId}`}
                className="text-sm font-medium text-ink-900 hover:text-plum-700"
              >
                {r.clientName}
              </Link>
              <span className="text-[11px] text-ink-400 font-mono">
                {r.type} · {fullDate(r.scheduledAt)} ·{" "}
                {shortTime(r.scheduledAt)}
              </span>
            </div>
            {r.reason && (
              <p className="serif-italic text-sm text-ink-700 leading-relaxed mt-1.5">
                &ldquo;{r.reason}&rdquo;
              </p>
            )}
            <div className="mt-2">
              <RescheduleRequestRowActions
                requestId={r.requestId}
                clientId={r.clientId}
                sessionId={r.sessionId}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Section({
  title,
  hint,
  count,
  tone,
  rows,
  actionLabel,
  showReflectInline,
  showRetryBot,
}: {
  title: string;
  hint: string;
  count: number;
  tone?: "warning";
  rows: LooseEndRow[];
  actionLabel: string;
  showReflectInline?: boolean;
  showRetryBot?: boolean;
}) {
  const isWarning = tone === "warning";
  return (
    <section className="paper-card p-6">
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <h2
          className="serif-italic text-xl text-plum-700"
          style={{ fontWeight: 400 }}
        >
          {title}
        </h2>
        <span
          className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded"
          style={{
            background: isWarning
              ? "var(--color-honey-50)"
              : "var(--color-plum-50)",
            color: isWarning ? "var(--color-honey-700)" : "var(--color-plum-700)",
          }}
        >
          {count}
        </span>
      </div>
      <p className="text-[13px] text-ink-500 italic mb-4 leading-relaxed">
        {hint}
      </p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.sessionId}
            className="flex items-center justify-between gap-3 py-2 px-3 rounded-md hover:bg-ink-50 group"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={`/clients/${r.clientId}?tab=sessions#${r.sessionId}`}
                className="text-sm text-ink-900 font-medium hover:text-plum-700 truncate block"
              >
                {r.clientName}
              </Link>
              <div className="text-[11px] text-ink-500 mt-0.5">
                {r.type} · {fullDate(r.scheduledAt)} · {shortTime(r.scheduledAt)}
              </div>
            </div>
            <LooseEndRowActions
              row={r}
              fallbackHref={`/clients/${r.clientId}?tab=sessions#${r.sessionId}`}
              fallbackLabel={actionLabel}
              showReflectInline={!!showReflectInline}
              showRetryBot={!!showRetryBot}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
