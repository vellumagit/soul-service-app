"use client";

import { useState } from "react";
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

const STATUS_CHIP: Record<string, string> = {
  scheduled: "bg-flame-100 text-flame-700",
  completed: "bg-green-50 text-green-700",
  cancelled: "bg-ink-100 text-ink-500",
  no_show: "bg-amber-50 text-amber-700",
};

export function SessionCard({
  session,
  noteTemplates = [],
}: {
  session: Session;
  noteTemplates?: NoteTemplate[];
}) {
  const [open, setOpen] = useState(session.status === "scheduled");
  const [submitting, setSubmitting] = useState(false);

  const isScheduled = session.status === "scheduled";
  const isCompleted = session.status === "completed";

  return (
    <div
      id={session.id}
      className="border border-ink-200 rounded-md overflow-hidden bg-white"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
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
      </button>

      {open && (
        <div className="border-t border-ink-100 px-4 py-4 bg-ink-50/40 space-y-4">
          <form
            action={async (fd) => {
              setSubmitting(true);
              try {
                await updateSession(fd);
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <input type="hidden" name="id" value={session.id} />
            <input type="hidden" name="clientId" value={session.clientId} />

            <div className="grid grid-cols-2 gap-3">
              <Field label="Session type">
                <input
                  name="type"
                  defaultValue={session.type}
                  className={inputCls}
                />
              </Field>
              <Field label="Their intention">
                <input
                  name="intention"
                  defaultValue={session.intention ?? ""}
                  className={inputCls}
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
                />
              </div>
              <NotesEditor
                name="notes"
                defaultValue={session.notes ?? ""}
                templates={noteTemplates.map((t) => ({
                  id: t.id,
                  name: t.name,
                  body: t.body,
                }))}
                rows={8}
                placeholder="What came through. What guides showed up. Body shifts. Recommendations. — Or paste a transcript and click 'AI: structure from transcript' above."
              />
              <div className="text-[11px] text-ink-400 mt-1">
                Markdown supported. Use a note template, or generate from a meeting transcript.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
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
              <ConfirmButton
                destructive={false}
                label={
                  <span className="text-xs text-ink-500 hover:text-amber-700">
                    Cancel session
                  </span>
                }
                message="Cancel this scheduled session? You can keep it in their history or delete it later."
                confirmLabel="Yes, cancel it"
                onConfirm={() =>
                  cancelSession(session.id, session.clientId)
                }
              />
            )}
            {session.meetUrl && (
              <a
                href={session.meetUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-flame-700 hover:underline"
              >
                Meet link ↗
              </a>
            )}
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
    </div>
  );
}
