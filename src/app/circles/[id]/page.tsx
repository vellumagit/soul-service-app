// Public sign-up page for a single group session. No auth — anyone with
// the link can land here and hold a seat. The same URL is shared from
// the storefront card and surfaced as the "Public signup link" on the
// practitioner's group detail page.
//
// Renders nothing recognizable as Svit's workspace — uses the same
// landing.css palette so the experience feels like part of the
// storefront, not the ops app.

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  groups,
  groupSessions,
  groupAttendees,
  practitionerSettings,
} from "@/db/schema";
import { TimeOfDayProvider } from "@/components/TimeOfDayProvider";
import { CircleSignupForm } from "@/components/CircleSignupForm";
import { CirclePurchaseForm } from "@/components/CirclePurchaseForm";
import { isStripeConfigured } from "@/lib/stripe";
import { formatSessionLong, resolveTimeZone } from "@/lib/timezone";
import "../../landing.css";

export const dynamic = "force-dynamic";

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
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
      groupName: groups.name,
      groupDescription: groups.description,
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
        SELECT COUNT(*)::int FROM ${groupAttendees}
        WHERE ${groupAttendees.groupSessionId} = ${groupSessions.id}
          AND ${groupAttendees.status} <> 'cancelled'
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

        <section
          className="circles"
          style={{ padding: "60px 24px 80px" }}
        >
          <div
            className="wrap narrow rv"
            style={{ textAlign: "center" }}
          >
            <span className="tag" style={{ display: "block" }}>
              Hold your seat
            </span>
            <h2 style={{ marginBottom: 12 }}>
              {session.groupName}
              {session.topic && (
                <>
                  {" "}
                  <em>· {session.topic}</em>
                </>
              )}
            </h2>
            <p className="p-lg" style={{ marginBottom: 4 }}>
              {formatSessionLong(scheduledAt, resolveTimeZone(session.timezone))}
            </p>
            <p
              style={{
                fontSize: 13,
                color: "var(--land-ink-soft)",
                fontFamily: "var(--font-mono, monospace)",
                letterSpacing: "0.04em",
              }}
            >
              {session.durationMinutes}min ·{" "}
              {formatMoney(session.priceCents, session.currency)}
              {open && (
                <>
                  {" · "}
                  {spotsLeft} seat{spotsLeft === 1 ? "" : "s"} left
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
          </div>

          <div
            className="form-shell rv"
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
                  You&apos;re in. 🤍
                </p>
                <p style={{ fontSize: 14, lineHeight: 1.6 }}>
                  Your seat is paid and held. Check your email for your welcome
                  note and the meeting link — a gentle reminder will reach you
                  before we gather.
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
                  This circle has passed.
                </p>
                <p style={{ fontSize: 13 }}>
                  Visit{" "}
                  <Link
                    href="/"
                    style={{
                      color: "var(--land-clay)",
                      textDecoration: "underline",
                    }}
                  >
                    the storefront
                  </Link>{" "}
                  to see what&apos;s coming next.
                </p>
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
                  This circle was cancelled.
                </p>
                <p style={{ fontSize: 13 }}>
                  Visit{" "}
                  <Link
                    href="/"
                    style={{
                      color: "var(--land-clay)",
                      textDecoration: "underline",
                    }}
                  >
                    the storefront
                  </Link>{" "}
                  to see other upcoming gatherings.
                </p>
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
                  This circle is full.
                </p>
                <p style={{ fontSize: 13 }}>
                  Send a note via{" "}
                  <Link
                    href="/#contact"
                    style={{
                      color: "var(--land-clay)",
                      textDecoration: "underline",
                    }}
                  >
                    the contact form
                  </Link>{" "}
                  and Svitlana will hold a place for the next one.
                </p>
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
                  Sign-ups aren&apos;t open online just yet.
                </p>
                <p style={{ fontSize: 13, lineHeight: 1.6 }}>
                  These Circles gather by warm invitation. Send a note via{" "}
                  <Link
                    href="/#contact"
                    style={{
                      color: "var(--land-clay)",
                      textDecoration: "underline",
                    }}
                  >
                    the contact form
                  </Link>{" "}
                  and Svitlana will hold a place for you.
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
                Payment canceled — no charge. You can try again whenever
                you&apos;re ready.
              </p>
            )}
            {open &&
              !justPaid &&
              signupsOpen &&
              (stripeReady ? (
                <CirclePurchaseForm
                  sessionId={session.sessionId}
                  priceLabel={formatMoney(
                    session.priceCents,
                    session.currency
                  )}
                  paymentInstructions={session.paymentInstructions}
                />
              ) : (
                <CircleSignupForm
                  sessionId={session.sessionId}
                  paymentInstructions={session.paymentInstructions}
                />
              ))}
          </div>
        </section>
      </main>
    </>
  );
}
