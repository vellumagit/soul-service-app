"use client";

// Inline actions for a pending product purchase on Loose Ends. Confirm +
// Mark paid generates the watch URL right there so she can copy + email.

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  confirmPurchase,
  refundPurchase,
} from "@/lib/product-actions";

interface Props {
  purchaseId: string;
  productId: string;
  productName: string;
  purchaserName: string;
  purchaserEmail: string;
}

export function ProductPurchaseLooseEndRow({
  purchaseId,
  productId,
  productName,
  purchaserName,
  purchaserEmail,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [watchUrl, setWatchUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const r = await confirmPurchase(purchaseId, true);
      if (!r.ok) setError(r.error);
      else {
        const origin =
          typeof window !== "undefined" ? window.location.origin : "";
        setWatchUrl(`${origin}${r.watchUrl}`);
      }
    });
  }
  function onRefund() {
    if (!confirm("Refund this purchase? The watch link will be revoked.")) return;
    setError(null);
    startTransition(async () => {
      const r = await refundPurchase(purchaseId);
      if (!r.ok) setError(r.error);
    });
  }

  if (watchUrl) {
    return (
      <div
        className="rounded p-3 text-[12px]"
        style={{
          background: "var(--color-honey-50)",
          border: "1px solid var(--color-honey-100)",
        }}
      >
        <div className="font-mono text-[10px] uppercase tracking-wider text-honey-700 mb-1">
          Watch link — email this to {purchaserName} ({purchaserEmail})
        </div>
        <div className="break-all text-ink-700">{watchUrl}</div>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(watchUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="mt-2 text-[11px] text-plum-700 hover:underline"
        >
          {copied ? "Copied ✓" : "Copy to clipboard"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={onConfirm}
        disabled={pending}
        className="px-2.5 py-1 text-[11px] font-medium bg-plum-700 hover:bg-plum-600 text-white rounded-md disabled:opacity-50"
      >
        Mark paid + Confirm
      </button>
      <Link
        href={`/library/${productId}`}
        className="px-2.5 py-1 text-[11px] text-ink-700 hover:text-ink-900"
      >
        Open offering
      </Link>
      <button
        type="button"
        onClick={onRefund}
        disabled={pending}
        className="px-2.5 py-1 text-[11px] text-ink-500 hover:text-rose-700 disabled:opacity-50"
      >
        Refund
      </button>
      {error && (
        <span className="text-[11px] text-rose-700 italic">{error}</span>
      )}
      <span className="sr-only">{productName}</span>
    </div>
  );
}
