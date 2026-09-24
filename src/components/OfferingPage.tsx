// One public offering page — /womens-circle, /private-sessions, /coaching
// (and /uk/…). The words come from offering-pages.ts; the price cards are her
// LIVE offers, the ones she's pointed at this page in Settings → Offers, so
// they can never quote an old price. The Circle page also lists the next
// bookable Circles.
//
// Built for search: one H1 per page, an FAQ section marked up as FAQPage,
// a Service + breadcrumb graph, and links to the other two pages.

import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitionerSettings } from "@/db/schema";
import { listLandingOffers } from "@/db/queries";
import { GoogleAnalytics } from "./GoogleAnalytics";
import { JsonLd } from "./JsonLd";
import { StorefrontFooter, StorefrontNav } from "./StorefrontChrome";
import { TimeOfDayProvider } from "./TimeOfDayProvider";
import { getLandingCopy, type LandingLang } from "@/lib/landing-copy";
import { getLandingLang } from "@/lib/landing-lang";
import {
  builtInOffers,
  OFFER_PAGES,
  renderOffers,
  type OfferPage,
  type RenderedOffer,
} from "@/lib/landing-offers";
import { listUpcomingPublicGroupSessions } from "@/lib/group-actions";
import { OFFERING_CHROME, OFFERING_COPY } from "@/lib/offering-pages";
import { publishedArticles } from "@/lib/journal";
import { resolveStorefrontAccountId } from "@/lib/storefront-account";
import { storefrontPortraitUrl } from "@/lib/storefront-portrait";
import {
  CANONICAL_ORIGIN,
  HOME_SEO,
  localePath,
  PRACTICE_REF,
  schemaOffers,
  storefrontPageMetadata,
} from "@/lib/storefront-seo";
import { resolveTimeZone } from "@/lib/timezone";

export async function offeringMetadata(slug: OfferPage): Promise<Metadata> {
  const lang = await getLandingLang();
  const copy = OFFERING_COPY[slug][lang];
  return storefrontPageMetadata({
    lang,
    path: `/${slug}`,
    title: copy.metaTitle,
    description: copy.metaDescription,
    imageUrl: await storefrontPortraitUrl(),
  });
}

type UpcomingCircle = Awaited<
  ReturnType<typeof listUpcomingPublicGroupSessions>
>[number];

/** "#contact" → "/uk#contact": the contact form lives on the homepage. */
function pageHref(lang: LandingLang, href: string): string {
  return localePath(lang, href.startsWith("#") ? `/${href}` : href);
}

