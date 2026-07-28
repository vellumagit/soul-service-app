"use client";

// "Your details" on the portal home — read-only until the client taps Edit.
//
// Replaces a card that just listed the facts and said "let her know if any of
// this changes." Timezone is the one that actually matters: the whole portal
// renders in it and it was guessed from the browser on first visit, so this is
// the only place a client can correct a wrong guess themselves.

import { useState, useTransition } from "react";
import { updatePortalClientDetails } from "@/lib/portal-client-actions";
import { COMMON_TIME_ZONES } from "@/lib/timezone";

type Details = {
  fullName: string;
  pronouns: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  timezone: string | null;
};

export function PortalDetailsCard({
  details,
  practitionerName,
  zoneLabel,
}: {
  details: Details;
  practitionerName: string;
  /** e.g. "MDT" — what their times are currently rendered in. */
  zoneLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    fullName: details.fullName,
    pronouns: details.pronouns ?? "",
    email: details.email ?? "",
    phone: details.phone ?? "",
    city: details.city ?? "",
    timezone: details.timezone ?? "",
  });

  const firstName = practitionerName.split(" ")[0] ?? practitionerName;

  // The stored zone may not be one of the friendly presets (it's captured from
  // the browser, which can return anything IANA). Keep it in the list so
  // opening the form never silently changes it.
  const zoneOptions = details.timezone &&
    !COMMON_TIME_ZONES.some((z) => z.id === form.timezone) &&
    form.timezone
    ? [{ id: form.timezone, label: form.timezone }, ...COMMON_TIME_ZONES]
    : COMMON_TIME_ZONES;

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updatePortalClientDetails(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <section className="paper-card p-6">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2
            className="serif-italic text-base text-plum-700"
            style={{ fontWeight: 400 }}
          >
            Your details
          </h2>
          <button
            type="button"
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
            className="text-xs text-plum-700 hover:underline font-medium"
          >
            Edit
          </button>
        </div>
        <div className="space-y-1.5 text-sm">
          <Row label="name">
            {details.fullName}
            {details.pronouns && (
              <span className="text-ink-500"> ({details.pronouns})</span>
            )}
          </Row>
          {details.email && <Row label="email">{details.email}</Row>}
          {details.phone && <Row label="phone">{details.phone}</Row>}
          {details.city && <Row label="city">{details.city}</Row>}
          <Row label="times shown in">
            {details.timezone ?? "your device's timezone"}
            {zoneLabel && (
              <span className="text-ink-500"> · {zoneLabel}</span>
            )}
          </Row>
        </div>
        {saved ? (
          <p className="text-[11px] text-honey-700 italic mt-3 leading-snug">
            Saved. {firstName} sees the update on her side too.
          </p>
        ) : (
          <p className="text-[11px] text-ink-500 italic mt-3 leading-snug">
            Keep this current so your times and emails reach you properly.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="paper-card p-6">
      <h2
        className="serif-italic text-base text-plum-700 mb-4"
        style={{ fontWeight: 400 }}
      >
        Your details
      </h2>
      <div className="space-y-3">
        <Field
          label="Name"
          value={form.fullName}
          onChange={(v) => setForm({ ...form, fullName: v })}
          maxLength={200}
        />
        <Field
          label="Pronouns (optional)"
          value={form.pronouns}
          onChange={(v) => setForm({ ...form, pronouns: v })}
          maxLength={32}
          placeholder="she/her, they/them…"
        />
        <Field
          label="Email"
          value={form.email}
          onChange={(v) => setForm({ ...form, email: v })}
          maxLength={200}
          type="email"
          hint="Your sign-in links and reminders go here — double-check it."
        />
        <Field
          label="Phone (optional)"
          value={form.phone}
          onChange={(v) => setForm({ ...form, phone: v })}
          maxLength={32}
          type="tel"
        />
        <Field
          label="City (optional)"
          value={form.city}
          onChange={(v) => setForm({ ...form, city: v })}
          maxLength={120}
        />
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
            Timezone
          </span>
          <select
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100"
          >
            <option value="">Use my device&apos;s timezone</option>
            {zoneOptions.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
          <span className="block text-[11px] text-ink-500 italic mt-1 leading-snug">
            Every time in your space is shown in this zone.
          </span>
        </label>
      </div>

      {error && (
        <p className="text-[11px] text-honey-700 italic mt-3">{error}</p>
      )}

      <div className="flex items-center gap-2 mt-5">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 disabled:opacity-60 text-white rounded-md font-medium transition-colors"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(null);
            // Drop unsaved edits so reopening shows the truth, not a draft.
            setForm({
              fullName: details.fullName,
              pronouns: details.pronouns ?? "",
              email: details.email ?? "",
              phone: details.phone ?? "",
              city: details.city ?? "",
              timezone: details.timezone ?? "",
            });
          }}
          disabled={pending}
          className="px-4 py-2 text-sm text-ink-600 hover:text-ink-900 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-ink-500 text-[11px] uppercase tracking-wider font-mono mr-2">
        {label}
      </span>
      <span className="text-ink-700">{children}</span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  maxLength,
  type = "text",
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-ink-500 font-mono">
        {label}
      </span>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full px-3 py-2 text-sm border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100"
      />
      {hint && (
        <span className="block text-[11px] text-ink-500 italic mt-1 leading-snug">
          {hint}
        </span>
      )}
    </label>
  );
}
