"use client";

// Public-facing sign-up form for a group session. No auth — the only
// gatekeeping is the rate limit + honeypot on the server action.
// On success, replaces itself with a thank-you card that includes the
// practitioner's payment instructions so the attendee knows how to
// settle up.
//
// All visible text arrives via `copy` — the page passes strings in the
// CIRCLE's language (EN or УКР), so a shared Ukrainian circle link reads
// Ukrainian end to end.

import { useActionState, useEffect, useState } from "react";
import {
  signUpForGroupSession,
  type SignUpResult,
} from "@/lib/group-actions";
import type { CircleFormCopy } from "@/lib/landing-copy";

const initialState: SignUpResult | undefined = undefined;

interface Props {
  sessionId: string;
  paymentInstructions: string | null;
  copy: CircleFormCopy;
  /** A free Circle: no payment talk, and sign-up confirms on the spot. */
  free?: boolean;
  /** Date locale for the "you're in" time (the Circle's language). */
  dateLocale?: string;
}

export function CircleSignupForm({
  sessionId,
  paymentInstructions,
  copy,
  free = false,
  dateLocale = "en-US",
}: Props) {
  const [state, action, pending] = useActionState(
    signUpForGroupSession,
    initialState
  );

  if (state?.ok && state.free) {
    return <FreeSeatCard seat={state.free} copy={copy} dateLocale={dateLocale} />;
  }

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
              {copy.paymentLabel}
            </div>
            <p className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed">
              {paymentInstructions}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="groupSessionId" value={sessionId} />

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
          placeholder={free ? copy.emailPlaceholderFree : copy.emailPlaceholderHold}
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

      {state && !state.ok && (
        <p className="text-sm italic text-rose-700 serif-italic">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending} aria-busy={pending}
        className="w-full py-3 text-sm font-medium text-white rounded-md disabled:opacity-50"
        style={{
          background: "var(--land-clay, #b05c36)",
          letterSpacing: "0.02em",
        }}
      >
        {free
          ? pending
            ? copy.freeSubmitting
            : copy.freeSubmit
          : pending
            ? copy.holdSubmitting
            : copy.holdSubmit}
      </button>

      <p className="text-[11px] italic text-center text-ink-500 serif-italic mt-3">
        {free ? copy.freeFootnote : copy.holdFootnote}
      </p>
    </form>
  );
}

// The Join button only shows from 15 minutes before the start until the end.
// Clicking a Meet link two days early drops someone into an empty room with
// no idea whether they got it wrong — so before the window we say when it is
// and that the link is in their inbox, and the button appears on its own if
// they leave the page open.
const JOIN_OPENS_MS = 15 * 60 * 1000;

function FreeSeatCard({
  seat,
  copy,
  dateLocale,
}: {
  seat: { meetingUrl: string | null; startsAt: string; endsAt: string };
  copy: CircleFormCopy;
  dateLocale: string;
}) {
  const startMs = new Date(seat.startsAt).getTime();
  const endMs = new Date(seat.endsAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  const joinOpen =
    !!seat.meetingUrl && now >= startMs - JOIN_OPENS_MS && now < endMs;

  // In the VISITOR's own timezone (browser default) — they're the one who
  // has to turn up, wherever they are.
  const when = new Date(startMs).toLocaleString(dateLocale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className="rounded-md p-6 md:p-8 text-center"
      style={{
        background: "var(--color-honey-50)",
        border: "1px solid var(--color-honey-100)",
      }}
    >
      <p
        className="serif-italic text-lg text-plum-700 mb-3"
        style={{ fontWeight: 400 }}
      >
        {copy.freeSuccessTitle}
      </p>
      <p className="text-[10px] uppercase tracking-wider font-mono text-ink-500">
        {copy.freeWhenLabel}
      </p>
      <p className="text-sm text-ink-800 mb-4">
        {when} <span className="text-ink-500">{copy.freeYourTime}</span>
      </p>

      {joinOpen ? (
        <>
          <p className="text-sm text-ink-600 leading-relaxed mb-4">
            {copy.freeNowBody}
          </p>
          <a
            href={seat.meetingUrl!}
            target="_blank"
            rel="noreferrer"
            className="inline-block w-full py-3 text-sm font-medium text-white rounded-md"
            style={{
              background: "var(--land-clay, #b05c36)",
              letterSpacing: "0.02em",
            }}
          >
            {copy.freeJoin}
          </a>
        </>
      ) : seat.meetingUrl ? (
        <>
          <p className="text-sm text-ink-600 leading-relaxed">
            {copy.freeLaterBody}
          </p>
          <p className="text-[12px] italic text-ink-500 serif-italic mt-3">
            {copy.freeLaterHint}
          </p>
        </>
      ) : (
        <p className="text-sm text-ink-600 leading-relaxed">
          {copy.freeNoLink}
        </p>
      )}

      <p className="text-[11px] text-ink-500 mt-4">{copy.freeSpam}</p>
    </div>
  );
}
