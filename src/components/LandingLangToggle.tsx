"use client";

// EN · УКР language toggle for the storefront nav. Each language has its own
// URL (/quiz ↔ /uk/quiz — see storefront-seo.ts), so switching loads the
// other version. It's a full page load on purpose: the language reaches the
// page through a proxy rewrite + the root layout's <html lang>, and a client-
// side navigation keeps the old layout (and can reuse the old language's
// cached render). It also writes the `landing_lang` cookie (1-year, lax)
// first, so proxy.ts remembers the choice and doesn't bounce the visitor
// straight back. The active language is highlighted.

import { usePathname } from "next/navigation";
import { useState } from "react";
import type { LandingLang } from "@/lib/landing-copy";
import { localePath, splitLocale } from "@/lib/storefront-seo";

export function LandingLangToggle({ current }: { current: LandingLang }) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  function pick(lang: LandingLang) {
    if (lang === current || pending) return;
    document.cookie = `landing_lang=${lang}; path=/; max-age=31536000; samesite=lax`;
    const { path } = splitLocale(pathname);
    setPending(true);
    window.location.assign(localePath(lang, path) + window.location.hash);
  }

  return (
    <div className="lang-toggle" role="group" aria-label="Language / Мова">
      <button
        type="button"
        onClick={() => pick("en")}
        aria-pressed={current === "en"}
        className={current === "en" ? "active" : ""}
      >
        EN
      </button>
      <span className="sep" aria-hidden="true">
        ·
      </span>
      <button
        type="button"
        onClick={() => pick("uk")}
        aria-pressed={current === "uk"}
        className={current === "uk" ? "active" : ""}
      >
        УКР
      </button>
    </div>
  );
}
