"use client";

// Small horizontal nav at the top of every portal page. Three rooms:
//
//   Today        — what's coming, what's owed, how to reach her
//   The arc      — every session, intentions, what was shared
//   Reflections  — their own journal, between sessions
//
// Mobile-first, no AppShell. Quiet — three plum-tinted pill links, with
// the active one carrying a soft fill. No sidebar, no logo (the layout
// adds those if needed), no chrome.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/portal", label: "Today" },
  { href: "/portal/arc", label: "The arc" },
  { href: "/portal/reflections", label: "Reflections" },
];

export function PortalNav() {
  const pathname = usePathname();
  // Don't render nav on the sign-in pages — the client isn't signed in
  // there and showing tabs would imply they can navigate without auth.
  if (pathname.startsWith("/portal/sign-in")) return null;

  const isActive = (href: string) =>
    href === "/portal"
      ? pathname === "/portal"
      : pathname.startsWith(href);

  return (
    <nav
      className="border-b border-ink-100"
      style={{ background: "rgba(253, 249, 241, 0.6)" }}
    >
      <div className="max-w-2xl mx-auto px-4 md:px-6 flex items-center gap-1">
        {TABS.map((t) => {
          const active = isActive(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              data-active={active}
              className={`relative px-3 md:px-4 py-3 text-sm font-medium transition-colors ${
                active ? "text-plum-700" : "text-ink-500 hover:text-ink-900"
              }`}
            >
              {t.label}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute left-3 right-3 md:left-4 md:right-4 bottom-0 h-[2px] bg-plum-500"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
