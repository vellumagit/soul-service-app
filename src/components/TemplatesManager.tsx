"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { ConfirmButton } from "./ConfirmButton";
import {
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  createNoteTemplate,
  updateNoteTemplate,
  deleteNoteTemplate,
} from "@/lib/actions";
import { LOCALE_LABELS, LOCALE_SHORT, LOCALES, asLocale } from "@/lib/i18n";

type Tpl = {
  id: string;
  name: string;
  subject?: string;
  body: string;
  /** Only set on email templates — note templates ignore this. */
  language?: string;
};

export function TemplatesManager({
  kind,
  templates,
}: {
  kind: "email" | "note";
  templates: Tpl[];
}) {
  const [editing, setEditing] = useState<Tpl | null>(null);
  const [creating, setCreating] = useState(false);

  const title = kind === "email" ? "Email templates" : "Note templates";
  const subtitle =
    kind === "email"
      ? "Reusable messages. Variables like {{firstName}} get filled in when you compose."
      : "Pre-built note structures you can insert into any session.";

  return (
    <section className="border border-ink-200 rounded-md bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
          <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="text-xs text-flame-700 hover:underline font-medium"
        >
          + New
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="text-sm text-ink-400 italic">No templates yet.</div>
      ) : (
        <ul className="divide-y divide-ink-100">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 py-2 group"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink-900 truncate flex items-center gap-2">
                  <span className="truncate">{t.name}</span>
                  {kind === "email" && t.language && (
                    <span className="chip bg-ink-100 text-ink-600 shrink-0">
                      {LOCALE_SHORT[asLocale(t.language)]}
                    </span>
                  )}
                </div>
                {kind === "email" && t.subject && (
                  <div className="text-xs text-ink-500 truncate">
                    {t.subject}
                  </div>
                )}
                {kind === "note" && (
                  <div className="text-xs text-ink-500 truncate">
                    {t.body.split("\n")[0]?.slice(0, 80)}
                  </div>
                )}
              </div>
              <button
                onClick={() => setEditing(t)}
                className="text-xs text-ink-500 hover:text-ink-900 opacity-0 group-hover:opacity-100"
              >
                edit
              </button>
              <ConfirmButton
                label={
                  <span className="text-xs text-ink-400 hover:text-red-700 opacity-0 group-hover:opacity-100">
                    delete
                  </span>
                }
                message={`Delete the template "${t.name}"?`}
                confirmLabel="Yes, delete"
                onConfirm={() =>
                  kind === "email"
                    ? deleteEmailTemplate(t.id)
                    : deleteNoteTemplate(t.id)
                }
              />
            </li>
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <TemplateForm
          kind={kind}
          template={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function TemplateForm({
  kind,
  template,
  onClose,
}: {
  kind: "email" | "note";
  template: Tpl | null;
  onClose: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = !template;
  const action =
    kind === "email"
      ? isNew
        ? createEmailTemplate
        : updateEmailTemplate
      : isNew
      ? createNoteTemplate
      : updateNoteTemplate;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={isNew ? `New ${kind} template` : `Edit ${kind} template`}
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm text-ink-700 hover:bg-ink-100 rounded-md"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="template-form"
            disabled={submitting}
            className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <form
        id="template-form"
        action={async (fd) => {
          setSubmitting(true);
          setError(null);
          try {
            await action(fd);
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed");
          } finally {
            setSubmitting(false);
          }
        }}
        className="space-y-3"
      >
        {!isNew && (
          <input type="hidden" name="id" value={template?.id ?? ""} />
        )}
        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
            {error}
          </div>
        )}
        <Field label="Name" required>
          <input
            name="name"
            required
            defaultValue={template?.name ?? ""}
            className={inputCls}
          />
        </Field>
        {kind === "email" && (
          <>
            <Field label="Language" hint="Which language this template is written in. EmailComposer uses this to pick the right template per client.">
              <select
                name="language"
                defaultValue={template?.language ?? "en"}
                className={`${inputCls} md:w-64`}
              >
                {LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {LOCALE_LABELS[code]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subject" required>
              <input
                name="subject"
                required
                defaultValue={template?.subject ?? ""}
                className={inputCls}
              />
            </Field>
          </>
        )}
        <Field label="Body" required>
          <textarea
            name="body"
            rows={kind === "email" ? 12 : 10}
            required
            defaultValue={template?.body ?? ""}
            className={inputCls}
          />
        </Field>
        {kind === "email" && (
          <div className="text-[11px] text-ink-500 leading-relaxed">
            Variables: {`{{firstName}}`} {`{{fullName}}`} {`{{email}}`}{" "}
            {`{{nextSessionWhen}}`} {`{{nextSessionDuration}}`}{" "}
            {`{{lastSessionDate}}`} {`{{amount}}`}{" "}
            {`{{paymentInstructions}}`} {`{{meetUrl}}`}
          </div>
        )}
      </form>
    </Modal>
  );
}
