import Link from "next/link";

export function TopBar({
  breadcrumb,
}: {
  breadcrumb: { label: string; href?: string }[];
}) {
  return (
    <header className="border-b border-ink-100 px-6 h-11 flex items-center gap-3 text-sm">
      <div className="flex items-center gap-2 text-ink-500">
        {breadcrumb.map((b, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-ink-300">/</span>}
            {b.href ? (
              <Link
                href={b.href}
                className="hover:text-ink-900 text-ink-500"
              >
                {b.label}
              </Link>
            ) : (
              <span
                className={
                  i === breadcrumb.length - 1
                    ? "text-ink-700 font-medium"
                    : ""
                }
              >
                {b.label}
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 text-ink-500 text-xs">
        <span className="dot bg-green-500" />
        <span>Synced</span>
        <span className="text-ink-300">·</span>
        <span className="font-mono">2s ago</span>
      </div>
      <button className="flex items-center gap-2 text-xs text-ink-500 px-2 py-1 rounded border border-ink-200 hover:bg-ink-50">
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
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <span>Search</span>
        <span className="kbd">⌘K</span>
      </button>
      <button className="bg-ink-900 hover:bg-ink-800 text-white text-xs font-medium px-3 py-1.5 rounded flex items-center gap-1.5">
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4v16m8-8H4"
          />
        </svg>
        New
        <span className="kbd bg-ink-800 text-ink-300 border-ink-700">C</span>
      </button>
    </header>
  );
}
