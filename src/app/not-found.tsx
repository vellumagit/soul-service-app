// The 404 page.
//
// Seven places call notFound() — a client, Circle, group, lead magnet,
// requests section or session prep view that doesn't exist or isn't hers —
// plus any mistyped URL. All of them landed on Next's unstyled default 404,
// which in an app this carefully dressed reads like a different website.
//
// Bilingual for the same reason as error.tsx: this is reachable from both the
// practitioner's pages and the public storefront (a stale Circle link in
// someone's inbox is the most likely way anyone sees it), and there's no
// reliable way to tell which reader arrived.

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="paper-card p-8 max-w-md w-full text-center">
        <div className="font-mono text-[11px] tracking-widest text-ink-400 mb-3">
          404
        </div>

        <h1
          className="text-xl text-ink-900 serif mb-2"
          style={{ fontWeight: 500 }}
        >
          We couldn&apos;t find that page
        </h1>
        <p className="text-sm text-ink-600 leading-relaxed">
          The link may be old, or whatever was here has moved on.
        </p>

        <div
          className="my-5 mx-auto w-10 border-t"
          style={{ borderColor: "var(--color-ink-200)" }}
        />

        <h2
          className="text-base text-ink-800 serif mb-1"
          style={{ fontWeight: 500 }}
        >
          Ми не знайшли цю сторінку
        </h2>
        <p className="text-sm text-ink-600 leading-relaxed mb-6">
          Можливо, посилання застаріло або сторінку перенесено.
        </p>

        <Link
          href="/"
          className="inline-flex px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium transition-colors"
        >
          Home · На головну
        </Link>
      </div>
    </div>
  );
}
