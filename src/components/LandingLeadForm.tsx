"use client";

// Lead capture form on the landing page. Submits via the
// submitLandingLead server action (no auth needed). On success, replaces
// itself with a quiet thank-you card. On error, shows the error inline.
//
// Optionally accepts `availableWindows` — pre-computed next-N open slots
// from Svit's calendar. When present, the form shows them as clickable
// chips above the "what brings you here" textarea. Clicking a chip
// attaches the picked window to the submission. NOT an auto-book — the
// inquiry still goes to her inbox; the chip just gives the client a
// concrete suggestion to anchor their inquiry.
//
// Honeypot field `_hp` is rendered hidden via aria-hidden + CSS to
// catch naive bots without depending on JS — the form action runs
// server-side regardless of JS, so the honeypot needs to be a real
// rendered field, just visually + semantically hidden from humans.

import { useActionState, useState } from "react";
import {
  submitLandingLead,
  type LandingLeadResult,
} from "@/lib/landing-lead-action";
import type { LandingCopy } from "@/lib/landing-copy";

type LandingFormCopy = LandingCopy["form"];

const initialState: LandingLeadResult | undefined = undefined;

export type LandingWindow = {
  /** ISO string, since this is serialized across the server/client boundary. */
  startAt: string;
  endAt: string;
  /** Pre-formatted display label so we don't ship date-fns just for this. */
  label: string;
};

export function LandingLeadForm({
  availableWindows = [],
  copy,
}: {
  availableWindows?: LandingWindow[];
  copy: LandingFormCopy;
}) {
  const [state, action, pending] = useActionState(
    submitLandingLead,
    initialState
  );
  const [pickedWindow, setPickedWindow] = useState<string | null>(null);

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
          {copy.successTitle}
        </p>
        <p className="text-sm text-ink-600 leading-relaxed">
          {copy.successBody}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {/* Honeypot — visually hidden, accessibly hidden, but rendered. */}
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
          Don&apos;t fill this in: <input type="text" name="_hp" tabIndex={-1} autoComplete="off" />
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
          className="mt-1.5 w-full px-3 py-2.5 text-sm border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100"
        />
      </label>

      {availableWindows.length > 0 && (
        <div>
          <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
            {copy.windowsLabel}
          </span>
          <p className="text-[11px] text-ink-500 italic mt-1 mb-2 leading-snug">
            {copy.windowsHint}
          </p>
          <div className="flex flex-wrap gap-2">
            {availableWindows.map((w) => {
              const isPicked = pickedWindow === w.startAt;
              return (
                <button
                  key={w.startAt}
                  type="button"
                  onClick={() =>
                    setPickedWindow(isPicked ? null : w.startAt)
                  }
                  className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                  style={{
                    background: isPicked
                      ? "var(--color-plum-700)"
                      : "var(--color-parchment)",
                    color: isPicked ? "white" : "var(--color-ink-700)",
                    borderColor: isPicked
                      ? "var(--color-plum-700)"
                      : "var(--color-ink-200)",
                  }}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
          {pickedWindow && (
            <input
              type="hidden"
              name="preferredWindowIso"
              value={pickedWindow}
            />
          )}
        </div>
      )}

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
          {copy.messageLabel}
        </span>
        <textarea
          name="message"
          maxLength={2000}
          rows={4}
          placeholder={copy.messagePlaceholder}
          className="mt-1.5 w-full px-3 py-2.5 text-sm leading-relaxed border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100 resize-y"
        />
      </label>

      {state && !state.ok && (
        <div className="text-xs rounded-md border p-3 bg-red-50 border-red-100 text-red-700">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="px-5 py-2.5 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium transition-colors disabled:opacity-60"
      >
        {pending ? copy.submitting : copy.submit}
      </button>

      <p className="text-[11px] text-ink-400 italic">{copy.privacyNote}</p>
    </form>
  );
}
