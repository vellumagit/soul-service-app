"use client";

// Stripe "Reserve & pay" form for a Circle seat. Collects name + email
// (+ optional phone), creates a Checkout Session server-side, and sends
// the buyer to Stripe's hosted payment page. On return, /circles/[id]
// shows the ?paid=1 success state.
//
// Below it, a quiet "other ways to pay" toggle reveals the existing manual
// hold-a-seat form (Venmo/cash lane).
//
// All visible text arrives via `copy` in the CIRCLE's language — the
// priced CTA (reserveLabel) is resolved server-side.

import { useState, useTransition } from "react";
import { createCircleCheckout } from "@/lib/group-actions";
import { CircleSignupForm } from "./CircleSignupForm";
import type { CircleFormCopy } from "@/lib/landing-copy";

interface Props {
  sessionId: string;
  paymentInstructions: string | null;
  copy: CircleFormCopy;
}

export function CirclePurchaseForm({
  sessionId,
  paymentInstructions,
  copy,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setError(null);
    startTransition(async () => {
      const r = await createCircleCheckout({
        groupSessionId: sessionId,
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        phone: String(data.get("phone") ?? ""),
        _hp: String(data.get("_hp") ?? ""),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      window.location.href = r.url;
    });
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Honeypot */}
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
            placeholder={copy.emailPlaceholderPay}
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
            placeholder={copy.phonePlaceholder}
            className="mt-1.5 w-full px-3 py-2.5 text-sm border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100"
          />
        </label>

        {error && (
          <p className="text-sm italic text-rose-700 serif-italic">{error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 text-sm font-medium text-white rounded-md disabled:opacity-50"
          style={{ background: "var(--land-clay, #b05c36)", letterSpacing: "0.02em" }}
        >
          {pending ? copy.checkoutPending : copy.reserveLabel}
        </button>

        <p className="text-[11px] italic text-center text-ink-500 serif-italic">
          {copy.stripeNote}
        </p>
      </form>

      <div className="mt-5 text-center">
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="text-[12px] text-ink-500 hover:text-plum-700 underline"
        >
          {showManual ? copy.hideOtherWays : copy.showOtherWays}
        </button>
      </div>

      {showManual && (
        <div className="mt-4 pt-4 border-t border-ink-100">
          <CircleSignupForm
            sessionId={sessionId}
            paymentInstructions={paymentInstructions}
            copy={copy}
          />
        </div>
      )}
    </div>
  );
}
