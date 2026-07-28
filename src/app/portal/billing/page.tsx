// Billing — every session the client's had, grouped by paid / outstanding.
//
// Two lanes, and which one shows depends on her setup:
//   - Card: when she's connected Stripe and finished activation, each
//     outstanding session gets a Pay button (direct charge on her account).
//   - Manual: her payment instructions (Venmo / Zelle / cash), always shown
//     when she's written them, since some clients will still pay that way.
// Either way she can mark a session paid by hand on her side — the card lane
// is an addition, not a replacement.

import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { sessions, practitionerSettings } from "@/db/schema";
import { requirePortalSession } from "@/lib/portal-auth";
import { fullDate, plainDate, safeCurrency } from "@/lib/format";
import { getPortalTimeZone } from "@/lib/portal-timezone";
import { zonedYearMonthDay } from "@/lib/timezone";
import { isStripeConfigured } from "@/lib/stripe";
import { PortalPayButton } from "@/components/PortalPayButton";

export const dynamic = "force-dynamic";

function formatMoney(cents: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    // safeCurrency, not the raw setting: default_currency is free text she
    // types, and a malformed code makes Intl throw — which would blank this
    // whole page for the client rather than mis-label a number.
    currency: safeCurrency(currency),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export default async function PortalBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; canceled?: string }>;
}) {
  const portal = await requirePortalSession();
  const { paid: paidFlag, canceled } = await searchParams;

  const [sessionRows, settingsRows] = await Promise.all([
    db
      .select({
        id: sessions.id,
        scheduledAt: sessions.scheduledAt,
        type: sessions.type,
        status: sessions.status,
        paid: sessions.paid,
        paymentMethod: sessions.paymentMethod,
        paidAt: sessions.paidAt,
        paymentAmountCents: sessions.paymentAmountCents,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.accountId, portal.accountId),
          eq(sessions.clientId, portal.clientId),
          ne(sessions.status, "cancelled")
        )
      )
      .orderBy(desc(sessions.scheduledAt)),
    db
      .select({
        practitionerName: practitionerSettings.practitionerName,
        defaultCurrency: practitionerSettings.defaultCurrency,
        paymentInstructions: practitionerSettings.paymentInstructions,
        stripeAccountId: practitionerSettings.stripeAccountId,
        stripeChargesEnabled: practitionerSettings.stripeChargesEnabled,
      })
      .from(practitionerSettings)
      .where(eq(practitionerSettings.accountId, portal.accountId))
      .limit(1),
  ]);
  const settings = settingsRows[0] ?? null;
  const currency = settings?.defaultCurrency ?? "USD";
  const { timeZone } = await getPortalTimeZone(
    portal.accountId,
    portal.clientId
  );
  const firstName =
    settings?.practitionerName?.split(" ")[0] ?? "your practitioner";
  // The card lane needs all three: platform keys, her connected account, and
  // Stripe having actually activated it. Missing any one and we show only the
  // manual instructions rather than a button that can't succeed.
  const canPayByCard =
    isStripeConfigured() &&
    !!settings?.stripeAccountId &&
    settings.stripeChargesEnabled === true;

  const completedSessions = sessionRows.filter(
    (s) => s.status === "completed"
  );
  const unpaid = completedSessions.filter(
    (s) => !s.paid && (s.paymentAmountCents ?? 0) > 0
  );
  const paid = completedSessions.filter(
    (s) => s.paid && (s.paymentAmountCents ?? 0) > 0
  );
  const unpaidTotalCents = unpaid.reduce(
    (sum, s) => sum + (s.paymentAmountCents ?? 0),
    0
  );

  // Totals for the year — useful for end-of-year accounting. Year is taken in
  // the portal's zone, so a Dec 31 evening session doesn't count as next year
  // just because the server thinks in UTC.
  const yearIn = (d: Date) => zonedYearMonthDay(d, timeZone).year;
  const thisYear = yearIn(new Date());
  const paidThisYearCents = paid
    .filter((s) => yearIn(new Date(s.scheduledAt)) === thisYear)
    .reduce((sum, s) => sum + (s.paymentAmountCents ?? 0), 0);

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-8 md:py-10">
      <header className="mb-7">
        <h1
          className="text-2xl md:text-3xl text-ink-900 serif mb-1"
          style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
        >
          Billing
        </h1>
        <p className="text-sm text-ink-500 italic serif-italic">
          {canPayByCard
            ? `What you've paid, what's outstanding. You can settle up by card here, or however you and ${firstName} usually do it.`
            : `What you've paid, what's outstanding. ${firstName} handles payments outside this app — this is just clarity, not a checkout.`}
        </p>
      </header>

      <div className="space-y-6">
        {/* Return from Stripe. The webhook is what actually marks a session
            paid, and it can land a moment after the redirect — so promise
            nothing more specific than "it's on its way". */}
        {paidFlag === "1" && (
          <section
            className="rounded-md p-4 text-sm leading-relaxed"
            style={{
              background: "var(--color-honey-50)",
              border: "1px solid var(--color-honey-100)",
              color: "var(--color-honey-700)",
            }}
          >
            Thank you — your payment went through. It may take a moment to
            show as paid below; reload if it hasn&apos;t updated.
          </section>
        )}
        {canceled === "1" && (
          <section className="paper-card p-4 text-sm text-ink-600 leading-relaxed">
            Checkout closed — nothing was charged. You can pay whenever
            you&apos;re ready.
          </section>
        )}
        {/* Outstanding card */}
        {unpaid.length > 0 ? (
          <section
            className="rounded-md p-5 md:p-6"
            style={{
              background: "var(--color-honey-50)",
              border: "1px solid var(--color-honey-100)",
            }}
          >
            <p className="text-[10px] uppercase tracking-widest text-honey-700 font-mono mb-2">
              Outstanding
            </p>
            <p className="text-2xl text-ink-900 serif mb-1" style={{ fontWeight: 500 }}>
              {formatMoney(unpaidTotalCents, currency)}
            </p>
            <p className="text-sm text-ink-600">
              {unpaid.length} {unpaid.length === 1 ? "session" : "sessions"} unpaid
            </p>
            {settings?.paymentInstructions && (
              <div className="mt-4 pt-3 border-t border-honey-100">
                <p className="text-[10px] uppercase tracking-widest text-honey-700 font-mono mb-1.5">
                  How {firstName} accepts payment
                </p>
                <p className="text-sm text-ink-700 leading-relaxed whitespace-pre-wrap">
                  {settings.paymentInstructions}
                </p>
              </div>
            )}
          </section>
        ) : (
          <section className="paper-card p-5 md:p-6 text-center">
            <p
              className="serif-italic text-base text-plum-700"
              style={{ fontWeight: 400 }}
            >
              All settled. Nothing outstanding.
            </p>
          </section>
        )}

        {/* Outstanding list */}
        {unpaid.length > 0 && (
          <BillingList
            title="Sessions outstanding"
            rows={unpaid}
            currency={currency}
            kind="outstanding"
            timeZone={timeZone}
            canPayByCard={canPayByCard}
          />
        )}

        {/* Paid history */}
        {paid.length > 0 && (
          <BillingList
            title="Paid"
            rows={paid}
            currency={currency}
            kind="paid"
            timeZone={timeZone}
            footer={
              paidThisYearCents > 0
                ? `${formatMoney(paidThisYearCents, currency)} paid in ${thisYear} so far.`
                : null
            }
          />
        )}

        {completedSessions.length === 0 && (
          <div className="paper-card p-10 text-center text-sm text-ink-500 italic">
            Nothing to show yet — your billing history will appear here once
            you&apos;ve held a session.
          </div>
        )}
      </div>
    </div>
  );
}

