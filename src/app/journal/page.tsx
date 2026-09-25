// The Journal index: /journal and /uk/journal. Lists published articles only
// (drafts stay reachable by direct link). Until something is published the
// page doesn't exist — a 404, not an empty shelf.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { StorefrontFooter, StorefrontNav } from "@/components/StorefrontChrome";
import { TimeOfDayProvider } from "@/components/TimeOfDayProvider";
import { JOURNAL_CHROME, publishedArticles } from "@/lib/journal";
import { getLandingLang } from "@/lib/landing-lang";
import { storefrontPortraitUrl } from "@/lib/storefront-portrait";
import { localePath, storefrontPageMetadata } from "@/lib/storefront-seo";
import "../landing.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLandingLang();
  const c = JOURNAL_CHROME[lang];
  const meta = storefrontPageMetadata({
    lang,
    path: "/journal",
    title: c.metaTitle,
    description: c.metaDescription,
    imageUrl: await storefrontPortraitUrl(),
  });
  return publishedArticles().length > 0
    ? meta
    : { ...meta, robots: { index: false } };
}

export default async function JournalIndexPage() {
  const lang = await getLandingLang();
  const c = JOURNAL_CHROME[lang];
  const articles = publishedArticles();
  if (articles.length === 0) notFound();

  return (
    <>
      <TimeOfDayProvider />
      <GoogleAnalytics />
      <div className="landing-root offering journal">
        <StorefrontNav lang={lang} />
        <header className="hero">
          <div className="wrap">
            <h1>{c.name}</h1>
            <p className="sub">{c.intro}</p>
          </div>
        </header>
        <section className="journal-list">
          <div className="wrap narrow">
            {articles.length === 0 ? (
              <p className="p-lg">{c.empty}</p>
            ) : (
              <ul>
                {articles.map((a) => (
                  <li key={a.slug}>
                    <h2>
                      <Link href={localePath(lang, `/journal/${a.slug}`)}>
                        {a[lang].title}
                      </Link>
                    </h2>
                    <p>{a[lang].excerpt}</p>
                    <Link
                      href={localePath(lang, `/journal/${a.slug}`)}
                      className="cta"
                    >
                      {c.read}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <StorefrontFooter lang={lang} showJournal={articles.length > 0} />
      </div>
    </>
  );
}
