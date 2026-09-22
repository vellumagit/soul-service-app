// The /payments list — mobile cards and the desktop table — with the same
// "show older" paging the client Sessions tab uses.
//
// Why: the page fetched EVERY session ever held and rendered all of them.
// A weekly client over three years is ~150 rows; twenty of them is a few
// thousand rows mounted at once, growing forever and never trimmed. The
// Sessions tab hit exactly this and solved it (SessionsLog, PAGE_SIZE = 30);
// /payments never got the same treatment.
//
// The totals above this list are NOT derived from these rows — they come
// from getPaymentTotals, a separate aggregate over the whole history. So
// trimming what's rendered can't change what she's owed or what she's
// earned. That was the one thing worth checking before paging a money page.

"use client";

import { useState } from "react";
import Link from "next/link";
import { MarkPaidDialog } from "./MarkPaidDialog";
import { fullDate, money, paymentMethodLabel } from "@/lib/format";
import type { listAllSessionsForPayments } from "@/db/queries";

type PaymentRow = Awaited<
  ReturnType<typeof listAllSessionsForPayments>
>[number];

/** How many rows before "Show older". Higher than SessionsLog's 30 because
 *  these are plain rows, not SessionCards with a mounted form apiece — a
 *  page here costs far less to render. */
const PAGE_SIZE = 50;

export function PaymentsLedger({
  rows,
  practiceTz,
  defaultRateCents,
}: {
  /** Already filtered by the active pill, newest first. */
  rows: PaymentRow[];
  practiceTz: string;
  defaultRateCents: number | null;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visible = rows.slice(0, visibleCount);
  const remaining = rows.length - visible.length;

  return (
    <>
      {/* Mobile */}
      <div className="md:hidden paper-card overflow-hidden divide-y divide-ink-100">
        {visible.map((s) => (
          <div key={s.id} className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Link
                href={`/clients/${s.clientId}`}
                className="font-medium text-ink-900 hover:underline flex-1 truncate"
              >
                {s.clientName}
              </Link>
              <span
                className={`chip ${
                  s.paid
                    ? "bg-green-50 text-green-700"
                    : s.refundedAt || s.paymentMethod === "gifted"
                    ? "bg-ink-100 text-ink-600"
                    : s.status === "scheduled"
                    ? "bg-plum-100 text-plum-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {s.paid
                  ? "PAID"
                  : s.refundedAt
                  ? "REFUNDED"
                  : s.paymentMethod === "gifted"
                  ? "FREE"
                  : s.status === "scheduled"
                  ? "UPCOMING"
                  : "UNPAID"}
              </span>
              {s.duplicateChargePaymentIntentId && (
                <span
                  className="chip bg-red-50 text-red-700"
                  title={`Possible double charge — a second card payment (${s.duplicateChargePaymentIntentId}) came in on this already-paid session. Review and refund it in Stripe.`}
                >
                  ⚠ REVIEW
                </span>
              )}
            </div>
            <div className="text-xs text-ink-500">
              {s.type} · {fullDate(s.scheduledAt, practiceTz)}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm text-ink-700 font-medium">
                {s.paymentMethod === "gifted"
                  ? "Free"
                  : s.paymentAmountCents
                  ? money(s.paymentAmountCents)
                  : s.paid
                  ? "—"
                  : ""}
                {s.paid && s.paymentMethod && (
                  <span className="text-xs text-ink-500 ml-2">
                    · {paymentMethodLabel(s.paymentMethod)}
                  </span>
                )}
              </span>
              {!s.paid &&
                s.status === "completed" &&
                s.paymentMethod !== "gifted" && (
                  <MarkPaidDialog
                    sessionId={s.id}
                    clientId={s.clientId}
                    defaultAmountCents={s.paymentAmountCents ?? defaultRateCents}
                  />
                )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden md:block paper-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-ink-500 bg-ink-50/60 border-b border-ink-100">
            <tr>
              <th className="text-left font-medium px-4 py-2">Date</th>
              <th className="text-left font-medium px-4 py-2">Client</th>
              <th className="text-left font-medium px-4 py-2">Type</th>
              <th className="text-left font-medium px-4 py-2">Status</th>
              <th className="text-left font-medium px-4 py-2">Method</th>
              <th className="text-left font-medium px-4 py-2">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {visible.map((s) => (
              <tr key={s.id} className="row-hover">
                <td className="px-4 py-2 font-mono text-xs text-ink-600">
                  {fullDate(s.scheduledAt, practiceTz)}
                </td>
                <td className="px-4 py-2">
                  <Link
                    href={`/clients/${s.clientId}`}
                    className="text-ink-900 hover:underline"
                  >
                    {s.clientName}
                  </Link>
                </td>
                <td className="px-4 py-2 text-ink-600">{s.type}</td>
                <td className="px-4 py-2">
                  <span
                    className={`chip ${
                      s.paid
                        ? "bg-green-50 text-green-700"
                        : s.paymentMethod === "gifted"
                        ? "bg-ink-100 text-ink-600"
                        : s.status === "scheduled"
                        ? "bg-plum-100 text-plum-700"
                        : s.status === "completed"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-ink-100 text-ink-500"
                    }`}
                  >
                    {s.paid
                      ? "PAID"
                      : s.paymentMethod === "gifted"
                      ? "FREE"
                      : s.status === "scheduled"
                      ? "UPCOMING"
                      : s.status === "completed"
                      ? "UNPAID"
                      : s.status.toUpperCase()}
                  </span>
                  {s.duplicateChargePaymentIntentId && (
                    <span
                      className="chip bg-red-50 text-red-700 ml-1"
                      title={`Possible double charge — a second card payment (${s.duplicateChargePaymentIntentId}) came in on this already-paid session. Review and refund it in Stripe.`}
                    >
                      ⚠ REVIEW
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-ink-600">
                  {s.paid || s.paymentMethod === "gifted"
                    ? paymentMethodLabel(s.paymentMethod)
                    : "—"}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-ink-900 font-medium">
                  {s.paymentMethod === "gifted"
                    ? "Free"
                    : s.paymentAmountCents
                    ? money(s.paymentAmountCents)
                    : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  {!s.paid &&
                    s.status === "completed" &&
                    s.paymentMethod !== "gifted" && (
                      <MarkPaidDialog
                        sessionId={s.id}
                        clientId={s.clientId}
                        defaultAmountCents={
                          s.paymentAmountCents ?? defaultRateCents
                        }
                      />
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {remaining > 0 && (
        <div className="text-center pt-3">
          <button
            type="button"
            onClick={() =>
              setVisibleCount((n) => Math.min(n + PAGE_SIZE, rows.length))
            }
            className="text-sm text-plum-700 hover:underline"
          >
            Show older sessions{" "}
            <span className="text-ink-400">({remaining} more)</span>
          </button>
        </div>
      )}
    </>
  );
}
