"use client";

import { useState, useTransition } from "react";
import { generateInvoice } from "@/lib/actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";

export function GenerateInvoiceButton({
  sessionId,
  clientId,
  hasInvoice,
  invoiceUrl,
}: {
  sessionId: string;
  clientId: string;
  hasInvoice: boolean;
  invoiceUrl?: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (hasInvoice && invoiceUrl) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={invoiceUrl}
          target="_blank"
          rel="noreferrer"
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586L19 9v10a2 2 0 01-2 2z"
            />
          </svg>
          View invoice
        </a>
        <button
          type="button"
          onClick={() => {
            setError(null);
            start(async () => {
              try {
                await generateInvoice(sessionId, clientId);
              } catch (e) {
                rethrowIfRedirect(e);
                setError(e instanceof Error ? e.message : "Failed");
              }
            });
          }}
          disabled={pending}
          className="text-[11px] text-ink-400 hover:text-ink-700"
          title="Regenerate (e.g. after editing the session)"
        >
          {pending ? "Regenerating…" : "regenerate"}
        </button>
        {error && <span className="text-[11px] text-red-700">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setError(null);
          start(async () => {
            try {
              await generateInvoice(sessionId, clientId);
            } catch (e) {
              rethrowIfRedirect(e);
              setError(e instanceof Error ? e.message : "Failed");
            }
          });
        }}
        disabled={pending}
        className="text-xs text-flame-700 hover:underline font-medium"
      >
        {pending ? "Generating…" : "Generate invoice"}
      </button>
      {error && (
        <span className="text-[11px] text-red-700">{error}</span>
      )}
    </div>
  );
}
