"use client";

// App-wide error boundary.
//
// /portal has had one of these for a while; everything else fell through to
// Next's default production error page — a stark white "Application error: a
// server-side exception has occurred" with a digest hash and no way forward.
// That's what she got if a page threw between clients, and what a visitor to
// the storefront got too.
//
// Why both languages, rather than picking one: this boundary sits at the root,
// so it covers the practitioner's pages AND the public storefront, Circle
// sign-ups and lead-magnet pages. There is no reliable way from here to tell
// which kind of reader hit it — the practitioner session cookie is httpOnly,
// and reading the `landing_lang` cookie on mount would either flash English
// first or risk a hydration mismatch. The text is four short lines; showing
// both is the only option that is never wrong for the person reading it, and
// it satisfies the rule that public copy is always EN + УКР.
//
// Reporting is already handled server-side by onRequestError in
// instrumentation.ts (reportError is server-only and can't be called here),
// so this file's only job is to be a calm, useful dead end.

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="paper-card p-8 max-w-md w-full text-center">
        <h1
          className="text-xl text-ink-900 serif mb-2"
          style={{ fontWeight: 500 }}
        >
          Something went wrong
        </h1>
        <p className="text-sm text-ink-600 leading-relaxed">
          Nothing you did caused this, and nothing has been lost. Try again —
          and if it keeps happening, it&apos;s worth mentioning.
        </p>

        <div
          className="my-5 mx-auto w-10 border-t"
          style={{ borderColor: "var(--color-ink-200)" }}
        />

        <h2
          className="text-base text-ink-800 serif mb-1"
          style={{ fontWeight: 500 }}
        >
          Щось пішло не так
        </h2>
        <p className="text-sm text-ink-600 leading-relaxed mb-6">
          Це не через вас, і нічого не втрачено. Спробуйте ще раз, будь ласка —
          а якщо повторюється, варто про це сказати.
        </p>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium transition-colors"
          >
            Try again · Спробувати ще раз
          </button>
          <Link
            href="/"
            className="px-4 py-2 text-sm rounded-md border border-ink-200 text-ink-700 hover:bg-ink-50"
          >
            Home · На головну
          </Link>
        </div>

        {/* The digest is the only handle Sentry and the Vercel logs share, so
            it's worth showing — quietly, and without pretending it means
            anything to the person reading it. */}
        {error.digest && (
          <p className="text-[11px] text-ink-400 font-mono mt-6">
            ref {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