function BillingList({
  title,
  rows,
  currency,
  kind,
  timeZone,
  footer,
  canPayByCard = false,
}: {
  title: string;
  rows: Array<{
    id: string;
    scheduledAt: Date;
    type: string;
    paymentMethod: string | null;
    paidAt: string | null;
    paymentAmountCents: number | null;
  }>;
  currency: string;
  kind: "paid" | "outstanding";
  timeZone: string;
  footer?: string | null;
  canPayByCard?: boolean;
}) {
  return (
    <section className="paper-card p-5 md:p-6">
      <h2
        className="serif-italic text-base text-plum-700 mb-3"
        style={{ fontWeight: 400 }}
      >
        {title}
      </h2>
      <ul className="space-y-2">
        {rows.map((s) => {
          const cents = s.paymentAmountCents ?? 0;
          return (
            <li
              key={s.id}
              className="flex items-baseline justify-between gap-3 py-2 border-b border-ink-100 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-800">
                  {fullDate(new Date(s.scheduledAt), timeZone)}
                </p>
                <p className="text-[11px] text-ink-500 font-mono">
                  {s.type}
                  {kind === "paid" && s.paymentMethod && (
                    <> · {s.paymentMethod}</>
                  )}
                  {/* paidAt is a DATE column — no time, no zone. Format the
                      digits as-is; running it through the portal zone would
                      slide it back a day. */}
                  {kind === "paid" && s.paidAt && (
                    <> · paid {plainDate(s.paidAt)}</>
                  )}
                </p>
                {kind === "outstanding" && canPayByCard && cents > 0 && (
                  <PortalPayButton
                    sessionId={s.id}
                    amountLabel={formatMoney(cents, currency)}
                  />
                )}
              </div>
              <span
                className={`text-sm font-mono shrink-0 ${
                  kind === "outstanding"
                    ? "text-honey-700"
                    : "text-ink-700"
                }`}
              >
                {formatMoney(cents, currency)}
              </span>
            </li>
          );
        })}
      </ul>
      {footer && (
        <p className="text-[11px] text-ink-500 italic mt-3">{footer}</p>
      )}
    </section>
  );
}
