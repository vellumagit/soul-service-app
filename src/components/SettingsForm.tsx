"use client";

import { useState } from "react";
import { Field, inputCls } from "./Form";
import { updateSettings } from "@/lib/actions";
import type { PractitionerSettings } from "@/db/schema";
import {
  LOCALE_LABELS,
  LOCALES,
  asLocale,
  t,
  type Locale,
} from "@/lib/i18n";

export function SettingsForm({ settings }: { settings: PractitionerSettings }) {
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locale: Locale = asLocale(settings.uiLanguage);

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
      {/* Language — first so it's easy to find */}
      <Section
        title={t(locale, "settings.language.section")}
        subtitle={t(locale, "settings.language.uiLanguageHint")}
      >
        <Field label={t(locale, "settings.language.uiLanguageLabel")}>
          <select
            name="uiLanguage"
            defaultValue={locale}
            className={`${inputCls} md:w-64`}
          >
            {LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALE_LABELS[code]}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-[11px] text-ink-400 mt-2">
          Changing this updates the menus, buttons, and headings throughout
          the app. Page reloads after Save.
        </p>
      </Section>

      {/* Business info */}
      <Section title="Your business" subtitle="What appears on invoices and emails.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Your name">
            <input
              name="practitionerName"
              defaultValue={settings.practitionerName ?? ""}
              className={inputCls}
              placeholder="How you sign your emails"
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
              placeholder="e.g. Venmo @yourhandle · Zelle to you@example.com"
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
              placeholder="e.g. Thank you. — Your name"
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

          <Toggle
            name="autoUploadAiNotes"
            defaultChecked={settings.autoUploadAiNotes}
            label="Automatically upload AI notes from sessions"
            description="When you generate notes from a transcript, save them straight to the session instead of waiting for you to click Insert. You can still edit afterwards."
          />

          <div className="border-t border-ink-100 pt-4">
            <div className="text-sm font-medium text-ink-900 mb-1">
              Session reminders
            </div>
            <p className="text-xs text-ink-500 mb-3 leading-relaxed">
              Automatic emails sent before each scheduled session. Sent via Resend
              once the cron job is enabled on Vercel.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field
                label="Remind the client"
                hint="Hours before the session. 0 = off."
              >
                <div className="flex items-center gap-2">
                  <input
                    name="clientReminderHours"
                    type="number"
                    min={0}
                    max={168}
                    defaultValue={settings.clientReminderHours}
                    className={`${inputCls} w-24`}
                  />
                  <span className="text-sm text-ink-500">hours before</span>
                </div>
              </Field>
              <Field
                label="Remind me"
                hint="Hours before the session. 0 = off."
              >
                <div className="flex items-center gap-2">
                  <input
                    name="practitionerReminderHours"
                    type="number"
                    min={0}
                    max={168}
                    defaultValue={settings.practitionerReminderHours}
                    className={`${inputCls} w-24`}
                  />
                  <span className="text-sm text-ink-500">hours before</span>
                </div>
              </Field>
            </div>
            <p className="text-[11px] text-ink-400 mt-2 leading-relaxed">
              Reminders only go out for sessions that have an email on file
              (for the client) and only run once Vercel Cron is configured.
              Rescheduling a session resets its reminder so the new time gets a
              fresh email.
            </p>
          </div>

          <div className="rounded-md bg-flame-50 border border-flame-100 p-3">
            <div className="text-sm font-medium text-flame-700 mb-1">
              Follow-up cadence (locked in)
            </div>
            <p className="text-xs text-ink-700 leading-relaxed">
              When you add a client and set their first session date, three
              follow-up tasks are created automatically:
              <strong> 1 week</strong>, <strong>1 month</strong>, and{" "}
              <strong>3 months</strong> after that date. Past-dated follow-ups
              are skipped, so old clients you onboard won&apos;t flood your
              task list.
            </p>
          </div>
        </div>
      </Section>

      {/* Your data — export everything you've put into the app */}
      <Section
        title="Your data"
        subtitle="Everything you put into this app is yours. Download it any time."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <DataLink
            href="/api/export/clients"
            label="Clients"
            description="All clients with profile fields, tags, and notes."
          />
          <DataLink
            href="/api/export/sessions"
            label="Sessions"
            description="Every scheduled and past session with notes + payment info."
          />
          <DataLink
            href="/api/export/payments"
            label="Payments"
            description="Paid + unpaid sessions for tax / accounting."
          />
          <DataLink
            href="/api/export/backup"
            label="Full backup (JSON)"
            description="Everything in one structured file. Re-importable later."
            primary
          />
        </div>
        <p className="text-[11px] text-ink-400 mt-3 leading-relaxed">
          CSVs open cleanly in Excel, Google Sheets, Numbers, etc. The full
          backup is a JSON file containing every record across every table.
          Files (avatars, attachments, invoice PDFs) live on Vercel Blob and
          aren&apos;t included here — they&apos;re linked by URL in the JSON.
        </p>
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

// Download chip used in the "Your data" section. Anchor with `download`
// attribute triggers the browser's save-as flow on the response stream.
function DataLink({
  href,
  label,
  description,
  primary,
}: {
  href: string;
  label: string;
  description: string;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      download
      className={`block border rounded-md p-3 transition hover:border-ink-400 ${
        primary
          ? "border-flame-200 bg-flame-50 hover:bg-flame-100"
          : "border-ink-200 bg-white hover:bg-ink-50"
      }`}
    >
      <div className="flex items-center gap-2">
        <svg
          className={`w-4 h-4 ${primary ? "text-flame-700" : "text-ink-500"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        <span className="text-sm font-medium text-ink-900">{label}</span>
      </div>
      <p className="text-[11px] text-ink-500 mt-1 leading-relaxed">
        {description}
      </p>
    </a>
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
