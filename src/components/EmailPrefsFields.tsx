"use client";

// "Emails to this person" — the per-client email switches in Edit profile.
// Each checkbox is ticked when that kind of email is ON; the server turns the
// unticked ones into `clients.email_opt_outs` (see src/lib/email-prefs.ts).
//
// With the master switch off, the four kinds stay rendered and submitted —
// only dimmed — so turning the master back on restores exactly what she had
// rather than resetting every kind to off.

import { useState } from "react";

const KINDS: { key: string; label: string; hint: string }[] = [
  {
    key: "reminders",
    label: "Session reminders",
    hint: "The reminder before a session, and the “join now” link 10 minutes before.",
  },
  {
    key: "bookings",
    label: "Booking updates",
    hint: "Confirmations, moves, cancellations, time-off notices — and Google Calendar invites.",
  },
  {
    key: "portal",
    label: "Portal notices",
    hint: "“Something new in your space” when you share a note.",
  },
  {
    key: "circles",
    label: "Circles & follow-ups",
    hint: "Circle reminders and thank-yous, the “go deeper” invitation, and free-resource follow-ups.",
  },
];

export function EmailPrefsFields({ optOuts }: { optOuts: string[] }) {
  const [all, setAll] = useState(!optOuts.includes("all"));
  return (
    <div className="border-t border-ink-100 pt-4 mt-2 space-y-2">
      {/* Tells the server this form carries the email section. */}
      <input type="hidden" name="emailPrefs" value="1" />
      <label className="inline-flex items-start gap-2 text-sm text-ink-700">
        <input
          type="checkbox"
          name="emailAll"
          value="true"
          checked={all}
          onChange={(e) => setAll(e.target.checked)}
          className="rounded border-ink-300 mt-0.5"
        />
        <span>
          Send automatic emails to this person
          <span className="block text-[11px] text-ink-500 italic mt-0.5 leading-snug">
            {all
              ? "Untick any kind they shouldn’t get."
              : "None of the automatic emails below go out. Emails you write yourself, and sign-in links they ask for, still do."}
          </span>
        </span>
      </label>
      <div
        className={`pl-6 space-y-1.5 ${all ? "" : "opacity-40 pointer-events-none"}`}
        aria-disabled={!all}
      >
        {KINDS.map((k) => (
          <label key={k.key} className="flex items-start gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              name={`email_${k.key}`}
              value="true"
              defaultChecked={!optOuts.includes(k.key)}
              tabIndex={all ? undefined : -1}
              className="rounded border-ink-300 mt-0.5"
            />
            <span>
              {k.label}
              <span className="block text-[11px] text-ink-500 leading-snug">{k.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
