// Payments card for the Settings page — the findable home for Stripe Connect
// (mirrors GoogleCalendarSection). The one-click "Connect with Stripe" control
// itself is the shared StripeConnectButton; this card frames it with status +
// an explainer + the post-connect result banner.

import { StripeConnectButton } from "./StripeConnectButton";

type Props = {
  /** Platform can run the Connect handshake (keys + client id + webhook set). */
  platformReady: boolean;
  connected: boolean;
  chargesEnabled: boolean;
  /** ?stripe=… flag the OAuth callback / disconnect redirect back with. */
  flash?: string | null;
};

function flashBanner(
  flash: string
): { tone: "ok" | "warn"; text: string } | null {
  switch (flash) {
    case "connected":
      return {
        tone: "ok",
        text: "Stripe connected. If it still says activation isn't finished below, open Stripe and add your bank details + verify your identity — this updates on its own once that's done.",
      };
    case "disconnected":
      return {
        tone: "warn",
        text: "Stripe disconnected. Card payments are paused until you reconnect.",
      };
    case "denied":
      return {
        tone: "warn",
        text: "Stripe connection was cancelled — no changes made. You can try again anytime.",
      };
    case "disabled":
      return {
        tone: "warn",
        text: "Stripe isn't fully set up on the platform side yet. Ask Brian to finish, then try connecting again.",
      };
    case "bad_state":
    case "identity_mismatch":
    case "missing_params":
    case "exchange_failed":
      return {
        tone: "warn",
        text: "Something went wrong connecting Stripe. Please try again.",
      };
    default:
      return null;
  }
}

export function PaymentsSection({
  platformReady,
  connected,
  chargesEnabled,
  flash,
}: Props) {
  const banner = flash ? flashBanner(flash) : null;

  return (
    <section className="border border-ink-200 rounded-md bg-white p-5">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-ink-900">
          Card payments — Circles
        </h2>
        <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">
          Connect your own Stripe account so people can pay for a Circle seat by
          card. The money goes straight to your account — you&apos;re the
          merchant and you keep 100%. The manual Venmo/cash lane keeps working
          alongside it.
        </p>
      </div>

      {banner && (
        <div
          className={`mb-3 text-xs rounded p-2 border leading-relaxed ${
            banner.tone === "ok"
              ? "text-green-700 bg-green-50 border-green-100"
              : "text-amber-800 bg-amber-50 border-amber-100"
          }`}
        >
          {banner.text}
        </div>
      )}

      {!platformReady ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="dot bg-ink-300" />
          <span className="text-ink-500">
            Card payments aren&apos;t switched on at the platform level yet. Ask
            Brian to finish the Stripe setup — then this turns on here.
          </span>
        </div>
      ) : connected ? (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            {chargesEnabled ? (
              <>
                <span className="dot bg-green-500" />
                <span className="text-ink-700">
                  Connected —{" "}
                  <strong className="text-ink-900">
                    taking card payments
                  </strong>
                  .
                </span>
              </>
            ) : (
              <>
                <span className="dot bg-amber-500" />
                <span className="text-ink-700">
                  Connected — Stripe still needs your{" "}
                  <strong>bank details + ID</strong> before it releases
                  payments.
                </span>
              </>
            )}
          </div>
          <div className="flex-1" />
          <StripeConnectButton connected chargesEnabled={chargesEnabled} />
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <StripeConnectButton connected={false} chargesEnabled={false} />
          <span className="text-xs text-ink-500">
            You&apos;ll be redirected to Stripe to link your account.
          </span>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-ink-100 text-[11px] text-ink-500 leading-relaxed">
        <strong className="text-ink-700">Where the money goes:</strong> straight
        to your own Stripe account — no one else touches it. Disconnect anytime;
        your Stripe account and any past payments stay untouched.
      </div>
    </section>
  );
}
