// Search-engine plumbing for the public storefront: language-prefixed URLs,
// canonical + hreflang links, and the page titles Google shows.
//
// Language lives in the URL so Google can index BOTH versions:
//   English   → /, /privacy, /terms, /quiz, /free/<slug>
//   Ukrainian → /uk, /uk/privacy, /uk/terms, /uk/quiz, /uk/free/<slug>
// proxy.ts rewrites /uk/* onto the same pages and tells them the language via
// the LANG_HEADER request header (see getLandingLang). No page is duplicated.
//
// Edge-safe on purpose (no server-only imports) — proxy.ts imports it.

import type { Metadata } from "next";

export type StorefrontLang = "en" | "uk";

/** Where the storefront lives. Canonicals always point here, whichever host
 *  (app.svit.live, a preview URL) actually served the page. */
export const CANONICAL_ORIGIN = "https://www.svit.live";

/** Request header proxy.ts sets to tell a page which language its URL asked for. */
export const LANG_HEADER = "x-storefront-lang";

/** Cookie remembering the visitor's last choice (see proxy.ts redirects). */
export const LANG_COOKIE = "landing_lang";

/** Storefront pages that exist in both languages. `/free/<slug>` is matched
 *  by prefix. Anything else under /uk is a 404. */
const LOCALIZED_EXACT = new Set([
  "/",
  "/quiz",
  "/privacy",
  "/terms",
  // The offering pages (offering-pages.ts) — one per kind of work.
  "/womens-circle",
  "/private-sessions",
  "/coaching",
]);
const LOCALIZED_PREFIXES = ["/free/"];

export function isLocalizedPath(path: string): boolean {
  return (
    LOCALIZED_EXACT.has(path) ||
    LOCALIZED_PREFIXES.some((p) => path.startsWith(p) && path.length > p.length)
  );
}

/** "/quiz" → "/uk/quiz" for Ukrainian; untouched for English, for anchors
 *  ("#contact") and for pages that only exist once (/circles/…, /signin). */
export function localePath(lang: StorefrontLang, path: string): string {
  if (lang !== "uk") return path;
  const [pathname, rest = ""] = splitSuffix(path);
  if (!isLocalizedPath(pathname)) return path;
  return (pathname === "/" ? "/uk" : `/uk${pathname}`) + rest;
}

/** "/uk/quiz" → { lang: "uk", path: "/quiz" }; "/quiz" → { lang: "en", … }. */
export function splitLocale(pathname: string): {
  lang: StorefrontLang;
  path: string;
} {
  if (pathname === "/uk" || pathname === "/uk/") return { lang: "uk", path: "/" };
  if (pathname.startsWith("/uk/")) return { lang: "uk", path: pathname.slice(3) };
  return { lang: "en", path: pathname };
}

