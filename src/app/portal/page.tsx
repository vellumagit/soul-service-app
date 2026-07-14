// Client portal home — "Your space".
//
// What the client sees:
//   1. A quiet greeting using their first name + her name
//   2. The NEXT upcoming session card (with Join Meet button when within 30 min)
//   3. Outstanding balance card (if any sessions are unpaid)
//   4. Past sessions list (most recent first, last 6)
//   5. "How to reach <practitioner>" contact card
//   6. Sign out link
//
// What the client does NOT see (deliberate):
//   - Notes she wrote about the session
//   - Closing reflections / never-forget lines / milestones
//   - Anyone else's data on this practitioner's roster
//   - Themes / patterns / private notes

import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { sessions, practitionerSettings, clients } from "@/db/schema";
import { requirePortalSession, clearPortalSessionCookie } from "@/lib/portal-auth";
import { PortalTimezoneCapture } from "@/components/PortalTimezoneCapture";
import { fullDate, shortTime } from "@/lib/format";

export const dynamic = "force-dynamic";

async function signOut() {
  "use server";
  await clearPortalSessionCookie();
  const { redirect } = await import("next/navigation");
  redirect("/portal/sign-in");
}

export default async function PortalHomePage() {
  const session = await requirePortalSession();
  const now = new Date();

  // Pull every non-cancelled session for this client + practitioner settings,
  // in parallel.
  const [sessionRows, settingsRows] = await Promise.all([
    db
      .select({
        id: sessions.id,
        scheduledAt: sessions.scheduledAt,
        durationMinutes: sessions.durationMinutes,
        type: sessions.type,
        status: sessions.status,
        meetUrl: sessions.meetUrl,
        intention: sessions.intention,
        clientStatedIntention: sessions.clientStatedIntention,
        clientVisibleNote: sessions.clientVisibleNote,
        paid: sessions.paid,
        paymentAmountCents: sessions.paymentAmountCents,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.accountId, session.accountId),
          eq(sessions.clientId, session.clientId),
          ne(sessions.status, "cancelled")
        )
      )
      .orderBy(desc(sessions.scheduledAt)),
    db
      .select({
        practitionerName: practitionerSettings.practitionerName,
        businessName: practitionerSettings.businessName,
        contactEmail: practitionerSettings.businessEmail,
        contactPhone: practitionerSettings.businessPhone,
      })
      .from(practitionerSettings)
      .where(eq(practitionerSettings.accountId, session.accountId))
      .limit(1),
  ]);
  const settings = settingsRows[0] ?? null;

  // Whether we already know this client's timezone — drives the invisible
  // auto-capture below (so reminder emails render in THEIR local time).
  const [clientRow] = await db
    .select({ timezone: clients.timezone })
    .from(clients)
    .where(eq(clients.id, session.clientId))
    .limit(1);
  const clientHasTz = !!clientRow?.timezone;

  const upcoming = sessionRows
    .filter((s) => new Date(s.scheduledAt) >= now && s.status !== "completed")
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
  const past = sessionRows
    .filter((s) => new Date(s.scheduledAt) < now || s.status === "completed")
    .slice(0, 6);
  const nextUp = upcoming[0] ?? null;
  // Most recent past session — used for the "Since your last session…"
  // note. Sorted desc by scheduledAt because sessionRows already is.
  const mostRecentPast = past[0] ?? null;
  const sinceLastNote = mostRecentPast?.clientVisibleNote?.trim() || null;
  const unpaid = sessionRows.filter(
    (s) => s.status === "completed" && !s.paid && (s.paymentAmountCents ?? 0) > 0
  );
  const unpaidTotalCents = unpaid.reduce(
    (sum, s) => sum + (s.paymentAmountCents ?? 0),
    0
  );

  const firstName = session.clientFullName.split(" ")[0] ?? session.clientFullName;
  const practitionerName = settings?.practitionerName ?? "Your practitioner";

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-8 md:py-12">
      {/* Invisible: record the client's timezone so their emails localize
          to their own clock (no-op once we already know it). */}
      <PortalTimezoneCapture hasTimezone={clientHasTz} />

      {/* Header — quiet greeting */}
      <header className="mb-8 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1
            className="text-2xl md:text-3xl text-ink-900 serif"
            style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
          >
            Hi {firstName}
          </h1>
          <p className="text-sm text-ink-500 italic serif-italic mt-1">
            Your space with {practitionerName}
          </p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="text-xs text-ink-500 hover:text-ink-900 underline-offset-2 hover:underline"
          >
            Sign out
          </button>
        </form>
      </header>

      <div className="space-y-6">
        {/* Since your last session — short note from her, if she shared one */}
        {sinceLastNote && (
          <SinceLastSessionCard
            note={sinceLastNote}
            sessionAt={new Date(mostRecentPast!.scheduledAt)}
            practitionerName={practitionerName}
          />
        )}

        {/* Next session */}
        {nextUp ? (
          <NextSessionCard session={nextUp} now={now} />
        ) : (
          <div className="paper-card p-6 text-center">
            <p
              className="serif-italic text-base text-plum-700 mb-1"
              style={{ fontWeight: 400 }}
            >
              Nothing on the calendar yet.
            </p>
            <p className="text-sm text-ink-500 italic mb-4">
              When you&apos;re ready, send a note and {practitionerName.split(" ")[0]} will reach out to find a time.
            </p>
            <Link
              href="/portal/book"
              className="inline-block px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium transition-colors"
            >
              Book another session →
            </Link>
          </div>
        )}

        {/* Quiet "book another" CTA — appears even when there IS a next
            session, for clients who want to schedule a follow-up. */}
        {nextUp && (
          <section className="paper-card p-5 md:p-6 text-center">
            <p className="serif-italic text-sm text-plum-700 mb-2" style={{ fontWeight: 400 }}>
              Want to book another session?
            </p>
            <Link
              href="/portal/book"
              className="inline-block text-xs text-plum-700 hover:underline font-medium"
            >
              Send a note →
            </Link>
          </section>
        )}

        {/* Outstanding */}
        {unpaid.length > 0 && (
          <OutstandingCard count={unpaid.length} totalCents={unpaidTotalCents} />
        )}

        {/* Contact */}
        <ContactCard
          practitionerName={practitionerName}
          businessName={settings?.businessName ?? null}
          contactEmail={settings?.contactEmail ?? null}
          contactPhone={settings?.contactPhone ?? null}
        />

        {/* Your details — read-only profile card */}
        <YourDetailsCard
          clientFullName={session.clientFullName}
          clientEmail={session.clientEmail}
          practitionerName={practitionerName}
        />
      </div>
    </div>
  );
}

