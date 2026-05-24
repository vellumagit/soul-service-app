"use client";

// Diagnostic button — surfaces the actual Google Calendar error when sync
// fails silently. Shows up on the Status page next to the Google row.
// Tries to create + delete a probe event; reports success (with the Meet URL
// it generated) or the raw error message via the FlashNotifier.

import { useState, useTransition } from "react";
import { testGoogleConnectionAction } from "@/lib/actions";
import { notify } from "./FlashNotifier";
import { rethrowIfRedirect } from "@/lib/redirect-error";

export function TestGoogleButton() {
  const [pending, start] = useTransition();
  const [lastResult, setLastResult] = useState<
    { ok: true; meetUrl: string | null }
    | { ok: false; error: string }
    | null
  >(null);

  function run() {
    start(async () => {
      try {
        const result = await testGoogleConnectionAction();
        setLastResult(
          result.ok ? { ok: true, meetUrl: result.meetUrl } : result
        );
        if (result.ok) {
          notify({
            kind: "success",
            title: "Google Calendar works",
            body: result.meetUrl
              ? `Created a test event with a Meet link and removed it. New sessions will sync.`
              : `Created a test event and removed it — but no Meet link came back. Calendar works, but Meet auto-generation may need a Workspace account.`,
            ttlMs: 12000,
          });
        } else {
          notify({
            kind: "error",
            title: "Google sync failed — see why below",
            body: result.error.slice(0, 280),
            ttlMs: 18000,
          });
        }
      } catch (err) {
        rethrowIfRedirect(err);
        const msg = err instanceof Error ? err.message : "Unknown error";
        setLastResult({ ok: false, error: msg });
        notify({
          kind: "error",
          title: "Couldn't reach the server",
          body: msg.slice(0, 280),
          ttlMs: 12000,
        });
      }
    });
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="text-xs font-medium border border-ink-200 hover:bg-ink-50 px-3 py-1.5 rounded-md disabled:opacity-60"
      >
        {pending ? "Testing…" : "Test Google connection"}
      </button>
      {lastResult && (
        <div
          className={`mt-2 text-xs leading-relaxed rounded-md p-2 border ${
            lastResult.ok
              ? "bg-sage-50 border-sage-100 text-ink-700"
              : "bg-red-50 border-red-100 text-red-800"
          }`}
        >
          {lastResult.ok ? (
            <>
              <strong>OK.</strong>{" "}
              {lastResult.meetUrl
                ? "Calendar + Meet both working."
                : "Calendar works; no Meet link auto-generated."}
            </>
          ) : (
            <>
              <strong>Error from Google:</strong>
              <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">
                {lastResult.error}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
