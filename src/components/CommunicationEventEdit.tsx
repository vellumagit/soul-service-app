"use client";

// Edit-in-place for a logged communication on the Activity timeline: hover
// "edit" → subject + note fields (prefilled with the FULL text, not the
// truncated display) → Save. The timeline is a server component; this is the
// one interactive island it needs.

import { useState, useTransition } from "react";
import { deleteCommunication, updateCommunication } from "@/lib/actions";
import { ConfirmButton } from "./ConfirmButton";

export function CommunicationEventEdit({
  communicationId,
  clientId,
  subject,
  body,
}: {
  communicationId: string;
  clientId: string;
  subject: string;
  body: string;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-[10px] text-ink-400 hover:text-ink-900 opacity-0 group-hover:opacity-100 mt-1"
      >
        edit
      </button>
    );
  }
  return (
    <form
      className="mt-2 space-y-1.5"
      action={(fd) => {
        setError(null);
        start(async () => {
          const r = await updateCommunication(communicationId, clientId, {
            subject: String(fd.get("subject") ?? ""),
            body: String(fd.get("body") ?? ""),
          });
          if (!r.ok) {
            setError(r.error);
            return;
          }
          setEditing(false);
        });
      }}
    >
      <input
        name="subject"
        defaultValue={subject}
        placeholder="Subject"
        className="w-full bg-white border border-ink-200 rounded-md px-2 py-1 text-xs"
        autoFocus
      />
      <textarea
        name="body"
        defaultValue={body}
        rows={4}
        placeholder="Note"
        className="w-full bg-white border border-ink-200 rounded-md px-2 py-1.5 text-xs"
      />
      {error && <div className="text-[11px] text-red-700">{error}</div>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="px-2.5 py-1 text-[11px] font-medium bg-ink-900 hover:bg-ink-800 text-white rounded-md disabled:opacity-60"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-[11px] text-ink-500 hover:text-ink-900"
        >
          Cancel
        </button>
        <span className="flex-1" />
        <ConfirmButton
          label="Delete"
          className="text-[11px] text-ink-400 hover:text-red-700"
          message="Delete this logged communication from the timeline? The email itself (if one was sent) is not affected."
          confirmLabel="Yes, delete"
          onConfirm={() => deleteCommunication(communicationId, clientId)}
        />
      </div>
    </form>
  );
}
