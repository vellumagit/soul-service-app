"use client";

// Single purchase row on a product detail page. Confirm + Mark paid (with
// the watch URL surfaced for copy-paste so she can email it).

import { useState, useTransition } from "react";
import {
  confirmPurchase,
  refundPurchase,
} from "@/lib/product-actions";

interface Props {
  purchase: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    paid: boolean;
    createdAt: Date;
  };
  /** Shown after a successful confirm so she can copy the watch URL. */
  baseUrl: string;
}

export function ProductPurchaseRow({ purchase, baseUrl }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justConfirmed, setJustConfirmed] = useState<string | null>(null);

  const isPending = purchase.status === "pending";
  const isConfirmed = purchase.status === "confirmed";
  const isRefunded = purchase.status === "refunded";

  function onConfirm(markPaid: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await confirmPurchase(purchase.id, markPaid);
      if (!r.ok) {
        setError(r.error);
      } else {
        setJustConfirmed(`${baseUrl}${r.watchUrl}`);
      }
    });
  }
  function onRefund() {
    if (!confirm("Refund this purchase? The watch link will be revoked.")) return;
    setError(null);
    startTransition(async () => {
      const r = await refundPurchase(purchase.id);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div
      className={`paper-card p-4 ${isRefunded ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className="serif text-base text-ink-900"
              style={{ fontWeight: 500 }}
            >
              {purchase.name}
            </span>
            {isPending && (
              <span className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-plum-100 text-plum-700">
                pending
              </span>
            )}
            {isConfirmed && purchase.paid && (
              <span className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-sage-100 text-sage-700">
                paid
              </span>
            )}
            {isConfirmed && !purchase.paid && (
              <span className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-honey-100 text-honey-700">
                confirmed · unpaid
              </span>
            )}
            {isRefunded && (
              <span className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-ink-100 text-ink-500">
                refunded
              </span>
            )}
          </div>
          <div className="text-xs text-ink-600 mt-0.5 break-all">
            {purchase.email}
            {purchase.phone && (
              <>
                <span className="text-ink-400 mx-1">·</span>
                {purchase.phone}
              </>
            )}
          </div>
          {error && (
            <p className="text-xs text-rose-700 italic mt-1.5">{error}</p>
          )}
        </div>

        {!isRefunded && (
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {isPending && (
              <button
                type="button"
                onClick={() => onConfirm(true)}
                disabled={pending}
                className="px-2.5 py-1 text-[11px] font-medium bg-plum-700 hover:bg-plum-600 text-white rounded-md disabled:opacity-50"
              >
                Mark paid + Confirm
              </button>
            )}
            {isConfirmed && (
              <button
                type="button"
                onClick={onRefund}
                disabled={pending}
                className="px-2.5 py-1 text-[11px] text-ink-500 hover:text-rose-700 disabled:opacity-50"
              >
                Refund
              </button>
            )}
          </div>
        )}
      </div>

      {justConfirmed && (
        <div
          className="mt-3 p-3 rounded text-[12px]"
          style={{
            background: "var(--color-honey-50)",
            border: "1px solid var(--color-honey-100)",
          }}
        >
          <div className="font-mono text-[10px] uppercase tracking-wider text-honey-700 mb-1">
            Watch link — email this to {purchase.name}
          </div>
          <div className="break-all text-ink-700">{justConfirmed}</div>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(justConfirmed)}
            className="mt-2 text-[11px] text-plum-700 hover:underline"
          >
            Copy to clipboard
          </button>
        </div>
      )}
    </div>
  );
}
