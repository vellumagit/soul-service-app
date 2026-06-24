"use client";

// Public purchase-request form. Mirrors CircleSignupForm — name + email +
// optional phone, with honeypot. On success, shows a thank-you with the
// payment instructions so the buyer knows what to do next.

import { useActionState } from "react";
import {
  requestProductPurchase,
  type PurchaseRequestResult,
} from "@/lib/product-actions";

const initialState: PurchaseRequestResult | undefined = undefined;

interface Props {
  productId: string;
  productName: string;
  priceLabel: string;
  paymentInstructions: string | null;
}

export function PurchaseRequestForm({
  productId,
  productName,
  priceLabel,
  paymentInstructions,
}: Props) {
  const [state, action, pending] = useActionState(
    requestProductPurchase,
    initialState
  );

  if (state?.ok) {
    return (
      <div
        className="rounded-md p-6 md:p-8 text-center"
        style={{
          background: "var(--color-honey-50)",
          border: "1px solid var(--color-honey-100)",
        }}
      >
        <p
          className="serif-italic text-lg text-plum-700 mb-2"
          style={{ fontWeight: 400 }}
        >
          Thank you for reaching out.
        </p>
        <p className="text-sm text-ink-600 leading-relaxed">
          Svitlana will send you a private link to watch <em>{productName}</em>
          {" "}once she&apos;s confirmed your payment. Check your inbox over the
          next day or two.
        </p>
        {paymentInstructions && (
          <div
            className="mt-5 p-4 text-left rounded"
            style={{
              background: "rgba(176, 92, 54, 0.06)",
              border: "1px solid rgba(176, 92, 54, 0.18)",
            }}
          >
            <div
              className="text-[10px] uppercase tracking-wider font-mono mb-2"
              style={{ color: "var(--land-clay, #b05c36)" }}
            >
              How to pay
            </div>
            <p className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed">
              {paymentInstructions}
            </p>
            <p className="text-[11px] text-ink-500 italic mt-3">
              Amount: {priceLabel}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="productId" value={productId} />
      {/* Honeypot — invisible to humans, naive bots fill it. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          top: "-9999px",
          height: 0,
          overflow: "hidden",
        }}
      >
        <label>
          Don&apos;t fill this in:{" "}
          <input type="text" name="_hp" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
          Your name
        </span>
        <input
          type="text"
          name="name"
          required
          maxLength={200}
          autoComplete="name"
          placeholder="What people call you"
          className="mt-1.5 w-full px-3 py-2.5 text-sm border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100"
        />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
          Email
        </span>
        <input
          type="email"
          name="email"
          required
          maxLength={200}
          autoComplete="email"
          placeholder="So Svitlana can send your watch link"
          className="mt-1.5 w-full px-3 py-2.5 text-sm border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100"
        />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
          Phone (optional)
        </span>
        <input
          type="tel"
          name="phone"
          maxLength={50}
          autoComplete="tel"
          className="mt-1.5 w-full px-3 py-2.5 text-sm border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100"
        />
      </label>

      {state && !state.ok && (
        <p className="text-sm italic text-rose-700 serif-italic">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-3 text-sm font-medium text-white rounded-md disabled:opacity-50"
        style={{
          background: "var(--land-clay, #b05c36)",
          letterSpacing: "0.02em",
        }}
      >
        {pending ? "Sending…" : `Request ${productName} (${priceLabel}) →`}
      </button>

      <p className="text-[11px] italic text-center text-ink-500 serif-italic mt-3">
        No payment now — Svitlana will email instructions and your private
        watch link.
      </p>
    </form>
  );
}
