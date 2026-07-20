// Public "Can't make it?" page, reached from the tokenized link in a Circle
// attendee's email. Verifies the signed token, shows their reservation, and
// (via CircleCancelForm) lets them cancel + request a refund. No auth; the
// token is the credential. Always-visible (no .rv reveal).

import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  groupAttendees,
  groupSessions,
  groups,
  practitionerSettings,
} from "@/db/schema";
import { TimeOfDayProvider } from "@/components/TimeOfDayProvider";
import { CircleCancelForm } from "@/components/CircleCancelForm";
import { verifyCircleCancelToken } from "@/lib/circle-cancel-token";
import { formatSessionLong, resolveTimeZone } from "@/lib/timezone";
import "../../../landing.css";

export const dynamic = "force-dynamic";

export const metadata = { title: "Cancel your Circle seat" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TimeOfDayProvider />
      <main className="landing-root">
        <header
          style={{
            padding: "32px 24px 0",
            maxWidth: 720,
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-serif, serif)",
              fontSize: 18,
              fontWeight: 500,
              letterSpacing: "0.04em",
              color: "var(--land-clay-deep)",
              textDecoration: "none",
            }}
          >
            Svitlana
          </Link>
        </header>
        <section className="circles" style={{ padding: "56px 24px 90px" }}>
          {children}
        </section>
      </main>
    </>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="wrap narrow" style={{ textAlign: "center", maxWidth: 520 }}>
      <h2 style={{ marginBottom: 12 }}>{title}</h2>
      <p className="p-lg">{body}</p>
      <p style={{ marginTop: 18 }}>
        <Link
          href="/"
          style={{ color: "var(--land-clay)", textDecoration: "underline" }}
        >
          Back to the site
        </Link>
      </p>
    </div>
  );
}

export default async function CircleCancelPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const attendeeId = verifyCircleCancelToken(token);
  if (!attendeeId) {
    return (
      <Shell>
        <Notice
          title="This link isn't valid."
          body="It may have expired or been mistyped. Please reply to your confirmation email and I'll help."
        />
      </Shell>
    );
  }

  const [row] = await db
    .select({
      name: groupAttendees.name,
      paid: groupAttendees.paid,
      status: groupAttendees.status,
      refundedAt: groupAttendees.refundedAt,
      refundRequestedAt: groupAttendees.refundRequestedAt,
      scheduledAt: groupSessions.scheduledAt,
      groupName: groups.name,
      timezone: practitionerSettings.timezone,
    })
    .from(groupAttendees)
    .innerJoin(
      groupSessions,
      eq(groupSessions.id, groupAttendees.groupSessionId)
    )
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .leftJoin(
      practitionerSettings,
      eq(practitionerSettings.accountId, groupAttendees.accountId)
    )
    .where(eq(groupAttendees.id, attendeeId))
    .limit(1);

  if (!row) {
    return (
      <Shell>
        <Notice
          title="We couldn't find that reservation."
          body="Please reply to your confirmation email and I'll sort it out with you."
        />
      </Shell>
    );
  }

  const whenLabel = formatSessionLong(
    new Date(row.scheduledAt),
    resolveTimeZone(row.timezone)
  );

  if (row.refundedAt || row.status === "cancelled") {
    return (
      <Shell>
        <Notice
          title="Your seat's already been released."
          body="Nothing more to do. If you were expecting a refund and haven't seen it, just reply to your email."
        />
      </Shell>
    );
  }
  if (new Date(row.scheduledAt).getTime() < Date.now()) {
    return (
      <Shell>
        <Notice
          title="This circle has already taken place."
          body="This link is for cancelling an upcoming circle. Reach out if something's not right."
        />
      </Shell>
    );
  }
  if (row.refundRequestedAt) {
    return (
      <Shell>
        <Notice
          title="Your request is already in."
          body="Svitlana will confirm your refund shortly — you'll get an email the moment it's done."
        />
      </Shell>
    );
  }

  const first = row.name?.split(" ")[0] ?? null;
  return (
    <Shell>
      <div
        className="wrap narrow"
        style={{ textAlign: "center", maxWidth: 540, marginBottom: 30 }}
      >
        <span className="tag" style={{ display: "block" }}>
          Can&apos;t make it?
        </span>
        <h2 style={{ marginBottom: 12 }}>
          {first ? `No worries, ${first}.` : "No worries."}
        </h2>
        <p className="p-lg">
          You&apos;re booked into <strong>{row.groupName}</strong> —{" "}
          {whenLabel}.
          {row.paid
            ? " Cancel your seat below and I'll refund you; your card is returned within a few business days."
            : " Cancel your spot below to free it up for someone else."}
        </p>
      </div>
      <CircleCancelForm token={token} paid={row.paid} />
    </Shell>
  );
}
