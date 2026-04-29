"use client";

import { useRef, useState, useTransition } from "react";
import { uploadAttachment } from "@/lib/uploads";
import { deleteAttachment } from "@/lib/actions";
import type { Attachment } from "@/db/schema";
import { bytes, relativeTime } from "@/lib/format";
import { ConfirmButton } from "./ConfirmButton";

const KIND_LABEL: Record<string, string> = {
  note: "Note",
  intake: "Intake",
  consent: "Consent",
  recording: "Recording",
  photo: "Photo",
  other: "Other",
};

export function AttachmentsBlock({
  clientId,
  attachments,
}: {
  clientId: string;
  attachments: Attachment[];
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<keyof typeof KIND_LABEL>("other");

  async function onFiles(files: FileList) {
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("clientId", clientId);
        fd.append("file", file);
        fd.append("kind", kind);
        await uploadAttachment(fd);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-ink-300 rounded-md p-6 text-center hover:border-flame-500 transition">
        <div className="flex items-center justify-center gap-3 mb-3">
          <label className="text-xs text-ink-500">Type:</label>
          <select
            value={kind}
            onChange={(e) =>
              setKind(e.target.value as keyof typeof KIND_LABEL)
            }
            className="text-sm px-2 py-1 border border-ink-200 rounded outline-none focus:border-flame-600"
          >
            {Object.entries(KIND_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) onFiles(files);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="bg-ink-900 hover:bg-ink-800 text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-60"
        >
          {uploading ? "Uploading…" : "Choose files"}
        </button>
        <div className="text-[11px] text-ink-400 mt-2">
          Up to 100 MB each. Notes, recordings, intake forms, photos — anything.
        </div>
        {error && (
          <div className="mt-2 text-xs text-red-700">{error}</div>
        )}
      </div>

      {attachments.length === 0 ? (
        <div className="text-sm text-ink-400 italic text-center py-4">
          No files yet.
        </div>
      ) : (
        <div className="border border-ink-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-ink-500 bg-ink-50/60 border-b border-ink-100">
              <tr>
                <th className="text-left font-medium px-4 py-2">File</th>
                <th className="text-left font-medium px-4 py-2 hidden sm:table-cell">
                  Type
                </th>
                <th className="text-left font-medium px-4 py-2 hidden md:table-cell">
                  Size
                </th>
                <th className="text-left font-medium px-4 py-2 hidden md:table-cell">
                  Added
                </th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {attachments.map((a) => (
                <tr key={a.id} className="row-hover">
                  <td className="px-4 py-2">
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ink-900 hover:text-flame-700 text-sm flex items-center gap-2"
                    >
                      <svg
                        className="w-3.5 h-3.5 text-ink-400 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={1.8}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586L19 9v10a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span className="truncate">{a.name}</span>
                    </a>
                  </td>
                  <td className="px-4 py-2 hidden sm:table-cell">
                    <span className="chip bg-ink-100 text-ink-700">
                      {KIND_LABEL[a.kind] ?? a.kind}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-500 hidden md:table-cell">
                    {bytes(a.sizeBytes)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-500 hidden md:table-cell">
                    {relativeTime(a.createdAt)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <ConfirmButton
                      label={
                        <span className="text-xs text-ink-400 hover:text-red-700">
                          delete
                        </span>
                      }
                      message={`Delete "${a.name}"? This removes it from storage permanently.`}
                      confirmLabel="Yes, delete"
                      onConfirm={() => deleteAttachment(a.id, clientId)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
