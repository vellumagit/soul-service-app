"use client";

// "Pay by card" on an outstanding session in /portal/billing.
//
// Only rendered when she's connected Stripe and finished activation — the
// server action re-checks that anyway, but a button that always fails would
// be worse than no button. Sends the client to Stripe Checkout; the webhook,
// not the return redirect, is what actually marks the session paid.

import { useState, useTransition } from "react";
import { createSessionPaymentCheckout } from "@/lib/portal-payment-actions";

export function PortalPayButton({
  sessionId,
  amountLabel,
}: {
  sessionId: string;
  amountLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Held true through the redirect so the button can't be clicked twice while
  // the browser is still navigating to Stripe.
  const [leaving, setLeaving] = useState(false);
  const busy = pending || leaving;

  function pay() {
    setError(null);
    startTransition(async () => {
      const res = await createSessionPaymentCheckout(sessionId);
      if (res.ok) {
        setLeaving(true);
        window.location.href = res.url;
        return;
      }
      setError(res.error);
    });
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className="px-3 py-1.5 text-xs bg-plum-700 hover:bg-plum-600 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
      >
        {busy ? "Opening…" : `Pay ${amountLabel} by card`}
      </button>
      {error && (
        <p className="text-[11px] text-honey-700 italic mt-1.5 leading-snug">
          {error}
        </p>
      )}
    </div>
  );
}
