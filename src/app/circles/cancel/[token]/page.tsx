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
import { PublicBrandLink } from "@/components/PublicBrandLink";
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
          <PublicBrandLink />
        </header>
        <section className="circles" style={{ padding: "56px 24px 90px" }}>
          {children}
        </section>
      </main>
    </>
  );
}

function Notice({
  title,
  body,
  backLabel = "Back to the site",
}: {
  title: string;
  body: string;
  backLabel?: string;
}) {
  return (
    <div className="wrap narrow" style={{ textAlign: "center", maxWidth: 520 }}>
      <h2 style={{ marginBottom: 12 }}>{title}</h2>
      <p className="p-lg">{body}</p>
      <p style={{ marginTop: 18 }}>
        <Link
          href="/"
          style={{ color: "var(--land-clay)", textDecoration: "underline" }}
        >
          {backLabel}
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
      groupLanguage: groups.language,
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

  // This page speaks the CIRCLE's language, like every other attendee-facing
  // touchpoint. The invalid-token branches above stay English — we don't know
  // the circle yet there.
  const uk = row.groupLanguage === "uk";
  const backLabel = uk ? "Повернутися на сайт" : "Back to the site";

  const whenLabel = formatSessionLong(
    new Date(row.scheduledAt),
    resolveTimeZone(row.timezone),
    uk ? "uk-UA" : "en-US"
  );

  if (row.refundedAt || row.status === "cancelled") {
    return (
      <Shell>
        <Notice
          title={
            uk
              ? "Ваше місце вже звільнено."
              : "Your seat's already been released."
          }
          body={
            uk
              ? "Більше нічого робити не потрібно. Якщо ви чекали на повернення коштів і його ще немає — просто відповідайте на свій лист."
              : "Nothing more to do. If you were expecting a refund and haven't seen it, just reply to your email."
          }
          backLabel={backLabel}
        />
      </Shell>
    );
  }
  if (new Date(row.scheduledAt).getTime() < Date.now()) {
    return (
      <Shell>
        <Notice
          title={
            uk
              ? "Це Коло вже відбулося."
              : "This circle has already taken place."
          }
          body={
            uk
              ? "Це посилання — для скасування майбутнього Кола. Напишіть, якщо щось не так."
              : "This link is for cancelling an upcoming circle. Reach out if something's not right."
          }
          backLabel={backLabel}
        />
      </Shell>
    );
  }
  if (row.refundRequestedAt) {
    return (
      <Shell>
        <Notice
          title={uk ? "Ваш запит уже прийнято." : "Your request is already in."}
          body={
            uk
              ? "Світлана незабаром підтвердить повернення — щойно все буде готово, вам прийде лист."
              : "Svitlana will confirm your refund shortly — you'll get an email the moment it's done."
          }
          backLabel={backLabel}
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
          {uk ? "Не зможете прийти?" : "Can't make it?"}
        </span>
        <h2 style={{ marginBottom: 12 }}>
          {uk
            ? first
              ? `Нічого страшного, ${first}.`
              : "Нічого страшного."
            : first
              ? `No worries, ${first}.`
              : "No worries."}
        </h2>
        <p className="p-lg">
          {uk ? (
            <>
              Ви записані в <strong>{row.groupName}</strong> — {whenLabel}.
              {row.paid
                ? " Скасуйте місце нижче — і я поверну кошти; гроші повернуться на вашу картку протягом кількох робочих днів."
                : " Скасуйте місце нижче, щоб звільнити його для когось іншого."}
            </>
          ) : (
            <>
              You&apos;re booked into <strong>{row.groupName}</strong> —{" "}
              {whenLabel}.
              {row.paid
                ? " Cancel your seat below and I'll refund you; your card is returned within a few business days."
                : " Cancel your spot below to free it up for someone else."}
            </>
          )}
        </p>
      </div>
      <CircleCancelForm token={token} paid={row.paid} lang={uk ? "uk" : "en"} />
      {uk && (
        <p
          style={{
            textAlign: "center",
            marginTop: 26,
            fontSize: 12,
            color: "var(--land-ink-soft, #786b60)",
          }}
        >
          In English: this page is in Ukrainian because this Circle is held in
          Ukrainian. If that&apos;s a surprise, reply to your confirmation
          email in English — happy to help.
        </p>
      )}
    </Shell>
  );
}
