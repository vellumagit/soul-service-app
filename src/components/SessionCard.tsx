"use client";

import { useEffect, useState } from "react";
import {
  updateSession,
  cancelSession,
  deleteSession,
  markSessionUnpaid,
} from "@/lib/actions";
import type { NoteTemplate, Session } from "@/db/schema";
import {
  fullDate,
  shortTime,
  paymentMethodLabel,
  money,
} from "@/lib/format";
import { Field, inputCls } from "./Form";
import { ConfirmButton } from "./ConfirmButton";
import { MarkPaidDialog } from "./MarkPaidDialog";
import { NotesEditor } from "./NotesEditor";
import { GenerateInvoiceButton } from "./GenerateInvoiceButton";
import { GenerateNotesDialog } from "./GenerateNotesDialog";
import { RescheduleDialog } from "./RescheduleDialog";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { notify } from "./FlashNotifier";
import { describeSaveError } from "@/lib/save-error";
import { PushToGoogleButton } from "./PushToGoogleButton";
import { ClosingRitualDialog } from "./ClosingRitualDialog";

const STATUS_CHIP: Record<string, string> = {
  scheduled: "bg-plum-100 text-plum-700",
  completed: "bg-green-50 text-green-700",
  cancelled: "bg-ink-100 text-ink-500",
  no_show: "bg-amber-50 text-amber-700",
};

