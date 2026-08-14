"use client";

// Public purchase-request form. Mirrors CircleSignupForm — name + email +
// optional phone, with honeypot. On success, shows a thank-you with the
// payment instructions so the buyer knows what to do next.

import { useActionState } from "react";
import {
  requestProductPurchase,
  type PurchaseRequestResult,
} from "@/lib/product-actions";
import type { LandingCopy } from "@/lib/landing-copy";

const initialState: PurchaseRequestResult | undefined = undefined;

interface Props {
  productId: string;
  productName: string;
  priceLabel: string;
  paymentInstructions: string | null;
  copy: LandingCopy["offerings"]["form"];
}

export function PurchaseRequestForm({
  productId,
  productName,
  priceLabel,
  paymentInstructions,
  copy,
}: Props) {
  const [state, action, pending] = useActionState(
    requestProductPurchase,
    initialState
  );
  // The thank-you line embeds the (single-language, practitioner-authored)
  // product name; split on the placeholder so it can sit anywhere the
  // translation puts it and still render emphasized.
  const [thankPre, thankPost] = copy.thankBody.split("{name}");

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
          {copy.thankTitle}
        </p>
        <p className="text-sm text-ink-600 leading-relaxed">
          {thankPre}
          <em>{productName}</em>
          {thankPost}
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
              {copy.howToPay}
            </div>
            <p className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed">
              {paymentInstructions}
            </p>
            <p className="text-[11px] text-ink-500 italic mt-3">
              {copy.amount} {priceLabel}
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
          {copy.nameLabel}
        </span>
        <input
          type="text"
          name="name"
          required
          maxLength={200}
          autoComplete="name"
          placeholder={copy.namePlaceholder}
          className="mt-1.5 w-full px-3 py-2.5 text-sm border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100"
        />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
          {copy.emailLabel}
        </span>
        <input
          type="email"
          name="email"
          required
          maxLength={200}
          autoComplete="email"
          placeholder={copy.emailPlaceholder}
          className="mt-1.5 w-full px-3 py-2.5 text-sm border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100"
        />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
          {copy.phoneLabel}
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
        {pending
          ? copy.sending
          : copy.requestCta
              .replace("{name}", productName)
              .replace("{price}", priceLabel)}
      </button>

      <p className="text-[11px] italic text-center text-ink-500 serif-italic mt-3">
        {copy.noPaymentNote}
      </p>
    </form>
  );
}
