"use client";

// EN · УКР language toggle for the storefront nav. Writes the
// `landing_lang` cookie (1-year, lax) and refreshes so the server
// re-renders in the chosen language. English is the default; the active
// language is highlighted.

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { LandingLang } from "@/lib/landing-copy";

export function LandingLangToggle({ current }: { current: LandingLang }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function pick(lang: LandingLang) {
    if (lang === current || pending) return;
    document.cookie = `landing_lang=${lang}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div className="lang-toggle" role="group" aria-label="Мова / Language">
      <button
        type="button"
        onClick={() => pick("uk")}
        aria-pressed={current === "uk"}
        className={current === "uk" ? "active" : ""}
      >
        УКР
      </button>
      <span className="sep" aria-hidden="true">
        ·
      </span>
      <button
        type="button"
        onClick={() => pick("en")}
        aria-pressed={current === "en"}
        className={current === "en" ? "active" : ""}
      >
        EN
      </button>
    </div>
  );
}
