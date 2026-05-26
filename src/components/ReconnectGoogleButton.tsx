"use client";

// "Reconnect Google" — one-click fix for the scope / invalid_grant family
// of errors. Calls startGoogleConnect, which redirects to Google's consent
// screen. Our select_account+consent prompt forces a fresh grant, so the
// returned tokens carry every scope we need (overwriting the broken ones).
//
// Lives inside the red error box on /status so when she sees
// "Request had insufficient authentication scopes" she has a single button
// to fix it — no detour through Settings → Disconnect → Connect.

import { useTransition } from "react";
import { startGoogleConnect } from "@/lib/actions";
import { notify } from "./FlashNotifier";
import { rethrowIfRedirect } from "@/lib/redirect-error";

export function ReconnectGoogleButton({
  variant = "inline",
}: {
  /** "inline" sits in a colored notice; "solo" is a standalone outline button. */
  variant?: "inline" | "solo";
}) {
  const [pending, start] = useTransition();

  function go() {
    start(async () => {
      try {
        // startGoogleConnect calls redirect() — it'll throw NEXT_REDIRECT.
        // rethrowIfRedirect lets the framework process it; we only land in
        // catch for real errors (network, AUTH_SECRET missing, etc.).
        await startGoogleConnect();
      } catch (err) {
        rethrowIfRedirect(err);
        const msg = err instanceof Error ? err.message : "Unknown error";
        notify({
          kind: "error",
          title: "Couldn't start reconnect",
          body: msg.slice(0, 220),
          ttlMs: 10000,
        });
      }
    });
  }

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className="font-medium text-red-900 underline hover:no-underline disabled:opacity-60"
      >
        {pending ? "Opening Google…" : "Reconnect Google →"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={pending}
      className="text-xs font-medium border border-ink-200 hover:bg-ink-50 px-3 py-1.5 rounded-md disabled:opacity-60"
    >
      {pending ? "Opening Google…" : "Reconnect Google"}
    </button>
  );
}
