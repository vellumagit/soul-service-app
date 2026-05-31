"use client";

// Client-side controller for the inbox row UI. Each pending submission is
// a card with the canonical fields up top, custom JSON fields collapsed
// below, and Accept / Reject / Delete actions inline. Optimistic UI: once
// she taps Accept on a row, it slides into "accepting…" then disappears
// (the page re-renders from the server action's revalidatePath).

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  acceptLeadSubmission,
  rejectLeadSubmission,
  deleteLeadSubmission,
} from "@/lib/actions";
import type { LeadSubmissionRow } from "@/db/queries";
import { notify } from "./FlashNotifier";
import { relativeTime } from "@/lib/format";

export function LeadInboxList({
  submissions,
  filter,
}: {
  submissions: LeadSubmissionRow[];
  filter: "pending" | "accepted" | "rejected" | "all";
}) {
  return (
    <ul className="space-y-2">
      {submissions.map((s) => (
        <SubmissionRow key={s.id} submission={s} filter={filter} />
      ))}
    </ul>
  );
}

function SubmissionRow({
  submission: s,
  filter,
}: {
  submission: LeadSubmissionRow;
  filter: string;
}) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<
    "accept" | "reject" | "delete" | null
  >(null);
  const [hidden, setHidden] = useState(false);
  const fields = (s.fields ?? {}) as Record<string, unknown>;
  const fieldEntries = Object.entries(fields);

  if (hidden) return null;

  const intentPreview =
    pickStringField(fields, [
      "intent",
      "working_on",
      "workingOn",
      "what_brings_you",
      "whatBringsYou",
      "message",
    ]) ?? null;

  const statusChip = (() => {
    switch (s.status) {
      case "pending":
        return (
          <span className="chip bg-honey-50 text-honey-700">pending</span>
        );
      case "accepted":
        return (
          <span className="chip bg-sage-50 text-sage-700">accepted</span>
        );
      case "rejected":
        return (
          <span className="chip bg-ink-100 text-ink-500">rejected</span>
        );
      case "duplicate":
        return (
          <span className="chip bg-ink-100 text-ink-500">duplicate</span>
        );
      default:
        return null;
    }
  })();

  return (
    <li className="paper-card p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-ink-900">
              {s.name ?? s.email ?? "Unnamed lead"}
            </span>
            <span className="chip bg-plum-50 text-plum-700">
              {s.formName}
            </span>
            {statusChip}
          </div>
          {s.email && (
            <div className="text-xs text-ink-600 mt-1">
              <a
                href={`mailto:${s.email}`}
                className="hover:text-plum-700"
              >
                {s.email}
              </a>
              {s.phone && (
                <>
                  {" · "}
                  <span className="font-mono">{s.phone}</span>
                </>
              )}
            </div>
          )}
          {intentPreview && (
            <div className="text-sm text-ink-700 italic mt-2 border-l-2 border-plum-300 pl-2 leading-snug">
              &ldquo;{intentPreview}&rdquo;
            </div>
          )}
          {fieldEntries.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="text-ink-500 cursor-pointer hover:text-ink-900">
                {fieldEntries.length} field
                {fieldEntries.length === 1 ? "" : "s"}
              </summary>
              <dl className="mt-1.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
                {fieldEntries.map(([k, v]) => (
                  <ContextRow key={k} fieldKey={k} value={v} />
                ))}
              </dl>
            </details>
          )}
          {s.promotedClientId && (
            <div className="text-[11px] text-sage-700 mt-2">
              →{" "}
              <Link
                href={`/clients/${s.promotedClientId}`}
                className="hover:underline"
              >
                Open the Network entry
              </Link>
            </div>
          )}
          <div className="text-[11px] text-ink-400 mt-2 font-mono">
            {relativeTime(s.createdAt)}
            {s.sourceIp && (
              <>
                {" · "}
                <span title="Source IP">{s.sourceIp}</span>
              </>
            )}
            {s.referer && (
              <>
                {" · ref: "}
                <span className="truncate inline-block max-w-[200px] align-bottom">
                  {s.referer}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {s.status === "pending" && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setBusy("accept");
                    const r = await acceptLeadSubmission(s.id);
                    setBusy(null);
                    if (!r.ok) {
                      notify({
                        kind: "warning",
                        title: "Accept failed",
                        body: r.error,
                      });
                      return;
                    }
                    setHidden(true);
                    notify({
                      kind: "success",
                      title: "Added to your network",
                      body: "Open the entry to fill in more.",
                      ttlMs: 3000,
                    });
                  })
                }
                className="px-3 py-1.5 text-xs font-medium bg-ink-900 hover:bg-ink-800 text-white rounded-md disabled:opacity-50"
              >
                {busy === "accept" ? "Accepting…" : "Accept"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setBusy("reject");
                    const r = await rejectLeadSubmission(s.id);
                    setBusy(null);
                    if (!r.ok) {
                      notify({
                        kind: "warning",
                        title: "Reject failed",
                        body: r.error,
                      });
                      return;
                    }
                    setHidden(true);
                  })
                }
                className="px-3 py-1.5 text-xs text-ink-500 hover:text-amber-700 rounded-md disabled:opacity-50"
              >
                Reject
              </button>
            </>
          )}
          {(filter !== "pending" || s.status !== "pending") && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setBusy("delete");
                  const r = await deleteLeadSubmission(s.id);
                  setBusy(null);
                  if (!r.ok) {
                    notify({
                      kind: "warning",
                      title: "Delete failed",
                      body: r.error,
                    });
                    return;
                  }
                  setHidden(true);
                })
              }
              className="text-[11px] text-ink-400 hover:text-red-700 disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function ContextRow({
  fieldKey,
  value,
}: {
  fieldKey: string;
  value: unknown;
}) {
  const display =
    value === null || value === undefined
      ? "(empty)"
      : typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value);
  return (
    <>
      <dt className="text-ink-500 font-mono">{fieldKey}</dt>
      <dd className="text-ink-700 truncate">{display}</dd>
    </>
  );
}

function pickStringField(
  obj: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}
