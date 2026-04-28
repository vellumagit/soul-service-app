"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Today's thread", count: 3, kbd: null },
  { href: "/souls", label: "Souls", count: null, kbd: "G C" },
  { href: "/calendar", label: "Readings calendar", count: null, kbd: "G S" },
  { href: "/exchange", label: "Exchange", count: null, kbd: "G B" },
];

const FILTERS = [
  { dot: "bg-flame-500", label: "Actively held" },
  { dot: "bg-amber-500", label: "Intake still open" },
  { dot: "bg-red-500", label: "Exchange unsettled" },
  { dot: "bg-ink-300", label: "Quiet for 30d+" },
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="w-56 border-r border-ink-100 flex flex-col bg-white">
      <div className="px-4 py-4 border-b border-ink-100 flex items-center gap-2">
        <div className="w-5 h-5 rounded-sm bg-ink-900 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-flame-500" />
        </div>
        <div>
          <div className="text-sm font-semibold text-ink-900 tracking-tight leading-none">
            soul&nbsp;service
          </div>
          <div className="text-[10px] text-ink-400 mt-0.5">
            readings for returning to love
          </div>
        </div>
      </div>

      <nav className="flex-1 py-2 text-sm">
        <div className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-ink-400">
          Workspace
        </div>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            data-active={isActive(item.href)}
            className="nav-item w-full flex items-center gap-2.5 pl-4 pr-3 py-1.5 text-ink-600 hover:bg-ink-50"
          >
            <span className="flex-1 text-left">{item.label}</span>
            {item.count !== null && (
              <span className="font-mono text-[10px] text-ink-400">
                {item.count}
              </span>
            )}
            {item.kbd && <span className="kbd">{item.kbd}</span>}
          </Link>
        ))}

        <div className="px-4 pt-5 pb-1 text-[10px] font-medium uppercase tracking-wider text-ink-400">
          Who needs you
        </div>
        {FILTERS.map((f) => (
          <button
            key={f.label}
            className="w-full flex items-center gap-2.5 pl-4 pr-3 py-1.5 text-ink-600 hover:bg-ink-50"
          >
            <span className={`dot ${f.dot}`} />
            {f.label}
          </button>
        ))}

        <div className="px-4 pt-5 pb-1 text-[10px] font-medium uppercase tracking-wider text-ink-400">
          Close to my heart
        </div>
        {/* Placeholder pinned slots — practitioner pins souls manually for quick access */}
        {[1, 2, 3].map((i) => (
          <button
            key={i}
            className="w-full flex items-center gap-2 pl-4 pr-3 py-1.5 text-ink-600 hover:bg-ink-50 text-left"
          >
            <div className="w-5 h-5 rounded-sm bg-ink-100 text-ink-700 flex items-center justify-center text-[10px] font-semibold">
              ·
            </div>
            <span className="truncate text-ink-500 italic text-xs">
              [pinned soul slot]
            </span>
          </button>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-ink-100 text-xs text-ink-500">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-sm bg-flame-100 flex items-center justify-center text-[10px] font-semibold text-flame-700">
              M
            </div>
            <div className="min-w-0">
              <div className="truncate text-ink-700 leading-none">Maya</div>
              <div className="text-[10px] text-ink-400 mt-0.5 leading-none">
                soul reader
              </div>
            </div>
          </div>
          <span className="kbd">⌘ K</span>
        </div>
      </div>
    </aside>
  );
}
