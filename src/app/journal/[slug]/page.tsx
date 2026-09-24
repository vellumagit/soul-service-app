// One Journal article: /journal/<slug> (English) and /uk/journal/<slug>
// (Ukrainian — see proxy.ts). The words live in src/lib/journal/. A draft
// renders for anyone with the link but is noindex and unlisted.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { JsonLd } from "@/components/JsonLd";
import { StorefrontFooter, StorefrontNav } from "@/components/StorefrontChrome";
import { TimeOfDayProvider } from "@/components/TimeOfDayProvider";
import { getArticle, JOURNAL_CHROME, publishedArticles } from "@/lib/journal";
import { getLandingLang } from "@/lib/landing-lang";
import { OFFERING_COPY } from "@/lib/offering-pages";
import { storefrontPortraitUrl } from "@/lib/storefront-portrait";
import {
  CANONICAL_ORIGIN,
  HOME_SEO,
  localePath,
  PRACTICE_REF,
  storefrontPageMetadata,
} from "@/lib/storefront-seo";
import "../../landing.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  const lang = await getLandingLang();
  if (!article) return { title: JOURNAL_CHROME[lang].name };
  const t = article[lang];
  const meta = storefrontPageMetadata({
    lang,
    path: `/journal/${slug}`,
    title: t.metaTitle,
    description: t.metaDescription,
    imageUrl: await storefrontPortraitUrl(),
  });
  return {
    ...meta,
    openGraph: {
      ...meta.openGraph,
      type: "article",
      publishedTime: article.published,
      modifiedTime: article.updated,
      authors: [JOURNAL_CHROME[lang].byline],
    },
    // Drafts are for her to read, not for search results.
    robots:
      article.status === "draft" ? { index: false, follow: false } : undefined,
  };
}

export default async function JournalArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();
  const lang = await getLandingLang();
  const t = article[lang];
  const chrome = JOURNAL_CHROME[lang];
  const next = OFFERING_COPY[article.leadsTo][lang];
  const portraitUrl = await storefrontPortraitUrl();
  const published = publishedArticles();
  const more = published.filter((a) => a.slug !== slug).slice(0, 3);

  const url = CANONICAL_ORIGIN + localePath(lang, `/journal/${slug}`);
  const journalUrl = CANONICAL_ORIGIN + localePath(lang, "/journal");
  const dateLabel = new Intl.DateTimeFormat(lang === "uk" ? "uk-UA" : "en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${article.updated}T00:00:00Z`));

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": `${url}#article`,
        headline: t.title,
        description: t.metaDescription,
        inLanguage: lang,
        datePublished: article.published,
        dateModified: article.updated,
        mainEntityOfPage: url,
        image: portraitUrl?.startsWith("http") ? portraitUrl : undefined,
        author: {
          "@type": "Person",
          "@id": `${CANONICAL_ORIGIN}/#svitlana`,
          name: chrome.byline,
          url: CANONICAL_ORIGIN,
        },
        publisher: PRACTICE_REF,
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: t.faqs.map((f) => ({
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
          { "@type": "ListItem", position: 2, name: chrome.name, item: journalUrl },
          { "@type": "ListItem", position: 3, name: t.title, item: url },
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <TimeOfDayProvider />
      <GoogleAnalytics />
      <div className="landing-root offering journal">
        <StorefrontNav lang={lang} />

        {article.status === "draft" && (
          <p className="journal-draft" role="note">
            {chrome.draftBanner}
          </p>
        )}

        <article className="wrap narrow journal-article">
          <Link href={localePath(lang, "/journal")} className="journal-back">
            {chrome.back}
          </Link>
          <h1>{t.title}</h1>
          <p className="journal-byline">
            {chrome.byline} ·{" "}
            <time dateTime={article.updated}>{dateLabel}</time>
          </p>

          <div className="journal-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Internal links stay in-app; anything else opens in a new tab.
                a: ({ href = "", children }) =>
                  href.startsWith("/") ? (
                    <Link href={href}>{children}</Link>
                  ) : (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  ),
              }}
            >
              {t.body}
            </ReactMarkdown>
          </div>

          <section className="offering-body journal-faq-section">
            <h2>{chrome.faqTitle}</h2>
            <div className="offering-faq">
              {t.faqs.map((f) => (
                <details key={f.q}>
                  <summary>
                    <h3>{f.q}</h3>
                  </summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          <aside className="journal-next">
            <span className="tag">{chrome.nextStep}</span>
            <h2>
              <Link href={localePath(lang, `/${article.leadsTo}`)}>
                {next.name}
              </Link>
            </h2>
            <p>{next.metaDescription}</p>
          </aside>

          <p className="journal-disclaimer">{chrome.disclaimer}</p>

          {more.length > 0 && (
            <nav className="journal-more" aria-label={chrome.name}>
              <ul>
                {more.map((a) => (
                  <li key={a.slug}>
                    <Link href={localePath(lang, `/journal/${a.slug}`)}>
                      {a[lang].title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </article>

        <StorefrontFooter lang={lang} showJournal={published.length > 0} />
      </div>
    </>
  );
}
