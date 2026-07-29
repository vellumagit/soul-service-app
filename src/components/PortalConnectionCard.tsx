"use client";

// The client portal, on the front page of a client's profile.
//
// This used to be a checkbox buried in Edit profile plus a thin text link on
// the overview — two screens and a save to do one thing, and invisible unless
// you already knew it existed. Now it's one card near the top with three
// honest states:
//
//   not connected  → a real button: "Give <name> their own space"
//   invited        → "Invitation sent · they haven't signed in yet" + resend
//   connected      → "Connected" + when they last signed in
//
// The middle and last states are the same DB flag (portal_enabled); what
// separates them is whether last_portal_visit_at exists. That distinction is
// the useful one — "I sent it" and "they're actually using it" are different
// facts and she needs to be able to tell them apart at a glance.

import { useState, useTransition } from "react";
import {
  connectClientPortal,
  disconnectClientPortal,
  sendPortalInvite,
} from "@/lib/actions";
import { notify } from "./FlashNotifier";

export function PortalConnectionCard({
  clientId,
  clientFirstName,
  enabled,
  lastVisitAt,
  hasEmail,
}: {
  clientId: string;
  clientFirstName: string;
  enabled: boolean;
  lastVisitAt: Date | null;
  /** No email on file → nothing can be sent, so say that instead of a button
   *  that always fails. */
  hasEmail: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [justSent, setJustSent] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  // Connected vs invited is the same flag; what separates them is whether
  // they've ever actually signed in. Everything below branches on `connected`,
  // so "invited" is simply `enabled && !connected`.
  const connected = enabled && !!lastVisitAt;

  function run(
    fn: () => Promise<
      { ok: true; sentTo?: string; suppressed?: boolean } | { ok: false; error: string }
    >,
    successTitle: string
  ) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        notify({ kind: "warning", title: "That didn't work", body: r.error });
        return;
      }
      if ("sentTo" in r && r.sentTo) {
        setJustSent(true);
        notify({
          kind: r.suppressed ? "warning" : "success",
          title: successTitle,
          body: r.suppressed
            ? `Blocked before sending to ${r.sentTo} — an email guard is on, so no link actually went out.`
            : `Sign-in link sent to ${r.sentTo}.`,
          ttlMs: 5000,
        });
        return;
      }
      notify({ kind: "success", title: successTitle, ttlMs: 3000 });
    });
  }

  // ── Not connected ──────────────────────────────────────────────────────
  if (!enabled) {
    return (
      <section className="paper-card p-5 md:p-6 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest text-honey-700 font-mono mb-1.5">
              Their own space
            </p>
            <p
              className="serif-italic text-lg text-plum-700 mb-1"
              style={{ fontWeight: 400 }}
            >
              {clientFirstName} doesn&apos;t have a portal yet.
            </p>
            <p className="text-sm text-ink-600 leading-relaxed">
              A private page where they see their upcoming sessions, join the
              room, write reflections, settle up, and ask for another time.
              One click turns it on and emails them a sign-in link.
            </p>
          </div>
          <div className="shrink-0">
            <button
              type="button"
              disabled={pending || !hasEmail}
              onClick={() =>
                run(
                  () => connectClientPortal(clientId),
                  "Their space is open"
                )
              }
              className="px-5 py-2.5 text-sm bg-plum-700 hover:bg-plum-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
            >
              {pending ? "Opening…" : `Give ${clientFirstName} their own space →`}
            </button>
            {!hasEmail && (
              <p className="text-[11px] text-honey-700 italic mt-2 max-w-[15rem] leading-snug">
                Add an email in Edit profile first — the sign-in link has
                nowhere to go without one.
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  // ── Connected, or invited and waiting ─────────────────────────────────
  return (
    <section
      className="rounded-md p-5 md:p-6 mb-5"
      style={{
        background: "var(--color-honey-50)",
        border: "1px solid var(--color-honey-100)",
      }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest text-honey-700 font-mono mb-1.5">
            {connected ? "Client portal · connected" : "Client portal · invited"}
          </p>
          <p
            className="serif-italic text-lg text-plum-700 mb-1"
            style={{ fontWeight: 400 }}
          >
            {connected
              ? `${clientFirstName} is in their space.`
              : `Invitation sent to ${clientFirstName}.`}
          </p>
          <p className="text-sm text-ink-600 leading-relaxed">
            {connected ? (
              <>
                Last signed in {humanizeAgo(new Date(lastVisitAt!))}. They can
                see their sessions, write reflections and ask for a new time.
              </>
            ) : (
              <>
                They haven&apos;t signed in yet. The link expires 30 minutes
                after it&apos;s sent, so send a fresh one if it&apos;s gone
                stale.
              </>
            )}
          </p>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2">
          <button
            type="button"
            disabled={pending || justSent}
            onClick={() =>
              run(() => sendPortalInvite(clientId), "Sign-in link sent")
            }
            className="px-4 py-2 text-sm rounded-md border border-honey-300 text-honey-700 hover:bg-honey-100 disabled:opacity-60 font-medium transition-colors bg-white"
          >
            {justSent
              ? "✓ Sent"
              : pending
                ? "Sending…"
                : connected
                  ? "Send a fresh link"
                  : "Resend invitation"}
          </button>

          {confirmOff ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => disconnectClientPortal(clientId),
                    "Their space is closed"
                  )
                }
                className="text-[11px] font-medium text-honey-700 hover:underline disabled:opacity-60"
              >
                Yes, close it
              </button>
              <button
                type="button"
                onClick={() => setConfirmOff(false)}
                className="text-[11px] text-ink-500 hover:text-ink-900"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmOff(true)}
              className="text-[11px] text-ink-500 hover:text-ink-900"
            >
              Close their space
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function humanizeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