export function SessionCard({
  session,
  clientName,
  noteTemplates = [],
  autoUploadAiNotes = false,
}: {
  session: Session;
  /** Used to address her by name in the Closing Ritual prompts. Optional —
   *  if omitted (legacy callers) we fall back to "this person." */
  clientName?: string;
  noteTemplates?: NoteTemplate[];
  /** When true, the AI-notes dialog auto-closes after a successful generation
   *  instead of showing the "Done — close to review" confirmation step. */
  autoUploadAiNotes?: boolean;
}) {
  const [open, setOpen] = useState(session.status === "scheduled");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The Closing Ritual modal. Opens automatically when she marks a session
  // complete for the first time (closingCompletedAt is null), and on-demand
  // via the "Reflect on this session" link for already-completed sessions.
  const [closingOpen, setClosingOpen] = useState(false);
  // Dirty = the form has unsaved typing. Flipped true on any onInput,
  // back to false when the action returns or the user collapses with confirm.
  // Two guard rails:
  //   1. window beforeunload — covers closing the tab, navigating away,
  //      reloading. Browser shows its native "Leave site?" prompt.
  //   2. clicking the card header to collapse asks for confirmation, since
  //      collapsing unmounts the form and loses everything she typed.
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function tryCollapse() {
    if (dirty) {
      const ok = window.confirm(
        "You have unsaved changes in this session. Leave anyway?"
      );
      if (!ok) return;
    }
    setOpen(false);
    setDirty(false);
  }

  const isScheduled = session.status === "scheduled";
  const isCompleted = session.status === "completed";

  return (
    <div
      id={session.id}
      className="border border-ink-200 rounded-md overflow-hidden bg-white"
    >
      <button
        type="button"
        onClick={() => (open ? tryCollapse() : setOpen(true))}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-ink-50 text-left"
      >
        <svg
          className={`w-3 h-3 text-ink-400 transition-transform shrink-0 ${
            open ? "rotate-90" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <div className="text-sm flex-1 min-w-0">
          <div className="font-medium text-ink-900">
            {fullDate(session.scheduledAt)}{" "}
            <span className="text-ink-400 font-normal">·</span>{" "}
            <span className="text-ink-600 font-normal">
              {shortTime(session.scheduledAt)}
            </span>
          </div>
          <div className="text-xs text-ink-500 mt-0.5 truncate">
            {session.type} · {session.durationMinutes}m
            {session.intention ? ` · "${session.intention}"` : ""}
          </div>
        </div>
        <span
          className={`chip ${
            STATUS_CHIP[session.status] ?? "bg-ink-100 text-ink-500"
          } shrink-0`}
        >
          {session.status.toUpperCase()}
        </span>
        {isCompleted && (
          <span
            className={`chip shrink-0 ${
              session.paid
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {session.paid ? "PAID" : "UNPAID"}
          </span>
        )}
        {/* Tiny "closed" mark — only when she's actually saved reflections,
            not when she's skipped. Lets her see at a glance which sessions
            she's sat with. */}
        {isCompleted &&
          session.closingCompletedAt &&
          (session.closingLanded ||
            session.closingRemember ||
            session.closingNeverForget) && (
            <span
              className="shrink-0 text-plum-500"
              title="You reflected on this session"
              aria-label="Closed"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M9.243 3.03a1 1 0 011.514 0l1.92 2.22 2.94-.21a1 1 0 011.07 1.07l-.21 2.94 2.22 1.92a1 1 0 010 1.514l-2.22 1.92.21 2.94a1 1 0 01-1.07 1.07l-2.94-.21-1.92 2.22a1 1 0 01-1.514 0l-1.92-2.22-2.94.21a1 1 0 01-1.07-1.07l.21-2.94L1.3 11.77a1 1 0 010-1.514l2.22-1.92-.21-2.94a1 1 0 011.07-1.07l2.94.21 1.92-2.22z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          )}
      </button>

      {open && (
        <div className="border-t border-ink-100 px-4 py-4 bg-ink-50/40 space-y-4">
          <form
            action={async (fd) => {
              const isMarkComplete = fd.get("markComplete") === "true";
              setSubmitting(true);
              setError(null);
              try {
                await updateSession(fd);
                // Save succeeded — clear the dirty flag so collapsing /
                // navigating away no longer prompts.
                setDirty(false);
                notify({
                  kind: "success",
                  title: isMarkComplete ? "Session marked complete" : "Session saved",
                  ttlMs: 2500,
                });
                // If she just marked it complete AND hasn't done the closing
                // ritual on this session yet, open the ritual modal. The
                // ritual is opt-in (Skip for now is a valid choice) — it
                // just appears, doesn't insist.
                if (isMarkComplete && !session.closingCompletedAt) {
                  setClosingOpen(true);
                }
              } catch (err) {
                rethrowIfRedirect(err);
                const info = describeSaveError(err);
                setError(info.message);
                if (info.offline) {
                  notify({
                    kind: "warning",
                    title: "You're offline",
                    body: "Your typing is saved locally — try again once you're back online.",
                    ttlMs: 10000,
                  });
                }
              } finally {
                setSubmitting(false);
              }
            }}
            onInput={() => {
              if (!dirty) setDirty(true);
            }}
            className="space-y-4"
          >
            <input type="hidden" name="id" value={session.id} />
            <input type="hidden" name="clientId" value={session.clientId} />

            {error && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Session type">
                <input
                  name="type"
                  defaultValue={session.type}
                  className={inputCls}
                />
              </Field>
              <Field label="What they wanted from it">
                <input
                  name="intention"
                  defaultValue={session.intention ?? ""}
                  className={inputCls}
                  placeholder="Their words if you have them"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="How they arrived">
                <input
                  name="arrivedAs"
                  defaultValue={session.arrivedAs ?? ""}
                  className={inputCls}
                  placeholder="brief phrase"
                />
              </Field>
              <Field label="How they left">
                <input
                  name="leftAs"
                  defaultValue={session.leftAs ?? ""}
                  className={inputCls}
                  placeholder="brief phrase"
                />
              </Field>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-ink-700">
                  Session notes
                </label>
                <GenerateNotesDialog
                  sessionId={session.id}
                  noteTemplates={noteTemplates}
                  hasExistingNotes={!!session.notes && session.notes.trim().length > 0}
                  autoClose={autoUploadAiNotes}
                />
              </div>
              <NotesEditor
                name="notes"
                defaultValue={session.notes ?? ""}
                draftKey={`session:${session.id}:notes`}
                templates={noteTemplates.map((t) => ({
                  id: t.id,
                  name: t.name,
                  body: t.body,
                }))}
                rows={8}
                placeholder="Anything you'd want to remember about this session — in your own words. You can also pick a template above, or paste a transcript and click 'AI: structure from transcript' to get a clean draft to edit."
              />
              <div className="text-[11px] text-ink-400 mt-1">
                Markdown supported. Pick a template, or generate a draft from a meeting transcript.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              {dirty && !submitting && (
                <span className="text-[11px] text-amber-700 flex items-center gap-1 mr-auto">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Unsaved changes
                </span>
              )}
              {isScheduled && (
                <button
                  type="submit"
                  name="markComplete"
                  value="true"
                  disabled={submitting}
                  className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-2 rounded-md disabled:opacity-60"
                >
                  {submitting ? "Saving…" : "Save & mark complete"}
                </button>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="bg-ink-900 hover:bg-ink-800 text-white text-sm font-medium px-3 py-2 rounded-md disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Save"}
              </button>
            </div>
          </form>

          {/* The Closing — appears for completed sessions. Either renders the
              saved reflections (with a quiet Edit link) or, if she hasn't
              done the ritual yet, offers a soft "Reflect on this session"
              entry point. Mirrors the same data the post-completion modal
              writes. */}
          {isCompleted && <ClosingSection session={session} onOpen={() => setClosingOpen(true)} />}

          {/* Payment row */}
          <div className="border-t border-ink-100 pt-3 flex items-center gap-3 text-sm flex-wrap">
            <div className="text-ink-500 text-xs">Payment</div>
            {session.paid ? (
              <>
                <span className="chip bg-green-50 text-green-700">PAID</span>
                <span className="text-ink-700 text-xs">
                  {paymentMethodLabel(session.paymentMethod)}
                  {session.paymentAmountCents
                    ? ` · ${money(session.paymentAmountCents)}`
                    : ""}
                  {session.paidAt ? ` · ${session.paidAt}` : ""}
                </span>
                <div className="flex-1" />
                <ConfirmButton
                  destructive={false}
                  label={
                    <span className="text-xs text-ink-500 hover:text-ink-900">
                      Undo
                    </span>
                  }
                  message="Mark this session as unpaid again?"
                  confirmLabel="Yes, mark unpaid"
                  onConfirm={() =>
                    markSessionUnpaid(session.id, session.clientId)
                  }
                />
              </>
            ) : (
              <>
                <span className="text-xs text-ink-500">Not yet recorded</span>
                <div className="flex-1" />
                <MarkPaidDialog
                  sessionId={session.id}
                  clientId={session.clientId}
                />
              </>
            )}
          </div>

          {/* Invoice row — only for completed sessions */}
          {isCompleted && (
            <div className="border-t border-ink-100 pt-3 flex items-center gap-3 text-sm flex-wrap">
              <div className="text-ink-500 text-xs">Invoice</div>
              <GenerateInvoiceButton
                sessionId={session.id}
                clientId={session.clientId}
                hasInvoice={!!session.invoiceUrl}
                invoiceUrl={session.invoiceUrl}
              />
              {session.invoiceNumber && (
                <span className="font-mono text-[11px] text-ink-500">
                  {session.invoiceNumber}
                </span>
              )}
            </div>
          )}

          {/* Cancel / delete row */}
          <div className="border-t border-ink-100 pt-3 flex items-center gap-2 flex-wrap">
            {isScheduled && (
              <>
                <RescheduleDialog
                  sessionId={session.id}
                  clientId={session.clientId}
                  currentScheduledAt={session.scheduledAt}
                  currentDurationMinutes={session.durationMinutes}
                />
                <ConfirmButton
                  destructive={false}
                  label={
                    <span className="text-xs text-ink-500 hover:text-amber-700">
                      Cancel session
                    </span>
                  }
                  message="Cancel this scheduled session? If Google Calendar is connected, the event will be deleted and your client will be notified."
                  confirmLabel="Yes, cancel it"
                  onConfirm={() =>
                    cancelSession(session.id, session.clientId)
                  }
                />
              </>
            )}
            {session.meetUrl && (
              <a
                href={session.meetUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-plum-700 hover:underline"
              >
                Meet link ↗
              </a>
            )}
            <PushToGoogleButton
              sessionId={session.id}
              hasGoogleEvent={!!session.googleEventId}
            />
            <div className="flex-1" />
            <ConfirmButton
              label={
                <span className="text-xs text-ink-400 hover:text-red-700">
                  Delete
                </span>
              }
              message="Delete this session permanently? This can't be undone."
              confirmLabel="Yes, delete"
              onConfirm={() => deleteSession(session.id, session.clientId)}
            />
          </div>
        </div>
      )}

      {/* The Closing Ritual modal — opens automatically when she marks the
          session complete for the first time, and on-demand via the "Reflect"
          link inside the closing section. */}
      <ClosingRitualDialog
        open={closingOpen}
        onClose={() => setClosingOpen(false)}
        sessionId={session.id}
        clientName={clientName ?? "this person"}
        initial={{
          landed: session.closingLanded ?? "",
          remember: session.closingRemember ?? "",
          neverForget: session.closingNeverForget ?? "",
        }}
      />
    </div>
  );
}

// Read-only display + edit affordance for the saved Closing on completed
// sessions. Three flavors:
//   1. no closingCompletedAt → "Reflect on this session" invite (no content yet)
//   2. completed, all three fields empty → quiet "(skipped)" with re-open link
//   3. content present → render each filled field in serif italic, plum-tinted
function ClosingSection({
  session,
  onOpen,
}: {
  session: Session;
  onOpen: () => void;
}) {
  const closed = !!session.closingCompletedAt;
  const landed = session.closingLanded?.trim() ?? "";
  const remember = session.closingRemember?.trim() ?? "";
  const neverForget = session.closingNeverForget?.trim() ?? "";
  const hasContent = landed || remember || neverForget;

  // Case 1 — never closed, never reflected
  if (!closed) {
    return (
      <div className="border-t border-ink-100 pt-3">
        <button
          type="button"
          onClick={onOpen}
          className="text-xs serif-italic text-plum-700 hover:underline"
          style={{ fontWeight: 400 }}
        >
          Reflect on this session →
        </button>
      </div>
    );
  }

  // Case 2 — closed via Skip
  if (!hasContent) {
    return (
      <div className="border-t border-ink-100 pt-3 flex items-center gap-3 text-xs text-ink-400">
        <span className="italic">Closing skipped.</span>
        <button
          type="button"
          onClick={onOpen}
          className="text-plum-700 hover:underline"
        >
          Reflect now →
        </button>
      </div>
    );
  }

  // Case 3 — saved reflections to render
  return (
    <div className="border-t border-ink-100 pt-4">
      <div className="flex items-baseline justify-between mb-2">
        <div
          className="serif-italic text-sm text-plum-700"
          style={{ fontWeight: 400 }}
        >
          The Closing
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="text-[11px] text-ink-500 hover:text-plum-700 hover:underline"
        >
          Edit
        </button>
      </div>
      <div className="space-y-3">
        {landed && (
          <ClosingLine label="What landed" body={landed} />
        )}
        {remember && (
          <ClosingLine label="What to remember" body={remember} />
        )}
        {neverForget && (
          <ClosingLine label="Never want to forget" body={neverForget} />
        )}
      </div>
    </div>
  );
}

function ClosingLine({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">
        {label}
      </div>
      <div className="text-sm text-ink-700 italic leading-relaxed mt-0.5 whitespace-pre-wrap">
        {body}
      </div>
    </div>
  );
}
