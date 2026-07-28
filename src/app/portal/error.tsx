"use client";

// Error boundary for the whole client portal.
//
// Without this, any thrown error in /portal fell through to the app-wide
// Next.js error page — a stark "Application error: a client-side exception
// has occurred" with a digest hash. A client sitting alone with that has no
// idea whether their session is still booked, and no way forward.
//
// This one says what's true (something broke on our side, your bookings are
// safe), gives them a retry, and points at her email if it keeps happening.

import { useEffect } from "react";
import Link from "next/link";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[portal] unhandled error:", error);
  }, [error]);

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="paper-card p-8">
        <h1
          className="text-xl text-ink-900 serif mb-2"
          style={{ fontWeight: 500 }}
        >
          Something went wrong on our side
        </h1>
        <p className="text-sm text-ink-600 leading-relaxed mb-6">
          Nothing you did caused this, and nothing has changed — your sessions
          and anything you&apos;ve written are safe. Try again, and if it keeps
          happening, just email your practitioner directly.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium transition-colors"
          >
            Try again
          </button>
          <Link
            href="/portal"
            className="px-4 py-2 text-sm rounded-md border border-ink-200 text-ink-700 hover:bg-ink-50"
          >
            Back to your space
          </Link>
        </div>
        {error.digest && (
          <p className="text-[11px] text-ink-400 font-mono mt-6">
            ref {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
