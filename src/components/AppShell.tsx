"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SearchPalette } from "./SearchPalette";
import { SignOutButton } from "./SignOutButton";
import { KeyboardShortcuts, KeyboardShortcutsTrigger } from "./KeyboardShortcuts";
import { LocaleProvider, useT } from "./LocaleProvider";
import { HelpBuddy } from "./HelpBuddy";
import { DEFAULT_LOCALE, type Locale, type TranslationKey } from "@/lib/i18n";

type NavItem = {
  href: string;
  labelKey: TranslationKey;
  icon: string;
};

const NAV: NavItem[] = [
  { href: "/", labelKey: "nav.today", icon: "today" },
  { href: "/clients", labelKey: "nav.clients", icon: "clients" },
  { href: "/calendar", labelKey: "nav.calendar", icon: "calendar" },
  { href: "/payments", labelKey: "nav.payments", icon: "payments" },
  { href: "/settings", labelKey: "nav.settings", icon: "settings" },
];

const ICON: Record<string, string> = {
  today:
    "M3 7l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  clients:
    "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  calendar:
    "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  payments:
    "M3 10h18M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  settings:
    "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
};

export function AppShell({
  breadcrumb,
  rightAction,
  userEmail,
  locale = DEFAULT_LOCALE,
  children,
}: {
  breadcrumb: { label: string; href?: string }[];
  rightAction?: React.ReactNode;
  /** Logged-in user's email — shown in the sidebar footer with a sign-out link. */
  userEmail?: string;
  /** UI locale — drives nav labels + footer chip via LocaleProvider context. */
  locale?: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleProvider locale={locale}>
      <AppShellInner
        breadcrumb={breadcrumb}
        rightAction={rightAction}
        userEmail={userEmail}
      >
        {children}
      </AppShellInner>
    </LocaleProvider>
  );
}

function AppShellInner({
  breadcrumb,
  rightAction,
  userEmail,
  children,
}: {
  breadcrumb: { label: string; href?: string }[];
  rightAction?: React.ReactNode;
  userEmail?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <KeyboardShortcuts />
      <HelpBuddy />
    <div className="flex min-h-screen">
      {/* Sidebar — visible md+ */}
      <aside className="hidden md:flex w-56 border-r border-ink-100 flex-col bg-white shrink-0">
        <SidebarBrand />
        <SidebarNav isActive={isActive} />
        <SidebarFooter userEmail={userEmail} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          className="md:hidden fixed inset-0 bg-ink-900/40 z-40"
        />
      )}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 w-64 bg-white border-r border-ink-100 z-50 flex flex-col transition-transform ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarBrand onClose={() => setDrawerOpen(false)} />
        <SidebarNav
          isActive={isActive}
          onNavigate={() => setDrawerOpen(false)}
        />
        <SidebarFooter userEmail={userEmail} />
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-white">
        <header className="border-b border-ink-100 px-4 md:px-6 h-12 flex items-center gap-3 text-sm">
          {/* Hamburger on mobile */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="md:hidden p-1 -ml-1 text-ink-700"
            aria-label="Open menu"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <Breadcrumb crumbs={breadcrumb} />
          <div className="flex-1" />
          <SearchPalette />
          {rightAction}
        </header>

        <div className="flex-1 overflow-auto">
          <div className="px-4 md:px-6 py-5 md:py-6 max-w-6xl mx-auto w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
    </>
  );
}

function Breadcrumb({
  crumbs,
}: {
  crumbs: { label: string; href?: string }[];
}) {
  return (
    <div className="flex items-center gap-2 text-ink-500 min-w-0">
      {crumbs.map((b, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-2 min-w-0">
            {i > 0 && <span className="text-ink-300 shrink-0">/</span>}
            {b.href && !isLast ? (
              <Link
                href={b.href}
                className="hover:text-ink-900 text-ink-500 truncate"
              >
                {b.label}
              </Link>
            ) : (
              <span
                className={`truncate ${
                  isLast ? "text-ink-900 font-medium" : ""
                }`}
              >
                {b.label}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function SidebarBrand({ onClose }: { onClose?: () => void }) {
  return (
    <div className="px-4 py-4 border-b border-ink-100 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-ink-900 flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-flame-500" />
        </div>
        <div>
          <div className="text-sm font-semibold text-ink-900 tracking-tight leading-none">
            Soul Service
          </div>
          <div className="text-[10px] text-ink-400 mt-0.5">for Svitlana</div>
        </div>
      </Link>
      {onClose && (
        <button
          onClick={onClose}
          className="text-ink-400 hover:text-ink-700 p-1 -mr-1"
          aria-label="Close menu"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

function SidebarNav({
  isActive,
  onNavigate,
}: {
  isActive: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  const t = useT();
  return (
    <nav className="flex-1 py-2 text-sm">
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          data-active={isActive(item.href)}
          className="nav-item w-full flex items-center gap-3 pl-4 pr-3 py-2 text-ink-600 hover:bg-ink-50"
        >
          <svg
            className="w-4 h-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d={ICON[item.icon]}
            />
          </svg>
          <span className="flex-1 text-left">{t(item.labelKey)}</span>
        </Link>
      ))}
    </nav>
  );
}

function SidebarFooter({ userEmail }: { userEmail?: string }) {
  const t = useT();
  // `||` (not `??`) so empty-string from auth-disabled mode falls back to
  // the neutral chip instead of rendering as a blank label.
  const initial = (userEmail?.[0] || "S").toUpperCase();
  const display = userEmail || "Svitlana";
  return (
    <div className="border-t border-ink-100">
      <div className="px-3 py-2 flex items-center gap-3 text-[10px] uppercase tracking-wide text-ink-400">
        <Link href="/status" className="hover:text-ink-700">
          Status
        </Link>
        <span className="text-ink-200">·</span>
        <KeyboardShortcutsTrigger />
      </div>
      <div className="px-3 pb-3 text-xs text-ink-500">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-6 h-6 rounded-md bg-flame-100 flex items-center justify-center text-[11px] font-semibold text-flame-700 shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <div
                className="truncate text-ink-700 leading-none"
                title={display}
              >
                {display}
              </div>
              <div className="text-[10px] text-ink-400 mt-0.5 leading-none">
                {t("sidebar.yourSpace")}
              </div>
            </div>
          </div>
          {userEmail && <SignOutButton />}
        </div>
      </div>
    </div>
  );
}
