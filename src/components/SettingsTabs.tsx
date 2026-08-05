"use client";

// Settings sub-menu — one page, seven groups, one tab bar.
//
// WHY TABS AND NOT SEPARATE PAGES: updateSettings() writes every column from
// whatever FormData it receives, and a missing field reads as blank. All of
// Settings is ONE <form>, so splitting it across routes would mean each Save
// submitted only that page's inputs and silently wiped every setting on the
// other pages — her rate, her timezone, her storefront copy. Tabs keep the
// whole form mounted (hidden panels are display:none, not unmounted) so Save
// still carries everything, whichever group she happens to be looking at.
//
// That's also why SettingsPanel has `keepMounted`: panels INSIDE the form must
// use it. Panels outside the form (Google, Payments, Password, Templates) are
// independent forms and can unmount freely.
//
// The active tab is mirrored into ?tab= with replaceState — deep-linkable and
// reload-stable, without a server round-trip on every click.

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export type SettingsTabId =
  | "practice"
  | "page"
  | "money"
  | "time"
  | "connections"
  | "templates"
  | "account";

export const SETTINGS_TABS: {
  id: SettingsTabId;
  label: string;
  hint: string;
}[] = [
  { id: "practice", label: "Your practice", hint: "Name, contact, language, timezone" },
  { id: "page", label: "Your public page", hint: "Branding, words, offers, reviews" },
  { id: "money", label: "Money", hint: "Card payments, rate, invoices" },
  { id: "time", label: "Your time", hint: "Working hours, quiet days, automations" },
  { id: "connections", label: "Connections", hint: "Google Calendar" },
  { id: "templates", label: "Templates", hint: "Email and note templates" },
  { id: "account", label: "Account", hint: "Password, your data" },
];

/** Tabs whose content lives inside the settings form — i.e. where a Save
 *  button makes sense. Everything else saves itself. */
const FORM_TABS: SettingsTabId[] = [
  "practice",
  "page",
  "money",
  "time",
  "account",
];

const TabCtx = createContext<{
  active: SettingsTabId;
  setActive: (id: SettingsTabId) => void;
}>({ active: "practice", setActive: () => {} });

export function useSettingsTab() {
  return useContext(TabCtx);
}

/** True when the current tab has form fields on it. Drives the Save bar. */
export function useTabHasForm() {
  const { active } = useSettingsTab();
  return FORM_TABS.includes(active);
}

export function SettingsTabsProvider({
  initial,
  children,
}: {
  initial?: string;
  children: ReactNode;
}) {
  const [active, setActiveState] = useState<SettingsTabId>(
    SETTINGS_TABS.some((t) => t.id === initial)
      ? (initial as SettingsTabId)
      : "practice"
  );

  const setActive = useCallback((id: SettingsTabId) => {
    setActiveState(id);
    // Keep the URL honest so a refresh (or a shared link) lands in the same
    // place. replaceState rather than router.push: no re-render, no scroll
    // jump, and no new history entry per tab click.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  return (
    <TabCtx.Provider value={{ active, setActive }}>{children}</TabCtx.Provider>
  );
}

export function SettingsTabBar() {
  const { active, setActive } = useSettingsTab();
  const current = SETTINGS_TABS.find((t) => t.id === active);

  return (
    <div className="mb-5">
      <div
        className="flex gap-1 overflow-x-auto border-b border-ink-200 -mx-4 px-4 md:mx-0 md:px-0"
        role="tablist"
      >
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
            className={
              active === t.id
                ? "shrink-0 text-xs font-medium px-3 py-2 border-b-2 border-plum-700 text-plum-700"
                : "shrink-0 text-xs font-medium px-3 py-2 border-b-2 border-transparent text-ink-500 hover:text-ink-900"
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      {current && (
        <p className="text-[11px] text-ink-400 mt-2">{current.hint}</p>
      )}
    </div>
  );
}

/**
 * One group of settings.
 *
 * `keepMounted` hides with display:none instead of unmounting — REQUIRED for
 * anything inside the settings form (see the note at the top of this file).
 */
export function SettingsPanel({
  tab,
  keepMounted = false,
  children,
}: {
  tab: SettingsTabId;
  keepMounted?: boolean;
  children: ReactNode;
}) {
  const { active } = useSettingsTab();
  const on = active === tab;
  if (!on && !keepMounted) return null;
  return (
    <div style={on ? undefined : { display: "none" }} role="tabpanel">
      {children}
    </div>
  );
}
