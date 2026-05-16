"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { ConfirmButton } from "./ConfirmButton";
import { updateClient, deleteClient } from "@/lib/actions";
import type { Client } from "@/db/schema";
import { LOCALE_LABELS, LOCALES } from "@/lib/i18n";
import { rethrowIfRedirect } from "@/lib/redirect-error";

export function EditClientDialog({ client }: { client: Client }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
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
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
        Edit profile
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit client profile"
        size="lg"
        footer={
          <>
            <ConfirmButton
              label={
                <span className="text-sm text-red-700 hover:underline">
                  Delete client
                </span>
              }
              message={`Permanently delete ${client.fullName}? This removes all their sessions, files, and history. This cannot be undone.`}
              confirmLabel="Yes, delete forever"
              onConfirm={() => deleteClient(client.id)}
            />
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-2 text-sm text-ink-700 hover:bg-ink-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-client-form"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <form
          id="edit-client-form"
          action={async (fd) => {
            setSubmitting(true);
            setError(null);
            try {
              await updateClient(fd);
              setOpen(false);
            } catch (err) {
              rethrowIfRedirect(err);
              setError(err instanceof Error ? err.message : "Something went wrong");
            } finally {
              setSubmitting(false);
            }
          }}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={client.id} />

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name" required>
              <input
                name="fullName"
                required
                defaultValue={client.fullName}
                className={inputCls}
              />
            </Field>
            <Field label="Pronouns">
              <input
                name="pronouns"
                defaultValue={client.pronouns ?? ""}
                className={inputCls}
                placeholder="she/her"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <input
                name="email"
                type="email"
                defaultValue={client.email ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Phone">
              <input
                name="phone"
                defaultValue={client.phone ?? ""}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <input
                name="city"
                defaultValue={client.city ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Timezone">
              <input
                name="timezone"
                defaultValue={client.timezone ?? ""}
                className={inputCls}
                placeholder="America/New_York"
              />
            </Field>
          </div>

          <Field label="What they're working on" hint="One line, shows in the client list">
            <input
              name="workingOn"
              defaultValue={client.workingOn ?? ""}
              className={inputCls}
            />
          </Field>

          <Field label="About this client" hint="Anything you want to remember about them">
            <textarea
              name="aboutClient"
              rows={4}
              defaultValue={client.aboutClient ?? ""}
              className={inputCls}
            />
          </Field>

          <Field label="Intake notes" hint="Whatever they shared on the way in — health, history, what brought them">
            <textarea
              name="intakeNotes"
              rows={4}
              defaultValue={client.intakeNotes ?? ""}
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Primary session type">
              <input
                name="primarySessionType"
                defaultValue={client.primarySessionType ?? ""}
                className={inputCls}
                placeholder="What you usually do with this person"
              />
            </Field>
            <Field label="How they found me">
              <input
                name="howTheyFoundMe"
                defaultValue={client.howTheyFoundMe ?? ""}
                className={inputCls}
              />
            </Field>
          </div>

          <Field
            label="Preferred language"
            hint="Used when emailing — templates filter to this language. Blank = follow app language."
          >
            <select
              name="preferredLanguage"
              defaultValue={client.preferredLanguage ?? ""}
              className={`${inputCls} md:w-64`}
            >
              <option value="">Follow app language</option>
              {LOCALES.map((code) => (
                <option key={code} value={code}>
                  {LOCALE_LABELS[code]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tags" hint="Comma-separated. Use whatever vocabulary helps you find them later.">
            <input
              name="tags"
              defaultValue={(client.tags ?? []).join(", ")}
              className={inputCls}
              placeholder="e.g. weekly, longterm, friend-of-friend"
            />
          </Field>

          <Field
            label="Sensitivity flags"
            hint="Topics to handle gently. Comma-separated. Shown softly at the top of the file as a reminder to you."
          >
            <input
              name="sensitivities"
              defaultValue={(client.sensitivities ?? []).join(", ")}
              className={inputCls}
              placeholder="e.g. recent loss, sensitive about money"
            />
          </Field>

          <Field
            label="Just for you (private notes)"
            hint="Anything you'd want to remember but never share with the client. Never exported."
          >
            <textarea
              name="privateNotes"
              rows={4}
              defaultValue={client.privateNotes ?? ""}
              className={inputCls}
              placeholder="Hunches, observations, anything you're sitting with quietly"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Emergency contact">
              <input
                name="emergencyName"
                defaultValue={client.emergencyName ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Emergency phone">
              <input
                name="emergencyPhone"
                defaultValue={client.emergencyPhone ?? ""}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Status">
            <select
              name="status"
              defaultValue={client.status}
              className={inputCls}
            >
              <option value="active">Active</option>
              <option value="new">New</option>
              <option value="dormant">Dormant</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        </form>
      </Modal>
    </>
  );
}
