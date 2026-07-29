// The individual sections of /requests, one per kind of thing waiting.
//
// These used to live inline on /requests, all ten stacked into a single
// scroll — which read as one undifferentiated pile rather than a set of
// decisions. /requests is now a hub of cards and each card opens
// /requests/<slug>, which renders exactly one of these.
//
// Server components: they take already-fetched rows and render. No data
// access here — the page owns that.

import Link from "next/link";
import {
  type LooseEndRow,
  type RescheduleRequestRow,
  type BookingRequestRow,
  type GroupSignupRow,
  type CircleRefundRequestRow as CircleRefundRequestData,
  type PendingProductPurchaseRow,
} from "@/db/queries";
import { fullDate, shortTime } from "@/lib/format";
import { LooseEndRowActions } from "@/components/LooseEndRowActions";
import { RescheduleRequestRowActions } from "@/components/RescheduleRequestRowActions";
import { BookingRequestRowActions } from "@/components/BookingRequestRowActions";
import { GroupSignupRowActions } from "@/components/GroupSignupRowActions";
import { CircleRefundRequestRow } from "@/components/CircleRefundRequestRow";
import { ProductPurchaseLooseEndRow } from "@/components/ProductPurchaseLooseEndRow";

export function ProductPurchasesSection({
  rows,
  timeZone,
}: {
  rows: PendingProductPurchaseRow[];
  timeZone?: string;
}) {
  return (
    <section className="paper-card p-6">
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <h2
          className="serif-italic text-xl text-plum-700"
          style={{ fontWeight: 400 }}
        >
          Library purchases
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
        People who requested a recorded offering and are waiting on you to
        confirm + mark paid. Once payment arrives, hit{" "}
        <strong>Mark paid + Confirm</strong> — you&apos;ll get a private watch
        URL to email them.
      </p>
      <ul className="space-y-3">
        {rows.map((r) => {
          const price = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: r.currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          }).format(r.priceCents / 100);
          return (
            <li
              key={r.purchaseId}
              className="border-l-2 border-honey-300 pl-4 py-2"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                <div>
                  <span className="text-sm font-medium text-ink-900">
                    {r.purchaserName}
                  </span>
                  <span className="text-[12px] text-ink-500 ml-2 break-all">
                    {r.purchaserEmail}
                  </span>
                </div>
                <span className="text-[11px] text-ink-400 font-mono">
                  {fullDate(r.requestedAt, timeZone)}
                </span>
              </div>
              <div className="text-[12px] text-ink-600 mt-0.5">
                <Link
                  href={`/library/${r.productId}`}
                  className="text-plum-700 hover:underline"
                >
                  {r.productName}
                </Link>{" "}
                · {price}
              </div>
              <div className="mt-2">
                <ProductPurchaseLooseEndRow
                  purchaseId={r.purchaseId}
                  productId={r.productId}
                  productName={r.productName}
                  purchaserName={r.purchaserName}
                  purchaserEmail={r.purchaserEmail}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function RefundRequestsSection({
  rows,
  timeZone,
}: {
  rows: CircleRefundRequestData[];
  timeZone?: string;
}) {
  return (
    <section className="paper-card p-6">
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <h2
          className="serif-italic text-xl text-plum-700"
          style={{ fontWeight: 400 }}
        >
          Refund requests
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
        Paid attendees who can&apos;t make it and asked to cancel. Tap{" "}
        <strong>Refund &amp; release</strong> to send their money back and free
        the seat — or <strong>Keep them in</strong> if they&apos;re staying.
      </p>
      <div className="space-y-3">
        {rows.map((r) => (
          <CircleRefundRequestRow
            key={r.attendeeId}
            attendeeId={r.attendeeId}
            name={r.attendeeName}
            email={r.attendeeEmail}
            circleName={r.groupName}
            whenLabel={`${fullDate(r.scheduledAt, timeZone)} · ${shortTime(r.scheduledAt, timeZone)}`}
          />
        ))}
      </div>
    </section>
  );
}

export function GroupSignupsSection({
  rows,
  timeZone,
}: {
  rows: GroupSignupRow[];
  timeZone?: string;
}) {
  return (
    <section className="paper-card p-6">
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <h2
          className="serif-italic text-xl text-plum-700"
          style={{ fontWeight: 400 }}
        >
          Circle sign-ups
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
                {fullDate(r.signedUpAt, timeZone)}
              </span>
            </div>
            <div className="text-[12px] text-ink-600 mt-0.5">
              <Link
                href={`/groups/${r.groupId}`}
                className="text-plum-700 hover:underline"
              >
                {r.groupName}
              </Link>{" "}
              · {fullDate(r.scheduledAt, timeZone)} · {shortTime(r.scheduledAt, timeZone)}
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

export function BookingRequestsSection({
  rows,
  timeZone,
  practitionerFirstName,
}: {
  rows: BookingRequestRow[];
  timeZone?: string;
  /** Signs the pre-written reply draft. */
  practitionerFirstName: string;
}) {
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
                {fullDate(r.requestedAt, timeZone)}
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
                clientName={r.clientName}
                clientEmail={r.clientEmail}
                clientPhone={r.clientPhone}
                practitionerFirstName={practitionerFirstName}
                askedFor={r.preferredTimes ?? r.reason}
                status={r.status}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RescheduleRequestsSection({
  rows,
  timeZone,
  practitionerFirstName,
}: {
  rows: RescheduleRequestRow[];
  timeZone?: string;
  practitionerFirstName: string;
}) {
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
        new time — when the session is rescheduled (or you&apos;ve decided
        to leave it), resolve the request here to clear it.
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
                {r.type} · {fullDate(r.scheduledAt, timeZone)} ·{" "}
                {shortTime(r.scheduledAt, timeZone)}
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
                clientName={r.clientName}
                clientEmail={r.clientEmail}
                clientPhone={r.clientPhone}
                practitionerFirstName={practitionerFirstName}
                askedFor={r.reason}
                status={r.status}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Section({
  title,
  hint,
  count,
  tone,
  rows,
  actionLabel,
  showReflectInline,
  showRetryBot,
  timeZone,
}: {
  title: string;
  hint: string;
  count: number;
  tone?: "warning";
  rows: LooseEndRow[];
  actionLabel: string;
  showReflectInline?: boolean;
  showRetryBot?: boolean;
  timeZone?: string;
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
                {r.type} · {fullDate(r.scheduledAt, timeZone)} · {shortTime(r.scheduledAt, timeZone)}
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
