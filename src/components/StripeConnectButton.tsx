"use client";

// Stripe Connect control for the /status page. Mirrors the "Reconnect Google"
// pattern: a single obvious button for a non-technical practitioner.
//
//   - Not connected      → "Connect with Stripe" (GET → OAuth consent screen)
//   - Connected, pending  → "Open Stripe to finish setup" (bank + identity)
//   - Connected, ready    → just a quiet "Disconnect"
//
// The connect action is a plain link so the browser carries the session cookie
// on the top-level navigation; disconnect is a POST.

import { useState, useTransition } from "react";

export function StripeConnectButton({
  connected,
  chargesEnabled,
}: {
  connected: boolean;
  chargesEnabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  function disconnect() {
    if (
      !confirm(
        "Disconnect Stripe? Card payments will pause until you reconnect. Your Stripe account and any past payments are untouched."
      )
    ) {
      return;
    }
    setBusy(true);
    startTransition(async () => {
      try {
        const res = await fetch("/api/integrations/stripe/disconnect", {
          method: "POST",
        });
        if (!res.ok) {
          alert("Could not disconnect. Please try again.");
          setBusy(false);
          return;
        }
        // Reload whatever page the button is on (Settings or Status) so it
        // re-renders with the now-disconnected state.
        window.location.reload();
      } catch {
        alert("Could not disconnect. Please try again.");
        setBusy(false);
      }
    });
  }

  if (!connected) {
    return (
      <a
        href="/api/integrations/stripe/connect"
        className="mt-3 inline-flex items-center gap-2 rounded-md bg-plum-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-plum-700 transition-colors"
      >
        Connect with Stripe
      </a>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {!chargesEnabled && (
        <a
          href="https://dashboard.stripe.com/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-plum-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-plum-700 transition-colors"
        >
          Open Stripe to finish setup →
        </a>
      )}
      <button
        type="button"
        onClick={disconnect}
        disabled={isPending || busy}
        className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-3 py-2 text-xs font-medium text-ink-500 hover:bg-ink-50 hover:text-ink-700 transition-colors disabled:opacity-50"
      >
        {busy ? "Disconnecting…" : "Disconnect"}
      </button>
    </div>
  );
}
