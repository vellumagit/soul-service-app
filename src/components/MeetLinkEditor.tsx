"use client";

// Inline "add / edit meeting link" control on a session card. Saves the link
// onto the session and emails the client an invite (link + local time) via the
// existing booking-confirmation email. Use when Google didn't auto-generate a
// Meet link, or she made a Zoom/Meet room by hand after scheduling.

import { useState } from "react";
import { setSessionMeetUrl } from "@/lib/actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { notify } from "./FlashNotifier";

export function MeetLinkEditor({
  sessionId,
  meetUrl,
}: {
  sessionId: string;
  meetUrl: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(meetUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await setSessionMeetUrl(sessionId, value);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      notify({
        kind: "success",
        title: "Meeting link saved",
        body: res.emailed
          ? "Your client was emailed the link and session details."
          : "No email on file for this client, so nothing was sent.",
        ttlMs: 4500,
      });
    } catch (e) {
      rethrowIfRedirect(e);
      setError(e instanceof Error ? e.message : "Couldn't save the link.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        {meetUrl && (
          <a
            href={meetUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-plum-700 hover:underline"
          >
            Meet link ↗
          </a>
        )}
        <button
          type="button"
          onClick={() => {
            setValue(meetUrl ?? "");
            setError(null);
            setEditing(true);
          }}
          className="text-xs text-ink-500 hover:text-plum-700"
        >
          {meetUrl ? "Edit / re-send" : "+ Add meeting link"}
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <input
        type="url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://zoom.us/…  or  meet.google.com/…"
        autoFocus
        disabled={saving}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          }
          if (e.key === "Escape") setEditing(false);
        }}
        className="text-xs border border-ink-200 rounded px-2 py-1 w-64 max-w-full"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="text-xs bg-ink-900 hover:bg-ink-800 text-white rounded px-2.5 py-1 font-medium disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save & invite client"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={saving}
        className="text-xs text-ink-500 hover:text-ink-800"
      >
        Cancel
      </button>
      {error && (
        <span className="text-[11px] text-red-700 basis-full">{error}</span>
      )}
    </span>
  );
}
