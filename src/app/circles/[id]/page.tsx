// Public sign-up page for a single group session. No auth — anyone with
// the link can land here and hold a seat. The same URL is shared from
// the storefront card and surfaced as the "Public signup link" on the
// practitioner's group detail page.
//
// Renders nothing recognizable as Svit's workspace — uses the same
// landing.css palette so the experience feels like part of the
// storefront, not the ops app.
//
// Language: this page speaks the CIRCLE's language, not the visitor's
// storefront cookie — a УКР circle's shared link reads Ukrainian end to
// end (chrome, dates, forms), an EN circle stays English. The room's
// language is the honest context for the person about to join it.

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  groups,
  groupSessions,
  groupAttendees,
  practitionerSettings,
} from "@/db/schema";
import { TimeOfDayProvider } from "@/components/TimeOfDayProvider";
import { CircleSignupForm } from "@/components/CircleSignupForm";
import { PublicBrandLink } from "@/components/PublicBrandLink";
import { CirclePurchaseForm } from "@/components/CirclePurchaseForm";
import { isStripeConfigured } from "@/lib/stripe";
import { formatSessionLong, resolveTimeZone } from "@/lib/timezone";
import {
  getLandingCopy,
  type CircleFormCopy,
} from "@/lib/landing-copy";
import "../../landing.css";

export const dynamic = "force-dynamic";

