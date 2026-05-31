"use client";

// Client-side controller for /network/forms.
//
// Lists every lead-capture form (active + archived), offers create / edit /
// rotate-token / archive actions, and surfaces the cleartext token to the
// user EXACTLY ONCE — at the moment of create or rotate. After that, only
// the prefix is visible from the DB, and she has to rotate to get a fresh
// token. Standard API-key UX.

import { useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import {
  createLeadForm,
  rotateLeadFormToken,
  archiveLeadForm,
  updateLeadForm,
} from "@/lib/actions";
import type { LeadFormRow } from "@/db/queries";
import { notify } from "./FlashNotifier";

export function LeadFormsManager({
  forms,
  intakeUrl,
}: {
  forms: LeadFormRow[];
  intakeUrl: string;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LeadFormRow | null>(null);
  // The cleartext token surfaced after create / rotate. Cleared when the
  // user dismisses or navigates.
  const [revealed, setRevealed] = useState<{
    formName: string;
    token: string;
  } | null>(null);

  const active = forms.filter((f) => !f.archivedAt);
  const archived = forms.filter((f) => f.archivedAt);

  return (
    <>
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="bg-ink-900 hover:bg-ink-800 text-white text-sm font-medium px-3 py-2 rounded-md inline-flex items-center gap-1.5"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          New form
        </button>
      </div>

      {active.length === 0 && archived.length === 0 ? (
        <div className="paper-card p-10 text-center max-w-xl">
          <h2
            className="serif-italic text-xl text-plum-700 mb-2"
            style={{ fontWeight: 400 }}
          >
            No forms yet.
          </h2>
          <p className="text-sm text-ink-600 leading-relaxed">
            Create one for each lead magnet, embed widget, or external form
            you want to pipe leads from. Each gets its own bearer token so you
            can revoke them independently.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {active.map((f) => (
            <FormRow
              key={f.id}
              form={f}
              intakeUrl={intakeUrl}
              onRotate={async () => {
                const r = await rotateLeadFormToken(f.id);
                if (!r.ok) {
                  notify({
                    kind: "warning",
                    title: "Rotate failed",
                    body: r.error,
                  });
                  return;
                }
                setRevealed({ formName: f.name, token: r.token });
              }}
              onArchive={async () => {
                const r = await archiveLeadForm(f.id, true);
                if (!r.ok) {
                  notify({
                    kind: "warning",
                    title: "Archive failed",
                    body: r.error,
                  });
                  return;
                }
                notify({
                  kind: "success",
                  title: "Form archived",
                  body: "It's no longer accepting submissions.",
                  ttlMs: 3000,
                });
              }}
              onEdit={() => setEditing(f)}
            />
          ))}
          {archived.length > 0 && (
            <li>
              <details className="paper-card p-3">
                <summary className="text-xs text-ink-500 cursor-pointer hover:text-ink-900">
                  Archived ({archived.length})
                </summary>
                <ul className="space-y-2 mt-3">
                  {archived.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between text-sm text-ink-500"
                    >
                      <span>
                        {f.name}{" "}
                        <span className="text-[11px] text-ink-400">
                          · {f.submissionCount} submissions
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await archiveLeadForm(f.id, false);
                          if (!r.ok) {
                            notify({
                              kind: "warning",
                              title: "Restore failed",
                              body: r.error,
                            });
                          } else {
                            notify({
                              kind: "success",
                              title: "Restored",
                              ttlMs: 2500,
                            });
                          }
                        }}
                        className="text-[11px] text-plum-700 hover:underline"
                      >
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          )}
        </ul>
      )}

      {/* Create form dialog */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create a lead capture form"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-3 py-2 text-sm text-ink-700 hover:bg-ink-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="new-lead-form"
              className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium"
            >
              Create form
            </button>
          </>
        }
      >
        <form
          id="new-lead-form"
          action={async (fd) => {
            const r = await createLeadForm(fd);
            if (!r.ok) {
              notify({
                kind: "warning",
                title: "Couldn't create",
                body: r.error,
              });
              return;
            }
            setCreating(false);
            // Use the form name from the FormData since we don't get it back
            const formName =
              (fd.get("name") as string) ?? "Lead form";
            setRevealed({ formName, token: r.token });
          }}
          className="space-y-4"
        >
          <Field label="Form name" required>
            <input
              name="name"
              required
              autoFocus
              className={inputCls}
              placeholder="Grief PDF download"
            />
          </Field>
          <Field
            label="Default source / intent"
            hint="What does a submission to this form mean? Filled into the lead's 'From' line on accept."
          >
            <input
              name="defaultIntent"
              className={inputCls}
              placeholder="downloaded the grief PDF"
            />
          </Field>
          <Field
            label="Outbound webhook URL"
            hint="Optional. Fires on every submission — typically a Make.com scenario for downstream nurture (thank-you email, mailing list sync, etc.). Soul Service won't send the email itself."
          >
            <input
              name="webhookUrl"
              type="url"
              className={inputCls}
              placeholder="https://hook.us2.make.com/..."
            />
          </Field>
          <label className="flex items-start gap-2 text-xs text-ink-700">
            <input
              type="checkbox"
              name="autoAccept"
              className="mt-0.5"
            />
            <span>
              <strong>Auto-accept submissions</strong> — skip the inbox and
              create a Network entry immediately. Use only for sources you
              trust (your own marketing site, not random embed widgets).
            </span>
          </label>
        </form>
      </Modal>

      {/* Edit form dialog */}
      {editing && (
        <Modal
          open={!!editing}
          onClose={() => setEditing(null)}
          title={`Edit form — ${editing.name}`}
          size="md"
          footer={
            <>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-3 py-2 text-sm text-ink-700 hover:bg-ink-100 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="edit-lead-form"
                className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium"
              >
                Save
              </button>
            </>
          }
        >
          <form
            id="edit-lead-form"
            action={async (fd) => {
              const r = await updateLeadForm(editing.id, {
                name: (fd.get("name") as string) ?? editing.name,
                defaultIntent:
                  (fd.get("defaultIntent") as string) || null,
                webhookUrl: (fd.get("webhookUrl") as string) || null,
                autoAccept: fd.get("autoAccept") === "on",
              });
              if (!r.ok) {
                notify({
                  kind: "warning",
                  title: "Save failed",
                  body: r.error,
                });
                return;
              }
              setEditing(null);
              notify({ kind: "success", title: "Saved", ttlMs: 2000 });
            }}
            className="space-y-4"
          >
            <Field label="Form name" required>
              <input
                name="name"
                required
                defaultValue={editing.name}
                className={inputCls}
              />
            </Field>
            <Field label="Default source / intent">
              <input
                name="defaultIntent"
                defaultValue={editing.defaultIntent ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Outbound webhook URL">
              <input
                name="webhookUrl"
                type="url"
                defaultValue={editing.webhookUrl ?? ""}
                className={inputCls}
                placeholder="https://hook.us2.make.com/..."
              />
            </Field>
            <label className="flex items-start gap-2 text-xs text-ink-700">
              <input
                type="checkbox"
                name="autoAccept"
                defaultChecked={editing.autoAccept}
                className="mt-0.5"
              />
              <span>Auto-accept submissions (skip the inbox)</span>
            </label>
          </form>
        </Modal>
      )}

      {/* Token reveal — surfaces the cleartext token EXACTLY ONCE. */}
      {revealed && (
        <Modal
          open={true}
          onClose={() => setRevealed(null)}
          title="Save this token now"
          size="md"
          footer={
            <button
              type="button"
              onClick={() => setRevealed(null)}
              className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium"
            >
              I&apos;ve saved it
            </button>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-ink-700 leading-relaxed">
              This is the bearer token for <strong>{revealed.formName}</strong>.
              Copy it now — once you close this dialog it won&apos;t be shown
              again. (You can always rotate to get a fresh one if you lose it,
              but the old one stops working.)
            </p>
            <div className="bg-ink-900 text-ink-50 rounded-md p-3 font-mono text-xs break-all">
              {revealed.token}
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(revealed.token);
                notify({
                  kind: "success",
                  title: "Copied",
                  ttlMs: 1500,
                });
              }}
              className="text-xs text-plum-700 hover:underline"
            >
              Copy to clipboard
            </button>
            <div className="text-[11px] text-ink-500 leading-relaxed pt-2 border-t border-ink-100">
              Use it in the{" "}
              <code className="bg-ink-100 px-1 rounded">Authorization</code>{" "}
              header on requests to{" "}
              <code className="bg-ink-100 px-1 rounded">{intakeUrl}</code>:
              <br />
              <code className="bg-ink-100 px-1 rounded text-ink-900">
                Authorization: Bearer {revealed.token.slice(0, 11)}…
              </code>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function FormRow({
  form,
  intakeUrl,
  onRotate,
  onArchive,
  onEdit,
}: {
  form: LeadFormRow;
  intakeUrl: string;
  onRotate: () => Promise<void>;
  onArchive: () => Promise<void>;
  onEdit: () => void;
}) {
  return (
    <li className="paper-card p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-ink-900">{form.name}</span>
            {form.autoAccept && (
              <span className="chip bg-sage-50 text-sage-700">
                auto-accept
              </span>
            )}
            {form.pendingCount > 0 && (
              <span className="chip bg-honey-50 text-honey-700">
                {form.pendingCount} pending
              </span>
            )}
          </div>
          <div className="text-xs text-ink-500 mt-1">
            {form.submissionCount} submission
            {form.submissionCount === 1 ? "" : "s"}
            {form.lastSubmissionAt && (
              <>
                {" · "}
                last on{" "}
                <span className="font-mono">
                  {new Date(form.lastSubmissionAt)
                    .toISOString()
                    .slice(0, 10)}
                </span>
              </>
            )}
          </div>
          {form.defaultIntent && (
            <div className="text-[12px] text-ink-600 italic mt-1">
              Source: <span className="not-italic">{form.defaultIntent}</span>
            </div>
          )}
          {form.webhookUrl && (
            <div className="text-[11px] text-ink-500 mt-1 truncate">
              Webhook →{" "}
              <span className="font-mono text-ink-700 truncate">
                {form.webhookUrl}
              </span>
            </div>
          )}
          <div className="text-[11px] text-ink-500 mt-2 font-mono">
            Token prefix:{" "}
            <span className="text-ink-700">{form.tokenPrefix}…</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="text-xs text-ink-500 hover:text-ink-900"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onRotate}
            className="text-xs text-plum-700 hover:underline"
            title="Generate a new token. The old one stops working immediately."
          >
            Rotate token
          </button>
          <button
            type="button"
            onClick={onArchive}
            className="text-xs text-ink-500 hover:text-amber-700"
          >
            Archive
          </button>
        </div>
      </div>
    </li>
  );
}