function SinceLastSessionCard({
  note,
  sessionAt,
  practitionerName,
}: {
  note: string;
  sessionAt: Date;
  practitionerName: string;
}) {
  const firstName = practitionerName.split(" ")[0] ?? practitionerName;
  return (
    <section
      className="rounded-md p-5 md:p-6"
      style={{
        background: "var(--color-honey-50)",
        border: "1px solid var(--color-honey-100)",
      }}
    >
      <p className="text-[10px] uppercase tracking-widest text-honey-700 font-mono mb-2">
        Since your last session
      </p>
      <p
        className="serif-italic text-base text-ink-800 leading-relaxed"
        style={{ fontWeight: 400 }}
      >
        &ldquo;{note}&rdquo;
      </p>
      <p className="text-[11px] text-ink-500 italic mt-3">
        — {firstName}, after your session on {fullDate(sessionAt)}
      </p>
    </section>
  );
}

function YourDetailsCard({
  clientFullName,
  clientEmail,
  practitionerName,
}: {
  clientFullName: string;
  clientEmail: string | null;
  practitionerName: string;
}) {
  const firstName = practitionerName.split(" ")[0] ?? practitionerName;
  return (
    <section className="paper-card p-6">
      <h2
        className="serif-italic text-base text-plum-700 mb-3"
        style={{ fontWeight: 400 }}
      >
        Your details
      </h2>
      <div className="space-y-1.5 text-sm">
        <div>
          <span className="text-ink-500 text-[11px] uppercase tracking-wider font-mono mr-2">
            name
          </span>
          <span className="text-ink-700">{clientFullName}</span>
        </div>
        {clientEmail && (
          <div>
            <span className="text-ink-500 text-[11px] uppercase tracking-wider font-mono mr-2">
              email
            </span>
            <span className="text-ink-700">{clientEmail}</span>
          </div>
        )}
      </div>
      <p className="text-[11px] text-ink-500 italic mt-3 leading-snug">
        Let {firstName} know if any of this changes — she keeps your file
        directly.
      </p>
    </section>
  );
}