export async function OfferingPage({ slug }: { slug: OfferPage }) {
  const lang = await getLandingLang();
  const copy = OFFERING_COPY[slug][lang];
  const chrome = OFFERING_CHROME[lang];
  const landing = getLandingCopy(lang);
  const contactHref = localePath(lang, "/#contact");

  // Her offers for this page, the next Circles, and where "join" goes.
  // Everything degrades: no DB → the built-in offers, no Circles listed.
  let offers: RenderedOffer[] = [];
  let upcoming: UpcomingCircle[] = [];
  let circleHref = contactHref;
  let practiceTz = resolveTimeZone(null);
  let ownOffers: RenderedOffer[] | null = null;
  try {
    const accountId = await resolveStorefrontAccountId();
    if (accountId) {
      const [cfg] = await db
        .select({
          circleSignupsOpen: practitionerSettings.circleSignupsOpen,
          timezone: practitionerSettings.timezone,
        })
        .from(practitionerSettings)
        .where(eq(practitionerSettings.accountId, accountId))
        .limit(1);
      practiceTz = resolveTimeZone(cfg?.timezone);
      if (cfg?.circleSignupsOpen) {
        upcoming = await listUpcomingPublicGroupSessions(4, accountId);
        // Circles in the reader's language first; nothing is hidden.
        upcoming = [...upcoming].sort(
          (a, b) =>
            (a.language === lang ? 0 : 1) - (b.language === lang ? 0 : 1)
        );
        const open = upcoming.find((c) => c.capacity - c.spotsTaken > 0);
        if (open) circleHref = `/circles/${open.sessionId}`;
      }
      const rows = await listLandingOffers(accountId, { publishedOnly: true });
      if (rows.length > 0) ownOffers = renderOffers(rows, lang, circleHref);
    }
  } catch (err) {
    console.warn(`[offering:${slug}] load failed:`, err);
  }
  offers = (ownOffers ?? builtInOffers(landing, circleHref))
    .filter((o) => o.page === slug)
    .map((o) => ({ ...o, href: pageHref(lang, o.href) }));

  const ctaHref =
    copy.ctaTarget === "circle" ? circleHref : contactHref;
  const ctaLabel =
    copy.ctaTarget === "circle" && circleHref === contactHref
      ? chrome.noteButton
      : copy.ctaButton;

  const url = CANONICAL_ORIGIN + localePath(lang, `/${slug}`);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `${url}#service`,
        name: copy.name,
        description: copy.metaDescription,
        url,
        inLanguage: lang,
        provider: PRACTICE_REF,
        areaServed: { "@type": "Country", name: "Canada" },
        availableLanguage: ["English", "Ukrainian"],
        offers: schemaOffers(offers),
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: copy.faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: HOME_SEO[lang].siteName,
            item: CANONICAL_ORIGIN + localePath(lang, "/"),
          },
          { "@type": "ListItem", position: 2, name: copy.name, item: url },
        ],
      },
    ],
  };

  const others = OFFER_PAGES.filter((p) => p !== slug);

  return (
    <>
      <JsonLd data={jsonLd} />
      <TimeOfDayProvider />
      <GoogleAnalytics />
      <div className="landing-root offering">
        <StorefrontNav lang={lang} />

        <header className="hero">
          <div className="wrap">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.h1}</h1>
            {copy.intro.map((p, i) => (
              <p key={i} className="sub">
                {p}
              </p>
            ))}
            <div className="btns">
              <a href={ctaHref} className="btn btn-pri">
                {ctaLabel}
              </a>
            </div>
          </div>
        </header>

        {offers.length > 0 && (
          <section className="ways">
            <div className="wrap narrow">
              <h2>{copy.pricesTitle}</h2>
              {/* "A monthly Circle pass, payment plans…" — about the Circle;
                  the other pages cover payment plans in their FAQs. */}
              {slug === "womens-circle" && (
                <p className="p-lg">{landing.ways.note}</p>
              )}
            </div>
            <div className="wrap ladder">
              <div className="lane offering-lane">
                {offers.map((o) => (
                  <div
                    key={o.id}
                    className={`card${
                      o.variant === "free" ? " free" : o.variant === "feature" ? " feat" : ""
                    }`}
                  >
                    {o.step && <span className="step">{o.step}</span>}
                    <h3>{o.title}</h3>
                    {o.price && (
                      <div className="price">
                        {o.price}
                        {o.priceSuffix && <small> {o.priceSuffix}</small>}
                      </div>
                    )}
                    {o.description && <p className="desc">{o.description}</p>}
                    {o.cta && (
                      <a href={o.href} className="cta">
                        {o.cta}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {slug === "womens-circle" && (
          <section className="offering-upcoming">
            <div className="wrap narrow">
              <h2>{chrome.upcomingTitle}</h2>
              {upcoming.length === 0 ? (
                <p className="p-lg">
                  {chrome.noUpcoming}{" "}
                  <a href={contactHref}>{chrome.noteButton}</a>
                </p>
              ) : (
                <ul className="offering-dates">
                  {upcoming.map((c) => {
                    const left = Math.max(0, c.capacity - c.spotsTaken);
                    const when = c.scheduledAt.toLocaleString(
                      lang === "uk" ? "uk-UA" : "en-CA",
                      {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: practiceTz,
                        timeZoneName: "short",
                      }
                    );
                    return (
                      <li key={c.sessionId}>
                        <div>
                          <strong>{when}</strong>
                          <span className="offering-meta">
                            {chrome.circleLang(c.language === "uk" ? "uk" : "en")}
                            {" · "}
                            {left > 0 ? chrome.seatsLeft(left) : chrome.full}
                          </span>
                        </div>
                        {left > 0 && (
                          <Link href={`/circles/${c.sessionId}`} className="cta">
                            {chrome.holdSeat}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}

        <section className="offering-body">
          <div className="wrap narrow">
            <h2>{copy.includedTitle}</h2>
            <ul className="offering-list">
              {copy.included.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h2>{copy.stepsTitle}</h2>
            <ol className="offering-steps">
              {copy.steps.map((s) => (
                <li key={s.h}>
                  <h3>{s.h}</h3>
                  <p>{s.p}</p>
                </li>
              ))}
            </ol>

            <h2>{copy.forYouTitle}</h2>
            <ul className="offering-list">
              {copy.forYou.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h2>{copy.faqTitle}</h2>
            <div className="offering-faq">
              {copy.faqs.map((f) => (
                <details key={f.q}>
                  <summary>
                    <h3>{f.q}</h3>
                  </summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
            <p className="offering-ask">
              {chrome.askNote} <a href={contactHref}>{chrome.askLink}</a>
            </p>
          </div>
        </section>

        <section className="final">
          <div className="wrap narrow">
            <h2>{copy.ctaTitle}</h2>
            <p className="p-lg">{copy.ctaBody}</p>
            <a href={ctaHref} className="btn btn-pri">
              {ctaLabel}
            </a>
          </div>
        </section>

        <section className="offering-others">
          <div className="wrap narrow">
            <h2>{chrome.otherWays}</h2>
            <ul>
              {others.map((p) => (
                <li key={p}>
                  <Link href={localePath(lang, `/${p}`)}>
                    {OFFERING_COPY[p][lang].name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <StorefrontFooter lang={lang} showJournal={publishedArticles().length > 0} />
      </div>
    </>
  );
}
