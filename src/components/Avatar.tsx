"use client";

import { useState, useRef } from "react";
import { uploadClientAvatar } from "@/lib/uploads";
import { initials } from "@/lib/format";

export function Avatar({
  clientId,
  fullName,
  url,
  size = "lg",
  editable = false,
}: {
  clientId: string;
  fullName: string;
  url: string | null;
  size?: "sm" | "md" | "lg";
  editable?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sizeCls = {
    sm: "w-8 h-8 text-xs",
    md: "w-12 h-12 text-sm",
    lg: "w-20 h-20 text-2xl",
  }[size];

  const inits = initials(fullName);

  async function onFile(file: File) {
    setError(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("clientId", clientId);
    fd.append("file", file);
    try {
      await uploadClientAvatar(fd);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <div
        className={`${sizeCls} rounded-md overflow-hidden bg-flame-100 text-flame-700 flex items-center justify-center font-semibold`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={fullName}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{inits}</span>
        )}
      </div>
      {editable && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border border-ink-200 shadow flex items-center justify-center text-ink-600 hover:text-ink-900 disabled:opacity-50"
            title="Upload photo"
          >
            {uploading ? (
              <svg
                className="w-3 h-3 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            )}
          </button>
          {error && (
            <div className="absolute top-full left-0 mt-1 text-[11px] text-red-700 whitespace-nowrap">
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
