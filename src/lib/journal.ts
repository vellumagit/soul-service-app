// The Journal — Svitlana's articles, at /journal/<slug> (English) and
// /uk/journal/<slug> (Ukrainian). Each article lives in src/lib/journal/ as
// one file holding BOTH languages; the slug is shared.
//
// Articles are written in her voice, so nothing goes on the site until she's
// approved it. Unapproved drafts are set aside in content/journal-drafts/ (not
// imported, so they don't build) — see the README there for how to publish
// one. A `status: "draft"` article in ARTICLES still opens at its URL but is
// noindex, unlisted and left out of the sitemap.
//
// Body text is Markdown. Links inside a body are written per language
// ("/womens-circle" in English, "/uk/womens-circle" in Ukrainian).

import type { LandingLang } from "./landing-copy";
import type { OfferPage } from "./landing-offers";

export type ArticleText = {
  /** Page H1 and the card title on /journal. */
  title: string;
  /** <title> — under 60 characters. */
  metaTitle: string;
  /** Meta description — under 158 characters. */
  metaDescription: string;
  /** One or two sentences for the /journal card. */
  excerpt: string;
  /** Markdown, starting after the H1 (use ## for sections). */
  body: string;
  faqs: { q: string; a: string }[];
};

export type Article = {
  slug: string;
  status: "draft" | "published";
  /** YYYY-MM-DD — when it went live (or is planned to). */
  published: string;
  /** YYYY-MM-DD — last meaningful edit. */
  updated: string;
  /** The offering page the article leads to. */
  leadsTo: OfferPage;
  en: ArticleText;
  uk: ArticleText;
};

/** Newest first. Empty until she approves the first article. */
export const ARTICLES: Article[] = [];

export function getArticle(slug: string): Article | null {
  return ARTICLES.find((a) => a.slug === slug) ?? null;
}

export function publishedArticles(): Article[] {
  return ARTICLES.filter((a) => a.status === "published");
}

export const JOURNAL_CHROME: Record<
  LandingLang,
  {
    name: string;
    metaTitle: string;
    metaDescription: string;
    intro: string;
    empty: string;
    read: string;
    byline: string;
    draftBanner: string;
    faqTitle: string;
    disclaimer: string;
    back: string;
    nextStep: string;
  }
> = {
  en: {
    name: "Journal",
    metaTitle: "Journal: Notes on Coming Home to Yourself | Svitlana",
    metaDescription:
      "Gentle, practical writing from Svitlana Pavliuk on people pleasing, feeling lost, women's circles and hearing your own inner compass again.",
    intro:
      "Notes for the ones who carry everyone — on slowing down, hearing yourself, and coming home to what you already know.",
    empty: "The first notes are on their way.",
    read: "Read →",
    byline: "Svitlana Pavliuk",
    draftBanner:
      "Draft — this article isn't public yet. Only people with the link can see it, and search engines are asked to skip it.",
    faqTitle: "Questions people ask",
    disclaimer:
      "This is reflection and spiritual guidance, not medical, psychological or financial advice. If you're in crisis, call or text 9-8-8 (Canada) or call 911.",
    back: "← All notes",
    nextStep: "If this spoke to you",
  },
  uk: {
    name: "Журнал",
    metaTitle: "Журнал: нотатки про повернення до себе | Світлана",
    metaDescription:
      "Лагідні й практичні тексти Світлани Павлюк про догоджання іншим, відчуття загубленості, жіночі кола і про те, як знову почути свій внутрішній компас.",
    intro:
      "Нотатки для тих, хто тримає всіх на собі, — про те, як сповільнитися, почути себе й повернутися до того, що ви вже знаєте.",
    empty: "Перші нотатки вже в дорозі.",
    read: "Читати →",
    byline: "Світлана Павлюк",
    draftBanner:
      "Чернетка — ця стаття ще не опублікована. Її бачать лише ті, хто має посилання, а пошуковим системам сказано її пропустити.",
    faqTitle: "Питання, які часто ставлять",
    disclaimer:
      "Це роздуми й духовний супровід, а не медична, психологічна чи фінансова консультація. Якщо ви в кризі, зателефонуйте чи напишіть на 9-8-8 (Канада) або зателефонуйте 911.",
    back: "← Усі нотатки",
    nextStep: "Якщо це відгукнулося",
  },
};