function NextSessionCard({
  session,
  now,
}: {
  session: {
    id: string;
    scheduledAt: Date;
    type: string;
    meetUrl: string | null;
    intention: string | null;
    durationMinutes: number;
  };
  now: Date;
}) {
  const scheduled = new Date(session.scheduledAt);
  const minutesUntil = (scheduled.getTime() - now.getTime()) / (60 * 1000);
  const isJoinable =
    !!session.meetUrl && minutesUntil <= 30 && minutesUntil >= -30;

  return (
    <section className="paper-card paper-card--feature p-6 md:p-8">
      <p className="text-[10px] uppercase tracking-widest text-honey-700 font-mono mb-2">
        Coming up
      </p>
      <p
        className="text-xl md:text-2xl text-ink-900 serif mb-1"
        style={{ fontWeight: 500, letterSpacing: "-0.01em" }}
      >
        {fullDate(scheduled)}
      </p>
      <p className="text-sm text-ink-600 mb-4">
        {shortTime(scheduled)} · {session.durationMinutes} min · {session.type}
      </p>
      {session.intention && (
        <p
          className="serif-italic text-base text-ink-700 leading-relaxed mb-4 pl-4 border-l-2 border-honey-300"
          style={{ fontWeight: 400 }}
        >
          &ldquo;{session.intention}&rdquo;
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {session.meetUrl && (
          <a
            href={session.meetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`px-4 py-2 text-sm rounded-md font-medium transition-colors ${
              isJoinable
                ? "bg-plum-700 hover:bg-plum-600 text-white"
                : "bg-ink-50 text-ink-700 hover:bg-ink-100 border border-ink-200"
            }`}
          >
            {isJoinable ? "Join now →" : "Open Meet link"}
          </a>
        )}
        <Link
          href={`/portal/sessions/${session.id}`}
          className="px-4 py-2 text-sm rounded-md border border-ink-200 text-ink-700 hover:bg-ink-50 transition-colors"
        >
          Request reschedule
        </Link>
      </div>
    </section>
  );
}

function OutstandingCard({
  count,
  totalCents,
}: {
  count: number;
  totalCents: number;
}) {
  return (
    <section className="paper-card p-6">
      <h2
        className="serif-italic text-base text-plum-700 mb-1"
        style={{ fontWeight: 400 }}
      >
        Outstanding
      </h2>
      <p className="text-sm text-ink-700">
        {count} {count === 1 ? "session" : "sessions"} unpaid ·{" "}
        <span className="font-mono">
          ${(totalCents / 100).toFixed(2)}
        </span>
      </p>
      <p className="text-[12px] text-ink-500 italic mt-2 leading-relaxed">
        Reach out below to settle up — your practitioner handles payments
        directly.
      </p>
    </section>
  );
}

function ContactCard({
  practitionerName,
  businessName,
  contactEmail,
  contactPhone,
}: {
  practitionerName: string;
  businessName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}) {
  if (!contactEmail && !contactPhone) return null;
  return (
    <section className="paper-card p-6">
      <h2
        className="serif-italic text-base text-plum-700 mb-3"
        style={{ fontWeight: 400 }}
      >
        Reach {practitionerName}
      </h2>
      {businessName && (
        <p className="text-[12px] text-ink-500 italic mb-3">{businessName}</p>
      )}
      <div className="space-y-1.5 text-sm">
        {contactEmail && (
          <div>
            <span className="text-ink-500 text-[11px] uppercase tracking-wider font-mono mr-2">
              email
            </span>
            <a
              href={`mailto:${contactEmail}`}
              className="text-plum-700 hover:underline"
            >
              {contactEmail}
            </a>
          </div>
        )}
        {contactPhone && (
          <div>
            <span className="text-ink-500 text-[11px] uppercase tracking-wider font-mono mr-2">
              phone
            </span>
            <a
              href={`tel:${contactPhone}`}
              className="text-plum-700 hover:underline"
            >
              {contactPhone}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
