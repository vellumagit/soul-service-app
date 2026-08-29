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
  markLeadSubmissionNotSpam,
} from "@/lib/actions";
import type { LeadSubmissionRow } from "@/db/queries";
import { notify } from "./FlashNotifier";
import { relativeTime } from "@/lib/format";

export function LeadInboxList({
  submissions,
  filter,
}: {
  submissions: LeadSubmissionRow[];
  filter: "pending" | "accepted" | "rejected" | "spam" | "all";
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
    "accept" | "reject" | "delete" | "notspam" | null
  >(null);
  const [hidden, setHidden] = useState(false);
  const fields = (s.fields ?? {}) as Record<string, unknown>;
  const fieldEntries = Object.entries(fields);

  // Our own first-party submissions (lead magnets + the compass quiz) carry
  // internal plumbing in `fields` — magnetId, followupsSent, kind, source… —
  // that means nothing to her. For those, hide the plumbing keys and show a
  // plain-language summary instead. External form submissions are left exactly
  // as they arrive, so a real custom field is never swallowed.
  const isFirstParty =
    fields.kind === "lead-magnet" || fields.source === "compass-quiz";
  const visibleEntries = isFirstParty
    ? fieldEntries.filter(([k]) => !INTERNAL_FIELD_KEYS.has(k))
    : fieldEntries;
  const summary = humanSummary(fields);

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
      case "spam":
        return <span className="chip bg-red-50 text-red-700">spam</span>;
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
          {summary ? (
            <div className="text-sm text-ink-700 mt-2 flex items-start gap-1.5">
              <span aria-hidden className="text-plum-400 leading-snug">
                ↳
              </span>
              <span className="leading-snug">{summary}</span>
            </div>
          ) : (
            intentPreview && (
              <div className="text-sm text-ink-700 italic mt-2 border-l-2 border-plum-300 pl-2 leading-snug">
                &ldquo;{intentPreview}&rdquo;
              </div>
            )
          )}
          {visibleEntries.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="text-ink-500 cursor-pointer hover:text-ink-900">
                {visibleEntries.length} field
                {visibleEntries.length === 1 ? "" : "s"}
              </summary>
              <dl className="mt-1.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
                {visibleEntries.map(([k, v]) => (
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
            {/* IP + referer are spam-triage forensics for external forms; for
                first-party sign-ups (lead magnets, quiz) they're just noise. */}
            {!isFirstParty && s.sourceIp && (
              <>
                {" · "}
                <span title="Source IP">{s.sourceIp}</span>
              </>
            )}
            {!isFirstParty && s.referer && (
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
                      body: r.portalInvited
                        ? "Portal access turned on and a sign-in link emailed to them."
                        : "Open the entry to fill in more.",
                      ttlMs: 3500,
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
          {s.status === "spam" && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setBusy("notspam");
                  const r = await markLeadSubmissionNotSpam(s.id);
                  setBusy(null);
                  if (!r.ok) {
                    notify({
                      kind: "warning",
                      title: "Restore failed",
                      body: r.error,
                    });
                    return;
                  }
                  notify({
                    kind: "success",
                    title: "Moved back to Pending",
                    ttlMs: 2500,
                  });
                  setHidden(true);
                })
              }
              className="px-3 py-1.5 text-xs font-medium text-sage-700 hover:text-sage-800 border border-sage-200 rounded-md disabled:opacity-50"
            >
              {busy === "notspam" ? "Restoring…" : "Not spam"}
            </button>
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

// Internal plumbing keys carried on our own lead-magnet + quiz submissions.
// Hidden from the field dump because they mean nothing to her (the useful bits
// go into humanSummary instead). Only applied to first-party submissions, so an
// external form that happens to send a "source" field keeps showing it.
const INTERNAL_FIELD_KEYS = new Set([
  "kind",
  "source",
  "lang",
  "magnetId",
  "magnetSlug",
  "magnetTitle",
  "followupsSent",
  "quizResult",
  "quizResultLabel",
  "wantsWorkbook",
]);

/** A plain-language line for our own submissions — what this person actually
 *  did — so she reads "Downloaded …" instead of a JSON blob. Returns null for
 *  external forms (they fall back to the message/intent preview). */
function humanSummary(fields: Record<string, unknown>): string | null {
  if (fields.kind === "lead-magnet") {
    const title =
      typeof fields.magnetTitle === "string" && fields.magnetTitle.trim()
        ? fields.magnetTitle.trim()
        : "a free resource";
    return `Downloaded “${title}”`;
  }
  if (
    fields.source === "compass-quiz" ||
    typeof fields.quizResultLabel === "string"
  ) {
    const label =
      typeof fields.quizResultLabel === "string" && fields.quizResultLabel.trim()
        ? fields.quizResultLabel.trim()
        : null;
    const base = label
      ? `Took the compass quiz → ${label}`
      : "Took the compass quiz";
    return fields.wantsWorkbook ? `${base} · asked for the workbook` : base;
  }
  return null;
}
