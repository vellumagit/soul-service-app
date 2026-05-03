"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { generateNotesForSession } from "@/lib/actions";
import type { NoteTemplate } from "@/db/schema";

// "Generate notes from transcript" — pasted from Fathom/Otter/Tactiq/anywhere.
// Sends to Claude (server-side), gets back markdown structured to a template,
// fills the session's notes field. Works alongside the SessionCard's regular
// markdown editor.
export function GenerateNotesDialog({
  sessionId,
  noteTemplates,
  hasExistingNotes,
  autoClose = false,
}: {
  sessionId: string;
  noteTemplates: NoteTemplate[];
  hasExistingNotes: boolean;
  /** When true, dialog closes ~1.2s after a successful generation instead of
   *  showing the "Done — review in the session card" confirmation step.
   *  Driven by the practitioner_settings.autoUploadAiNotes toggle. */
  autoClose?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [templateId, setTemplateId] = useState<string>(
    noteTemplates[0]?.id ?? ""
  );
  const [replaceExisting, setReplaceExisting] = useState(false);

  function reset() {
    setTranscript("");
    setTemplateId(noteTemplates[0]?.id ?? "");
    setReplaceExisting(false);
    setError(null);
    setSuccess(null);
    setSubmitting(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-flame-700 hover:underline font-medium inline-flex items-center gap-1"
      >
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        AI: structure from transcript
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          // Defer reset so the close animation isn't jarring
          setTimeout(reset, 200);
        }}
        title="Generate notes from a transcript"
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-2 text-sm text-ink-700 hover:bg-ink-100 rounded-md"
              disabled={submitting}
            >
              {success ? "Close" : "Cancel"}
            </button>
            {!success && (
              <button
                type="submit"
                form="gen-notes-form"
                disabled={submitting || transcript.trim().length < 50}
                className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Generating…" : "Generate notes"}
              </button>
            )}
          </>
        }
      >
        {success ? (
          <div className="space-y-3">
            <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded p-3">
              <strong>Done.</strong> Notes have been written to the session.
              Review and edit them in the session card. {success}
            </div>
            <div className="text-xs text-ink-500">
              You can close this dialog now.
            </div>
          </div>
        ) : (
          <form
            id="gen-notes-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              setError(null);
              try {
                const fd = new FormData();
                fd.append("sessionId", sessionId);
                fd.append("transcript", transcript);
                if (templateId) fd.append("templateId", templateId);
                if (replaceExisting) fd.append("replaceExisting", "true");

                const result = await generateNotesForSession(fd);
                if (!result.ok) {
                  setError(result.error);
                } else {
                  const note =
                    result.cacheReadTokens > 0
                      ? `Cached system prompt was reused (${result.cacheReadTokens.toLocaleString()} tokens at ~10% cost).`
                      : `First call — system prompt was cached for the next call.`;
                  setSuccess(note);
                  // Auto-close mode: dismiss the dialog after a beat so the
                  // practitioner sees the success flash but doesn't have to
                  // click anything to get back to the session card.
                  if (autoClose) {
                    setTimeout(() => {
                      setOpen(false);
                      setTimeout(reset, 200);
                    }, 1200);
                  }
                }
              } finally {
                setSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <p className="text-xs text-ink-500 leading-relaxed">
              Paste the full transcript from Fathom, Otter, Tactiq, Google
              Meet&apos;s built-in transcription — anywhere. The AI will write
              session notes in your voice using the template you pick.
            </p>

            {error && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
                {error}
              </div>
            )}

            <Field
              label="Template to follow"
              hint="The AI will use these headings and structure"
            >
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className={inputCls}
              >
                <option value="">— default structure —</option>
                {noteTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Transcript"
              required
              hint={`${transcript.length.toLocaleString()} characters · roughly ${Math.round(transcript.length / 4).toLocaleString()} tokens · paste at least a few minutes of conversation`}
            >
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={14}
                placeholder="Speaker 1 (00:00:03): So how have you been since we last spoke?
Speaker 2 (00:00:07): Honestly, the week was hard. There were moments where..."
                className={`${inputCls} font-mono text-xs resize-y`}
              />
            </Field>

            {hasExistingNotes && (
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-flame-600"
                />
                <span className="flex-1 text-ink-700">
                  Replace existing notes
                  <span className="block text-xs text-ink-500 mt-0.5">
                    Off by default — new AI notes are appended below your
                    existing ones, separated by a divider.
                  </span>
                </span>
              </label>
            )}

            <div className="text-[11px] text-ink-400 leading-relaxed border-t border-ink-100 pt-3">
              Cost is roughly $0.01–$0.05 per session depending on transcript
              length. The system prompt is cached after the first call so
              subsequent calls are cheaper.
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
