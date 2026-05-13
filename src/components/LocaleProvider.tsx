"use client";

// Lightweight context so client components can read the current UI locale
// without prop-drilling. The provider is mounted inside AppShell.
//
// Server components don't need this — they get the locale directly from
// settings (via getSettings()) and call t(locale, key) inline.

import { createContext, useContext, useCallback } from "react";
import { DEFAULT_LOCALE, t, type Locale, type TranslationKey } from "@/lib/i18n";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

/** Get the current UI locale. */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** Get a bound translate function tied to the current locale. */
export function useT(): (key: TranslationKey) => string {
  const locale = useLocale();
  return useCallback((key: TranslationKey) => t(locale, key), [locale]);
}
