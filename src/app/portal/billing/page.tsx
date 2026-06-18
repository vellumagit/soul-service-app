// Billing — every session the client's had, grouped by paid / outstanding.
//
// Read-only. The portal doesn't take payments directly — practitioner
// handles them outside the app (Venmo / Zelle / cash) and marks them
// paid in her own UI. This page exists so the client has clarity on
// what they owe and what they've already paid, instead of having to
// remember.

import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, practitionerSettings } from "@/db/schema";
import { requirePortalSession } from "@/lib/portal-auth";
import { fullDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function formatMoney(cents: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export default async function PortalBillingPage() {
  const portal = await requirePortalSession();

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
      })
      .from(practitionerSettings)
      .where(eq(practitionerSettings.accountId, portal.accountId))
      .limit(1),
  ]);
  const settings = settingsRows[0] ?? null;
  const currency = settings?.defaultCurrency ?? "USD";
  const firstName =
    settings?.practitionerName?.split(" ")[0] ?? "your practitioner";

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

  // Totals for the year — useful for end-of-year accounting.
  const thisYear = new Date().getFullYear();
  const paidThisYearCents = paid
    .filter((s) => new Date(s.scheduledAt).getFullYear() === thisYear)
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
          What you&apos;ve paid, what&apos;s outstanding. {firstName} handles
          payments outside this app — this is just clarity, not a
          checkout.
        </p>
      </header>

      <div className="space-y-6">
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
          />
        )}

        {/* Paid history */}
        {paid.length > 0 && (
          <BillingList
            title="Paid"
            rows={paid}
            currency={currency}
            kind="paid"
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
  footer,
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
  footer?: string | null;
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
                  {fullDate(new Date(s.scheduledAt))}
                </p>
                <p className="text-[11px] text-ink-500 font-mono">
                  {s.type}
                  {kind === "paid" && s.paymentMethod && (
                    <> · {s.paymentMethod}</>
                  )}
                  {kind === "paid" && s.paidAt && (
                    <> · paid {fullDate(new Date(s.paidAt))}</>
                  )}
                </p>
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
