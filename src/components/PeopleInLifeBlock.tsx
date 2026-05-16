"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { ConfirmButton } from "./ConfirmButton";
import {
  addImportantPerson,
  updateImportantPerson,
  deleteImportantPerson,
} from "@/lib/actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import type { ImportantPerson } from "@/db/schema";

const COMMON_RELATIONSHIPS = [
  "partner",
  "ex",
  "mom",
  "dad",
  "sister",
  "brother",
  "child",
  "friend",
  "boss",
  "coworker",
  "therapist",
  "pet",
  "in-law",
];

export function PeopleInLifeBlock({
  clientId,
  people,
}: {
  clientId: string;
  people: ImportantPerson[];
}) {
  const [editing, setEditing] = useState<ImportantPerson | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div>
      {people.length === 0 && !adding && (
        <div className="text-xs text-ink-400 italic">
          Nobody added yet. The people who matter in their life —
          partner, parents, kids, friends — give you the bigger picture
          when they walk in.
        </div>
      )}

      {people.length > 0 && (
        <ul className="space-y-2.5">
          {people.map((p) => (
            <li key={p.id} className="group flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <span className="font-medium text-ink-900">{p.name}</span>
                  <span className="text-ink-500 ml-2">{p.relationship}</span>
                  {!p.isAlive && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-400">
                      passed
                    </span>
                  )}
                </div>
                {p.notes && (
                  <div className="text-xs text-ink-600 mt-0.5 leading-relaxed whitespace-pre-wrap">
                    {p.notes}
                  </div>
                )}
              </div>
              <button
                onClick={() => setEditing(p)}
                className="text-[10px] text-ink-500 hover:text-ink-900 opacity-0 group-hover:opacity-100"
              >
                edit
              </button>
              <ConfirmButton
                label={
                  <span className="text-[10px] text-ink-400 hover:text-red-700 opacity-0 group-hover:opacity-100">
                    remove
                  </span>
                }
                message={`Remove ${p.name} from this client's important people?`}
                confirmLabel="Yes, remove"
                onConfirm={() => deleteImportantPerson(p.id, clientId)}
              />
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => setAdding(true)}
        className="mt-3 text-xs text-flame-700 hover:underline font-medium"
      >
        + Add someone
      </button>

      {(adding || editing) && (
        <PersonForm
          clientId={clientId}
          person={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function PersonForm({
  clientId,
  person,
  onClose,
}: {
  clientId: string;
  person: ImportantPerson | null;
  onClose: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = !person;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={isNew ? "Add someone in their life" : `Edit ${person?.name}`}
      size="md"
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
            form="person-form"
            disabled={submitting}
            className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <form
        id="person-form"
        action={async (fd) => {
          setSubmitting(true);
          setError(null);
          try {
            if (isNew) {
              await addImportantPerson(fd);
            } else {
              await updateImportantPerson(fd);
            }
            onClose();
          } catch (e) {
            rethrowIfRedirect(e);
            setError(e instanceof Error ? e.message : "Failed");
          } finally {
            setSubmitting(false);
          }
        }}
        className="space-y-4"
      >
        <input type="hidden" name="clientId" value={clientId} />
        {!isNew && <input type="hidden" name="id" value={person?.id ?? ""} />}

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" required>
            <input
              name="name"
              required
              autoFocus
              defaultValue={person?.name ?? ""}
              className={inputCls}
              placeholder="Anna"
            />
          </Field>
          <Field
            label="Relationship"
            required
            hint="Free-form — partner / mom / ex / pet"
          >
            <input
              name="relationship"
              required
              list="rel-options"
              defaultValue={person?.relationship ?? ""}
              className={inputCls}
              placeholder="partner"
            />
            <datalist id="rel-options">
              {COMMON_RELATIONSHIPS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </Field>
        </div>

        <Field
          label="Notes"
          hint="The dynamic, current temperature, what they mean — anything that helps you remember"
        >
          <textarea
            name="notes"
            rows={4}
            defaultValue={person?.notes ?? ""}
            className={inputCls}
            placeholder="Patient. Distant since the move. They were close as kids."
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="deceased"
            defaultChecked={person ? !person.isAlive : false}
            className="w-4 h-4 accent-flame-600"
          />
          <span className="text-ink-700">This person has passed</span>
        </label>
      </form>
    </Modal>
  );
}