function formatMoney(
  cents: number,
  currency: string,
  locale = "en-US"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

// Compact label for the "prefer another week?" pills, in the practice zone.
function formatPillDate(
  d: Date,
  timeZone: string,
  locale = "en-US"
): string {
  return d.toLocaleString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export default async function CircleSignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string; canceled?: string }>;
}) {
  const { id } = await params;
  const { paid, canceled } = await searchParams;

  const rows = await db
    .select({
      sessionId: groupSessions.id,
      groupId: groupSessions.groupId,
      groupName: groups.name,
      groupDescription: groups.description,
      groupLanguage: groups.language,
      paymentInstructions: groups.paymentInstructions,
      published: groups.published,
      scheduledAt: groupSessions.scheduledAt,
      durationMinutes: groupSessions.durationMinutes,
      capacity: groupSessions.capacity,
      priceCents: groupSessions.priceCents,
      currency: groups.defaultCurrency,
      topic: groupSessions.topic,
      status: groupSessions.status,
      circleSignupsOpen: practitionerSettings.circleSignupsOpen,
      stripeChargesEnabled: practitionerSettings.stripeChargesEnabled,
      timezone: practitionerSettings.timezone,
      takenCount: sql<number>`(
        SELECT COUNT(*)::int FROM group_attendees
        WHERE group_attendees.group_session_id = group_sessions.id
          AND group_attendees.status <> 'cancelled'
      )`,
    })
    .from(groupSessions)
    .innerJoin(groups, eq(groups.id, groupSessions.groupId))
    .leftJoin(
      practitionerSettings,
      eq(practitionerSettings.accountId, groupSessions.accountId)
    )
    .where(and(eq(groupSessions.id, id), eq(groups.published, true)))
    .limit(1);

  const session = rows[0];
  if (!session) notFound();

  // The circle's language drives every word on this page.
  const lang = session.groupLanguage === "uk" ? "uk" : "en";
  const c = getLandingCopy(lang);
  const cp = c.circlePage;
  const locale = c.circles.dateLocale;

  const scheduledAt = new Date(session.scheduledAt);
  const past = scheduledAt.getTime() < Date.now();
  const cancelled = session.status !== "scheduled";
  const spotsLeft = Math.max(0, session.capacity - session.takenCount);
  const open = !past && !cancelled && spotsLeft > 0;
  const justPaid = paid === "1";
  // Master switch — when sign-ups are closed, no one can reserve here; the
  // page shows a "reach out to join" message instead of the form.
  const signupsOpen = session.circleSignupsOpen ?? false;
  // Card payment available when the platform Stripe is wired, the practitioner
  // has connected her account and finished activation (charges enabled), AND
  // the circle has a price. Otherwise the manual (Venmo/cash) lane shows.
  const stripeReady =
    isStripeConfigured() &&
    session.priceCents > 0 &&
    !!session.stripeChargesEnabled;

  const tz = resolveTimeZone(session.timezone);

  // Serializable string bundle for the client forms — the priced CTA is
  // resolved here so no function crosses the server→client boundary.
  const { reserveCta, ...formStrings } = c.circleForm;
  const formCopy: CircleFormCopy = {
    ...formStrings,
    reserveLabel: reserveCta(
      formatMoney(session.priceCents, session.currency, locale)
    ),
  };

  // Other upcoming dates of the SAME Circle, so a visitor who landed on the
  // soonest one can jump to a week that suits them. Only surface dates that
  // still have a seat; cap the list so it stays a quick glance.
  const otherRows = await db
    .select({
      id: groupSessions.id,
      scheduledAt: groupSessions.scheduledAt,
      capacity: groupSessions.capacity,
      takenCount: sql<number>`(
        SELECT COUNT(*)::int FROM group_attendees
        WHERE group_attendees.group_session_id = group_sessions.id
          AND group_attendees.status <> 'cancelled'
      )`,
    })
    .from(groupSessions)
    .where(
      and(
        eq(groupSessions.groupId, session.groupId),
        eq(groupSessions.status, "scheduled"),
        gt(groupSessions.scheduledAt, new Date()),
        ne(groupSessions.id, session.sessionId)
      )
    )
    .orderBy(groupSessions.scheduledAt)
    .limit(8);
  const otherDates = otherRows
    .map((r) => ({
      id: r.id,
      scheduledAt: new Date(r.scheduledAt),
      spotsLeft: Math.max(0, r.capacity - r.takenCount),
    }))
    .filter((r) => r.spotsLeft > 0);

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

        <section
          className="circles"
          style={{ padding: "60px 24px 80px" }}
        >
          <div
            className="wrap narrow"
            style={{ textAlign: "center" }}
          >
            <span className="tag" style={{ display: "block" }}>
              {cp.holdYourSeat}
            </span>
            <h2 style={{ marginBottom: 12 }}>
              {session.groupName}
              {session.topic && (
                <>
                  {" "}
                  <em>· {session.topic}</em>
                </>
              )}
              {/* Language chip — someone landing here from a shared link
                  should know which language the room is held in before
                  they pay. */}
              <span
                style={{
                  marginLeft: 10,
                  fontSize: 11,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  verticalAlign: "middle",
                  padding: "3px 8px",
                  borderRadius: 6,
                  background: "var(--color-plum-50, #f3e8ef)",
                  color: "var(--color-plum-700, #5a3f4f)",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {session.groupLanguage === "uk"
                  ? "Українською"
                  : "In English"}
              </span>
            </h2>
            <p className="p-lg" style={{ marginBottom: 4 }}>
              {formatSessionLong(scheduledAt, tz, locale)}
            </p>
            <p
              style={{
                fontSize: 13,
                color: "var(--land-ink-soft)",
                fontFamily: "var(--font-mono, monospace)",
                letterSpacing: "0.04em",
              }}
            >
              {session.durationMinutes}
              {c.circles.minShort} ·{" "}
              {formatMoney(session.priceCents, session.currency, locale)}
              {open && (
                <>
                  {" · "}
                  {c.circles.seatsLeft(spotsLeft)}
                </>
              )}
            </p>

            {session.groupDescription && (
              <p
                className="p-lg"
                style={{
                  marginTop: 22,
                  fontSize: 16,
                  fontStyle: "italic",
                  fontFamily: "var(--font-serif, serif)",
                  lineHeight: 1.55,
                }}
              >
                {session.groupDescription}
              </p>
            )}

            {otherDates.length > 0 && (
              <div style={{ marginTop: 26 }}>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--land-ink-soft)",
                    fontFamily: "var(--font-mono, monospace)",
                    letterSpacing: "0.04em",
                    marginBottom: 12,
                  }}
                >
                  {cp.preferAnotherWeek}
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    justifyContent: "center",
                  }}
                >
                  {otherDates.map((d) => (
                    <Link
                      key={d.id}
                      href={`/circles/${d.id}`}
                      style={{
                        fontSize: 13,
                        padding: "7px 14px",
                        borderRadius: 999,
                        border: "1px solid rgba(176, 92, 54, 0.28)",
                        background: "rgba(255, 251, 245, 0.65)",
                        color: "var(--land-clay-deep)",
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatPillDate(d.scheduledAt, tz, locale)}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div
            className="form-shell"
            style={{
              maxWidth: 520,
              margin: "40px auto 0",
            }}
          >
            {justPaid && (
              <div
                className="rounded-md"
                style={{
                  padding: 28,
                  textAlign: "center",
                  background: "var(--color-honey-50, #fbf3e4)",
                  border: "1px solid rgba(176, 92, 54, 0.25)",
                }}
              >
                <p
                  className="serif-italic"
                  style={{
                    fontSize: 22,
                    color: "var(--land-clay-deep)",
                    marginBottom: 10,
                  }}
                >
                  {cp.paidTitle}
                </p>
                <p style={{ fontSize: 14, lineHeight: 1.6 }}>
                  {cp.paidBody}
                </p>
              </div>
            )}
            {!justPaid && past && (
              <div
                className="rounded-md"
                style={{
                  padding: 24,
                  textAlign: "center",
                  background: "rgba(255, 251, 245, 0.7)",
                  border: "1px solid rgba(176, 92, 54, 0.18)",
                }}
              >
                <p
                  className="serif-italic"
                  style={{
                    fontSize: 18,
                    color: "var(--land-clay-deep)",
                    marginBottom: 8,
                  }}
                >
                  {cp.passedTitle}
                </p>
                <p style={{ fontSize: 13 }}>{cp.passedBody}</p>
              </div>
            )}
            {!past && cancelled && (
              <div
                className="rounded-md"
                style={{
                  padding: 24,
                  textAlign: "center",
                  background: "rgba(255, 251, 245, 0.7)",
                  border: "1px solid rgba(176, 92, 54, 0.18)",
                }}
              >
                <p
                  className="serif-italic"
                  style={{
                    fontSize: 18,
                    color: "var(--land-clay-deep)",
                    marginBottom: 8,
                  }}
                >
                  {cp.cancelledTitle}
                </p>
                <p style={{ fontSize: 13 }}>{cp.cancelledBody}</p>
              </div>
            )}
            {!past && !cancelled && spotsLeft === 0 && (
              <div
                className="rounded-md"
                style={{
                  padding: 24,
                  textAlign: "center",
                  background: "rgba(255, 251, 245, 0.7)",
                  border: "1px solid rgba(176, 92, 54, 0.18)",
                }}
              >
                <p
                  className="serif-italic"
                  style={{
                    fontSize: 18,
                    color: "var(--land-clay-deep)",
                    marginBottom: 8,
                  }}
                >
                  {cp.fullTitle}
                </p>
                <p style={{ fontSize: 13 }}>{cp.fullBody}</p>
              </div>
            )}
            {open && !justPaid && !signupsOpen && (
              <div
                className="rounded-md"
                style={{
                  padding: 24,
                  textAlign: "center",
                  background: "rgba(255, 251, 245, 0.7)",
                  border: "1px solid rgba(176, 92, 54, 0.18)",
                }}
              >
                <p
                  className="serif-italic"
                  style={{
                    fontSize: 18,
                    color: "var(--land-clay-deep)",
                    marginBottom: 8,
                  }}
                >
                  {cp.closedTitle}
                </p>
                <p style={{ fontSize: 13, lineHeight: 1.6 }}>
                  {cp.closedBody}
                </p>
              </div>
            )}
            {open && !justPaid && signupsOpen && canceled === "1" && (
              <p
                style={{
                  fontSize: 12,
                  textAlign: "center",
                  color: "var(--land-ink-soft)",
                  fontStyle: "italic",
                  marginBottom: 14,
                }}
              >
                {cp.paymentCanceled}
              </p>
            )}
            {open &&
              !justPaid &&
              signupsOpen &&
              (stripeReady ? (
                <CirclePurchaseForm
                  sessionId={session.sessionId}
                  paymentInstructions={session.paymentInstructions}
                  copy={formCopy}
                />
              ) : (
                <CircleSignupForm
                  sessionId={session.sessionId}
                  paymentInstructions={session.paymentInstructions}
                  copy={formCopy}
                />
              ))}
          </div>
        </section>
      </main>
    </>
  );
}
