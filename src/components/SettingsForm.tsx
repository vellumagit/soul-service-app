"use client";

import { useState } from "react";
import { Field, inputCls } from "./Form";
import { updateSettings } from "@/lib/actions";
import type { PractitionerSettings } from "@/db/schema";

export function SettingsForm({ settings }: { settings: PractitionerSettings }) {
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={async (fd) => {
        setSubmitting(true);
        setError(null);
        try {
          await updateSettings(fd);
          setSaved(true);
          setTimeout(() => setSaved(false), 2500);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed");
        } finally {
          setSubmitting(false);
        }
      }}
      className="space-y-6"
    >
      {/* Business info */}
      <Section title="Your business" subtitle="What appears on invoices and emails.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Your name">
            <input
              name="practitionerName"
              defaultValue={settings.practitionerName ?? ""}
              className={inputCls}
              placeholder="Maya"
            />
          </Field>
          <Field label="Business name (optional)">
            <input
              name="businessName"
              defaultValue={settings.businessName ?? ""}
              className={inputCls}
              placeholder="Soul Service"
            />
          </Field>
          <Field label="Business email">
            <input
              name="businessEmail"
              type="email"
              defaultValue={settings.businessEmail ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Phone">
            <input
              name="businessPhone"
              defaultValue={settings.businessPhone ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Address" className="md:col-span-2">
            <input
              name="businessAddress"
              defaultValue={settings.businessAddress ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Website" className="md:col-span-2">
            <input
              name="websiteUrl"
              type="url"
              defaultValue={settings.websiteUrl ?? ""}
              className={inputCls}
              placeholder="https://example.com"
            />
          </Field>
        </div>
      </Section>

      {/* Invoicing */}
      <Section
        title="Invoicing"
        subtitle="Default rate, payment instructions, and how invoices are numbered."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Default rate ($)" hint="Used when no amount is set on a session">
            <input
              name="defaultRate"
              type="number"
              step="1"
              min="0"
              defaultValue={(settings.defaultRateCents / 100).toFixed(0)}
              className={inputCls}
            />
          </Field>
          <Field label="Currency">
            <input
              name="defaultCurrency"
              defaultValue={settings.defaultCurrency}
              className={inputCls}
            />
          </Field>
          <Field label="Invoice prefix" hint='e.g. "INV" → INV-1042'>
            <input
              name="invoicePrefix"
              defaultValue={settings.invoicePrefix}
              className={inputCls}
            />
          </Field>
          <Field
            label="Payment instructions"
            hint="Printed on every invoice"
            className="md:col-span-3"
          >
            <textarea
              name="paymentInstructions"
              rows={2}
              defaultValue={settings.paymentInstructions ?? ""}
              className={inputCls}
              placeholder="Venmo @maya · Zelle to 555-1234"
            />
          </Field>
          <Field
            label="Invoice footer"
            hint="A line at the bottom of every invoice"
            className="md:col-span-3"
          >
            <input
              name="invoiceFooter"
              defaultValue={settings.invoiceFooter ?? ""}
              className={inputCls}
              placeholder="Thank you, with love. — Maya"
            />
          </Field>
        </div>
      </Section>

      {/* Automations */}
      <Section
        title="Automations"
        subtitle="Things the system will do for you in the background."
      >
        <div className="space-y-4">
          <Toggle
            name="autoInvoiceOnComplete"
            defaultChecked={settings.autoInvoiceOnComplete}
            label="Auto-generate an invoice when I mark a session complete"
            description="Saves a PDF on the session, ready to email or download. Off = generate manually."
          />

          <div>
            <Field
              label="Auto-create a follow-up task after each completed session"
              hint="Set to empty to disable"
            >
              <div className="flex items-center gap-2">
                <input
                  name="autoFollowupTaskDays"
                  type="number"
                  min={0}
                  max={30}
                  defaultValue={
                    settings.autoFollowupTaskDays === null
                      ? ""
                      : settings.autoFollowupTaskDays
                  }
                  className={`${inputCls} w-24`}
                  placeholder="2"
                />
                <span className="text-sm text-ink-500">days after, called</span>
                <input
                  name="autoFollowupTaskTitle"
                  defaultValue={settings.autoFollowupTaskTitle ?? ""}
                  className={`${inputCls} flex-1`}
                  placeholder="Send aftercare email"
                />
              </div>
            </Field>
          </div>

          <div>
            <Field
              label="Birthday reminder"
              hint="Create a task this many days before a client's birthday. Empty = off."
            >
              <div className="flex items-center gap-2">
                <input
                  name="birthdayReminderDays"
                  type="number"
                  min={0}
                  max={30}
                  defaultValue={
                    settings.birthdayReminderDays === null
                      ? ""
                      : settings.birthdayReminderDays
                  }
                  className={`${inputCls} w-24`}
                />
                <span className="text-sm text-ink-500">days ahead</span>
              </div>
            </Field>
          </div>
        </div>
      </Section>

      <div className="sticky bottom-0 bg-white border-t border-ink-100 -mx-4 md:-mx-6 px-4 md:px-6 py-3 flex items-center justify-end gap-3">
        {saved && (
          <span className="text-xs text-green-700">Saved.</span>
        )}
        {error && <span className="text-xs text-red-700">{error}</span>}
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-ink-200 rounded-md bg-white p-5">
      <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
      {subtitle && (
        <p className="text-xs text-ink-500 mt-0.5 mb-4">{subtitle}</p>
      )}
      {children}
    </section>
  );
}

function Toggle({
  name,
  defaultChecked,
  label,
  description,
}: {
  name: string;
  defaultChecked: boolean;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 w-4 h-4 accent-flame-600"
      />
      <div className="flex-1">
        <div className="text-sm text-ink-900">{label}</div>
        {description && (
          <div className="text-xs text-ink-500 mt-0.5">{description}</div>
        )}
      </div>
    </label>
  );
}
