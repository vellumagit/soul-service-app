// Resolving a stored review into the language the visitor is reading.
//
// The fallback rule is the whole point of this file: a review is one row with
// two sets of words, and a missing translation must never render as an empty
// quote. If the Ukrainian text is blank we show the English (and vice versa),
// so a review is publishable the moment it exists in ONE language and improves
// silently when she adds the other.

import type { LandingLang } from "./landing-copy";

/** The columns any renderer needs. Kept structural so both the DB row and a
 *  dictionary-seeded default satisfy it. */
export type ReviewRow = {
  id: string;
  quoteEn: string;
  quoteUk: string;
  authorEn: string;
  authorUk: string;
  photoUrl: string | null;
};

export type RenderedReview = {
  id: string;
  quote: string;
  author: string;
  photoUrl: string | null;
};

/** Pick the words for this language, falling back to the other one. */
export function reviewForLang(r: ReviewRow, lang: LandingLang): RenderedReview {
  const primaryQuote = lang === "uk" ? r.quoteUk : r.quoteEn;
  const otherQuote = lang === "uk" ? r.quoteEn : r.quoteUk;
  const primaryAuthor = lang === "uk" ? r.authorUk : r.authorEn;
  const otherAuthor = lang === "uk" ? r.authorEn : r.authorUk;

  return {
    id: r.id,
    quote: primaryQuote.trim() || otherQuote.trim(),
    author: primaryAuthor.trim() || otherAuthor.trim(),
    photoUrl: r.photoUrl,
  };
}

/** Drop anything that ended up with no words at all in either language. */
export function renderReviews(
  rows: ReviewRow[],
  lang: LandingLang
): RenderedReview[] {
  return rows.map((r) => reviewForLang(r, lang)).filter((r) => r.quote);
}
