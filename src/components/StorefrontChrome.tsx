// The nav bar and footer shared by the storefront's inner pages (offering
// pages, the Journal). The homepage keeps its own nav — it carries the
// secret sign-in wordmark and in-page anchors.

import Link from "next/link";
import { BrandLockup } from "./BrandLockup";
import { LandingLangToggle } from "./LandingLangToggle";
import { LegalLinks } from "./LegalLinks";
import { getLandingCopy, type LandingLang } from "@/lib/landing-copy";
import { localePath } from "@/lib/storefront-seo";

export function StorefrontNav({ lang }: { lang: LandingLang }) {
  const landing = getLandingCopy(lang);
  return (
    <nav className="lnav">
      <div className="inner">
        <Link
          href={localePath(lang, "/")}
          className="brand offering-home"
          aria-label={lang === "uk" ? "На головну" : "Home"}
        >
          <BrandLockup subtitle={landing.footer.subtitle} markSize={44} />
        </Link>
        <div className="nav-actions">
          <LandingLangToggle current={lang} />
          <a href={localePath(lang, "/#contact")} className="navcta">
            {landing.nav.reachOut}
          </a>
        </div>
      </div>
    </nav>
  );
}

export function StorefrontFooter({
  lang,
  showJournal,
}: {
  lang: LandingLang;
  /** Link the Journal only once it has something published. */
  showJournal: boolean;
}) {
  const uk = lang === "uk";
  return (
    <footer className="lfoot">
      <p className="storefront-foot-links">
        <Link href={localePath(lang, "/")}>
          {uk ? "Головна" : "Home"}
        </Link>
        <span aria-hidden="true"> · </span>
        <Link href={localePath(lang, "/womens-circle")}>
          {uk ? "Коло" : "The Circle"}
        </Link>
        <span aria-hidden="true"> · </span>
        <Link href={localePath(lang, "/private-sessions")}>
          {uk ? "Сесії" : "Sessions"}
        </Link>
        <span aria-hidden="true"> · </span>
        <Link href={localePath(lang, "/coaching")}>
          {uk ? "Коучинг" : "Coaching"}
        </Link>
        {showJournal && (
          <>
            <span aria-hidden="true"> · </span>
            <Link href={localePath(lang, "/journal")}>
              {uk ? "Журнал" : "Journal"}
            </Link>
          </>
        )}
      </p>
      <LegalLinks lang={lang} />
    </footer>
  );
}