function splitSuffix(path: string): [string, string] {
  const i = path.search(/[?#]/);
  return i === -1 ? [path, ""] : [path.slice(0, i), path.slice(i)];
}

/** Canonical + hreflang for a page that exists in both languages. `path` is
 *  the English (unprefixed) path. */
export function storefrontAlternates(
  path: string,
  lang: StorefrontLang
): NonNullable<Metadata["alternates"]> {
  const en = CANONICAL_ORIGIN + path;
  const uk = CANONICAL_ORIGIN + localePath("uk", path);
  return {
    canonical: lang === "uk" ? uk : en,
    languages: { en, uk, "x-default": en },
  };
}

/** Title / description / social preview for the homepage, per language.
 *  Titles stay under 60 characters and descriptions under 158 so Google shows
 *  them whole. "Spiritual & wealth coach" is how she describes her work. */
export const HOME_SEO: Record<
  StorefrontLang,
  { title: string; description: string; siteName: string; locale: string }
> = {
  en: {
    title: "Spiritual & Wealth Coach in Canada | Svitlana Pavliuk",
    description:
      "Spiritual and wealth coaching with Svitlana Pavliuk, online across Canada in English or Ukrainian. A weekly women's Circle and private sessions. Start free.",
    siteName: "Svitlana's Soul Services",
    locale: "en_CA",
  },
  uk: {
    title: "Духовний коуч і коуч достатку | Світлана Павлюк",
    description:
      "Духовний коучинг і коучинг достатку зі Світланою Павлюк — онлайн українською по всій Канаді. Щотижневе жіноче коло та особисті сесії. Почніть безкоштовно.",
    siteName: "Svitlana's Soul Services",
    locale: "uk_UA",
  },
};

/** Title, description, canonical + hreflang and the social preview for one
 *  bilingual storefront page. `path` is the English (unprefixed) path. */
export function storefrontPageMetadata(opts: {
  lang: StorefrontLang;
  path: string;
  title: string;
  description: string;
  imageUrl: string | null;
}): Metadata {
  const { lang, path, title, description, imageUrl } = opts;
  const s = HOME_SEO[lang];
  const alternates = storefrontAlternates(path, lang);
  return {
    title: { absolute: title },
    description,
    alternates,
    openGraph: {
      type: "website",
      url: alternates.canonical as string,
      siteName: s.siteName,
      title,
      description,
      locale: s.locale,
      alternateLocale: lang === "uk" ? "en_CA" : "uk_UA",
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

/** Full metadata for the homepage in one language. */
export function homeMetadata(
  lang: StorefrontLang,
  imageUrl: string | null
): Metadata {
  const s = HOME_SEO[lang];
  return storefrontPageMetadata({
    lang,
    path: "/",
    title: s.title,
    description: s.description,
    imageUrl,
  });
}

type OfferForSchema = { title: string; price: string; description: string };

/** Her offers as schema.org Offers (CAD). Offers whose price isn't a number
 *  ("Ask me", say) are left out rather than guessed. */
export function schemaOffers(offers: OfferForSchema[]): Record<string, unknown>[] {
  return offers.flatMap((o) => {
    const price = parsePrice(o.price);
    if (price === null) return [];
    return [
      {
        "@type": "Offer",
        price,
        priceCurrency: "CAD",
        itemOffered: {
          "@type": "Service",
          name: o.title,
          description: o.description || undefined,
        },
      },
    ];
  });
}

/** The practice, as other pages refer to it (the full entity is on "/"). */
export const PRACTICE_REF = {
  "@type": "ProfessionalService",
  "@id": `${CANONICAL_ORIGIN}/#practice`,
  name: HOME_SEO.en.siteName,
  url: CANONICAL_ORIGIN,
};

/** Schema.org graph for the homepage: who she is (Person), the practice
 *  (ProfessionalService, serving all of Canada online), and the website.
 *  Kept apart from her other business — this entity is Soul Services only. */
export function storefrontJsonLd(
  lang: StorefrontLang,
  opts: { portraitUrl: string | null; offers: OfferForSchema[] }
): Record<string, unknown> {
  const s = HOME_SEO[lang];
  const personId = `${CANONICAL_ORIGIN}/#svitlana`;
  const businessId = `${CANONICAL_ORIGIN}/#practice`;
  const image = opts.portraitUrl?.startsWith("http") ? opts.portraitUrl : undefined;

  const makesOffer = schemaOffers(opts.offers);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": personId,
        name: lang === "uk" ? "Світлана Павлюк" : "Svitlana Pavliuk",
        alternateName: lang === "uk" ? "Svitlana Pavliuk" : "Світлана Павлюк",
        jobTitle:
          lang === "uk"
            ? "Духовний коуч і коуч достатку"
            : "Spiritual and Wealth Coach",
        knowsLanguage: ["en", "uk"],
        image,
        url: CANONICAL_ORIGIN,
        worksFor: { "@id": businessId },
      },
      {
        "@type": "ProfessionalService",
        "@id": businessId,
        name: s.siteName,
        description: s.description,
        url: CANONICAL_ORIGIN + localePath(lang, "/"),
        email: "hello@svit.live",
        image,
        founder: { "@id": personId },
        address: {
          "@type": "PostalAddress",
          addressLocality: "Edmonton",
          addressRegion: "AB",
          addressCountry: "CA",
        },
        areaServed: { "@type": "Country", name: "Canada" },
        availableLanguage: ["English", "Ukrainian"],
        makesOffer: makesOffer.length ? makesOffer : undefined,
      },
      {
        "@type": "WebSite",
        "@id": `${CANONICAL_ORIGIN}/#website`,
        url: CANONICAL_ORIGIN,
        name: s.siteName,
        inLanguage: ["en", "uk"],
        publisher: { "@id": businessId },
      },
    ],
  };
}

/** "$1,000" → 1000, "Free" / "Безкоштовно" → 0, anything else → null. */
function parsePrice(price: string): number | null {
  const t = price.trim();
  if (/^(free|безкоштовно)$/i.test(t)) return 0;
  const m = t.replace(/[,\s]/g, "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}
