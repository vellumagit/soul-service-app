"use client";

// "Add someone to this Circle" — the pro-bono / paid-me-another-way door.
// Deliberately an inline reveal rather than a <dialog>: this sits inside a page
// that already renders several attendee rows, and stacked dialogs are what
// caused the dud-submit bugs earlier. Nothing here nests a form in a form.

import { useState } from "react";
import { addCircleAttendee } from "@/lib/group-actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { notify } from "./FlashNotifier";

export function AddCircleAttendeeInline({
  groupSessionId,
}: {
  groupSessionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [gifted, setGifted] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await addCircleAttendee({
        groupSessionId,
        name,
        email,
        gifted,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      notify({
        kind: "success",
        title: gifted ? "Seat gifted" : "Added to the Circle",
        body: `${name} has been sent the welcome email with the meeting link.`,
        ttlMs: 4500,
      });
      setName("");
      setEmail("");
      setOpen(false);
    } catch (e) {
      rethrowIfRedirect(e);
      setError("Couldn't add them. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-plum-700 hover:underline mt-3"
      >
        + Add someone / gift a seat
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-ink-200 p-3 bg-white/50">
      <div className="text-[11px] uppercase tracking-wider font-mono text-ink-500 mb-2">
        Add someone to this Circle
      </div>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Their name"
          disabled={saving}
          autoFocus
          className="text-sm border border-ink-200 rounded px-2 py-1.5"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Their email — this is how they get the link"
          disabled={saving}
          className="text-sm border border-ink-200 rounded px-2 py-1.5"
        />
        <label className="flex items-start gap-2 text-[12px] text-ink-600 cursor-pointer">
          <input
            type="checkbox"
            checked={gifted}
            onChange={(e) => setGifted(e.target.checked)}
            disabled={saving}
            className="mt-0.5"
          />
          <span>
            <strong>Gift this seat</strong> — no charge. Leave unticked if
            they&apos;ve already paid you another way (cash, e-transfer).
          </span>
        </label>
        {error && <p className="text-[12px] text-red-700">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="text-xs bg-ink-900 hover:bg-ink-800 text-white rounded px-3 py-1.5 font-medium disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add & send them the link"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            disabled={saving}
            className="text-xs text-ink-500 hover:text-ink-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
