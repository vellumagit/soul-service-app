"use client";

// One row in the Loose Ends "Refund requests" section. A paid Circle attendee
// asked to cancel + be refunded. "Refund & release" issues the Stripe refund on
// her connected account (which frees the seat + emails them); "Keep them in"
// dismisses the request without refunding.

import { useState } from "react";
import {
  approveCircleRefund,
  dismissCircleRefundRequest,
} from "@/lib/group-actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { notify } from "./FlashNotifier";

export function CircleRefundRequestRow({
  attendeeId,
  name,
  email,
  circleName,
  whenLabel,
}: {
  attendeeId: string;
  name: string;
  email: string;
  circleName: string;
  whenLabel: string;
}) {
  const [busy, setBusy] = useState<null | "approve" | "dismiss">(null);
  const [done, setDone] = useState<null | "refunded" | "kept">(null);

  async function approve() {
    setBusy("approve");
    try {
      const res = await approveCircleRefund(attendeeId);
      if (!res.ok) {
        notify({ kind: "error", title: "Couldn't refund", body: res.error, ttlMs: 6000 });
        return;
      }
      setDone("refunded");
      notify({
        kind: "success",
        title: "Refunded & seat released",
        body: `${name} has been refunded and emailed.`,
        ttlMs: 4500,
      });
    } catch (e) {
      rethrowIfRedirect(e);
      notify({ kind: "error", title: "Couldn't refund", body: "Please try again.", ttlMs: 5000 });
    } finally {
      setBusy(null);
    }
  }

  async function dismiss() {
    setBusy("dismiss");
    try {
      const res = await dismissCircleRefundRequest(attendeeId);
      if (!res.ok) {
        notify({ kind: "error", title: "Couldn't update", body: res.error, ttlMs: 5000 });
        return;
      }
      setDone("kept");
      notify({ kind: "success", title: "Kept their seat", body: `${name} stays booked.`, ttlMs: 4000 });
    } catch (e) {
      rethrowIfRedirect(e);
      notify({ kind: "error", title: "Couldn't update", body: "Please try again.", ttlMs: 5000 });
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <div className="paper-card p-4 flex items-center justify-between gap-3 flex-wrap opacity-70">
        <div className="text-sm text-ink-600">
          <strong>{name}</strong> ·{" "}
          {done === "refunded" ? "refunded & released" : "kept their seat"}
        </div>
      </div>
    );
  }

  return (
    <div className="paper-card p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <div className="text-sm text-ink-900" style={{ fontWeight: 500 }}>
          {name}{" "}
          <span className="text-ink-400 font-normal">·</span>{" "}
          <span className="text-ink-500 font-normal">{email}</span>
        </div>
        <div className="text-[12px] text-ink-500 font-mono mt-0.5">
          {circleName} · {whenLabel} · asked to cancel
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={approve}
          disabled={busy !== null}
          className="text-xs bg-plum-700 hover:bg-plum-600 text-white rounded-md px-3 py-1.5 font-medium disabled:opacity-50"
        >
          {busy === "approve" ? "Refunding…" : "Refund & release"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          disabled={busy !== null}
          className="text-xs text-ink-500 hover:text-ink-800 disabled:opacity-50"
        >
          {busy === "dismiss" ? "…" : "Keep them in"}
        </button>
      </div>
    </div>
  );
}
