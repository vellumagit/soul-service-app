// Shared layout for /privacy and /terms — storefront look, bilingual via the
// same landing_lang cookie + EN·УКР toggle as the rest of the public site.
// All text comes from src/lib/legal-copy.ts.

import Link from "next/link";
import { TimeOfDayProvider } from "./TimeOfDayProvider";
import { GoogleAnalytics } from "./GoogleAnalytics";
import { LandingLangToggle } from "./LandingLangToggle";
import { getLegalCopy, LEGAL_UPDATED } from "@/lib/legal-copy";
import type { LandingLang } from "@/lib/landing-copy";

export function LegalPage({ doc, lang }: { doc: "privacy" | "terms"; lang: LandingLang }) {
  const copy = getLegalCopy(lang);
  const d = copy[doc];
  const updated = new Intl.DateTimeFormat(lang === "uk" ? "uk-UA" : "en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${LEGAL_UPDATED}T00:00:00Z`));
  const other = doc === "privacy" ? "terms" : "privacy";

  return (
    <>
      <TimeOfDayProvider />
      <GoogleAnalytics />
      <main className="landing-root legal">
        <header className="legal-head">
          <Link href="/" className="legal-home">
            {copy.chrome.back}
          </Link>
          <LandingLangToggle current={lang} />
        </header>

        <article className="wrap narrow legal-body">
          <h1>{d.title}</h1>
          <p className="legal-updated">
            {d.updatedLabel}: {updated}
          </p>
          <p className="p-lg">{d.intro}</p>

          {d.sections.map((s) => (
            <section key={s.id} id={s.id}>
              <h2>{s.h}</h2>
              {s.p?.map((para, i) => <p key={i}>{para}</p>)}
              {s.list && (
                <ul>
                  {s.list.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>

        <footer className="lfoot">
          <p>{copy.chrome.questions}</p>
          <p>
            <Link href={`/${other}`} className="signin-link">
              {copy.chrome[other]}
            </Link>
          </p>
        </footer>
      </main>
    </>
  );
}
