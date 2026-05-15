"use client";

import { useState } from "react";
import { ConfirmButton } from "./ConfirmButton";
import { startGoogleConnect, disconnectGoogleAction } from "@/lib/actions";
import { fullDate } from "@/lib/format";

type Props = {
  connected: boolean;
  email: string | null;
  connectedAt: Date | null;
  // Surfaces ?google=connected | ?google=error from the OAuth callback
  flashStatus?: "connected" | "error" | null;
  flashEmail?: string | null;
  flashReason?: string | null;
};

export function GoogleCalendarSection(props: Props) {
  const [connecting, setConnecting] = useState(false);

  return (
    <section className="border border-ink-200 rounded-md bg-white p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">
            Google Calendar &amp; Meet
          </h2>
          <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">
            When connected, scheduling a session auto-creates a Google Calendar
            event with a Meet link and emails an invite to your client.
            Reschedules and cancellations sync automatically.
          </p>
        </div>
      </div>

      {props.flashStatus === "connected" && (
        <div className="mb-3 text-xs text-green-700 bg-green-50 border border-green-100 rounded p-2">
          Connected as{" "}
          <strong>{props.flashEmail || "your Google account"}</strong>.
        </div>
      )}
      {props.flashStatus === "error" && (
        <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
          Connection failed: {props.flashReason ?? "unknown error"}
        </div>
      )}

      {props.connected ? (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <span className="dot bg-green-500" />
            <span className="text-ink-700">
              Connected as{" "}
              <strong className="text-ink-900">
                {props.email ?? "(no email)"}
              </strong>
            </span>
          </div>
          {props.connectedAt && (
            <span className="text-[11px] text-ink-400">
              since {fullDate(props.connectedAt)}
            </span>
          )}
          <div className="flex-1" />
          <ConfirmButton
            label={
              <span className="text-xs text-ink-500 hover:text-red-700">
                Disconnect
              </span>
            }
            message="Disconnect Google Calendar? Future sessions will need a Meet link pasted manually. Existing Google Calendar events won't be deleted."
            confirmLabel="Yes, disconnect"
            onConfirm={async () => {
              await disconnectGoogleAction();
            }}
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <form
            action={async () => {
              setConnecting(true);
              await startGoogleConnect();
            }}
          >
            <button
              type="submit"
              disabled={connecting}
              className="bg-ink-900 hover:bg-ink-800 text-white text-sm font-medium px-4 py-2 rounded-md inline-flex items-center gap-2 disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              {connecting ? "Redirecting…" : "Connect Google Calendar"}
            </button>
          </form>
          <span className="text-xs text-ink-500">
            You&apos;ll be redirected to Google to grant access.
          </span>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-ink-100 text-[11px] text-ink-500 leading-relaxed">
        <strong className="text-ink-700">What we do with your account:</strong>{" "}
        Create / update / delete events on your primary calendar (only sessions
        scheduled here). We don&apos;t read your other calendar events. Each
        signed-in account connects its own Google — your calendar isn&apos;t
        shared with other accounts on this app.
      </div>
    </section>
  );
}
