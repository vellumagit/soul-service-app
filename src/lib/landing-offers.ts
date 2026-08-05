// Resolving stored offers into the language the visitor is reading, and into
// the shape the storefront ladder renders.
//
// Same fallback rule as reviews: a missing translation shows the other
// language rather than an empty card. The difference is what happens when the
// list is EMPTY — reviews hide their section, offers fall back to the six
// built-in ones. This section is the commercial spine of the page; it must
// never be possible to end up with a storefront that sells nothing.

import type { LandingCopy, LandingLang } from "./landing-copy";

export type OfferLinkKind = "quiz" | "circle" | "contact" | "custom";
export type OfferVariant = "plain" | "free" | "feature";

export const OFFER_LINK_KINDS: OfferLinkKind[] = [
  "quiz",
  "circle",
  "contact",
  "custom",
];
export const OFFER_VARIANTS: OfferVariant[] = ["plain", "free", "feature"];


/** The stored columns any renderer needs. */
export type OfferRow = {
  id: string;
  stepEn: string;
  stepUk: string;
  titleEn: string;
  titleUk: string;
  priceEn: string;
  priceUk: string;
  priceSuffixEn: string;
  priceSuffixUk: string;
  descriptionEn: string;
  descriptionUk: string;
  ctaEn: string;
  ctaUk: string;
  linkKind: string;
  customHref: string | null;
  variant: string;
  rowId: string | null;
};

/** A row of the ladder, as stored. The heading is optional. */
export type OfferRowGroup = {
  id: string;
  titleEn: string;
  titleUk: string;
  sortOrder: number;
};

/** A row resolved for rendering: its heading in this language (possibly
 *  empty, which means "no heading") plus the cards that belong to it. */
export type RenderedRow = {
  id: string;
  title: string;
  offers: RenderedOffer[];
};

export type RenderedOffer = {
  id: string;
  step: string;
  title: string;
  price: string;
  priceSuffix: string;
  description: string;
  cta: string;
  href: string;
  variant: OfferVariant;
  rowId: string | null;
};

/** Pick the words for this language, falling back to the other one. */
function pick(primary: string, other: string): string {
  return primary.trim() || other.trim();
}

/**
 * Where an offer's button goes.
 *
 * 'circle' is resolved by the caller (the soonest bookable Circle, or the
 * contact form when sign-ups are closed) — that's why it's passed in rather
 * than stored.
 */
function resolveHref(
  row: OfferRow,
  circleHref: string
): string {
  switch (row.linkKind) {
    case "quiz":
      return "/quiz";
    case "circle":
      return circleHref;
    case "custom":
      return row.customHref?.trim() || "#contact";
    case "contact":
    default:
      return "#contact";
  }
}

function asVariant(v: string): OfferVariant {
  return (OFFER_VARIANTS as string[]).includes(v)
    ? (v as OfferVariant)
    : "plain";
}

export function offerForLang(
  row: OfferRow,
  lang: LandingLang,
  circleHref: string
): RenderedOffer {
  const uk = lang === "uk";
  return {
    id: row.id,
    step: uk ? pick(row.stepUk, row.stepEn) : pick(row.stepEn, row.stepUk),
    title: uk ? pick(row.titleUk, row.titleEn) : pick(row.titleEn, row.titleUk),
    price: uk ? pick(row.priceUk, row.priceEn) : pick(row.priceEn, row.priceUk),
    priceSuffix: uk
      ? pick(row.priceSuffixUk, row.priceSuffixEn)
      : pick(row.priceSuffixEn, row.priceSuffixUk),
    description: uk
      ? pick(row.descriptionUk, row.descriptionEn)
      : pick(row.descriptionEn, row.descriptionUk),
    cta: uk ? pick(row.ctaUk, row.ctaEn) : pick(row.ctaEn, row.ctaUk),
    href: resolveHref(row, circleHref),
    variant: asVariant(row.variant),
    rowId: row.rowId,
  };
}

/** Drop anything with no title in either language — an untitled card is noise. */
export function renderOffers(
  rows: OfferRow[],
  lang: LandingLang,
  circleHref: string
): RenderedOffer[] {
  return rows
    .map((r) => offerForLang(r, lang, circleHref))
    .filter((o) => o.title);
}

/**
 * Group offers into her rows, in her row order.
 *
 * An offer whose row was deleted out from under it (or which predates the
 * backfill) lands in the FIRST row rather than vanishing — a card silently
 * disappearing from a storefront is the worse failure. Empty rows are dropped,
 * so a row she cleared doesn't leave a heading over nothing.
 */
export function groupOffersIntoRows(
  rows: OfferRowGroup[],
  offers: RenderedOffer[],
  lang: LandingLang
): RenderedRow[] {
  const ordered = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  if (ordered.length === 0) {
    return offers.length ? [{ id: "all", title: "", offers }] : [];
  }
  const known = new Set(ordered.map((r) => r.id));
  const firstId = ordered[0].id;
  const buckets = new Map<string, RenderedOffer[]>(
    ordered.map((r) => [r.id, []])
  );
  for (const o of offers) {
    const target = o.rowId && known.has(o.rowId) ? o.rowId : firstId;
    buckets.get(target)!.push(o);
  }
  return ordered
    .map((r) => ({
      id: r.id,
      title: (lang === "uk" ? r.titleUk : r.titleEn).trim() ||
        (lang === "uk" ? r.titleEn : r.titleUk).trim(),
      offers: buckets.get(r.id) ?? [],
    }))
    .filter((r) => r.offers.length > 0);
}

/**
 * The six built-in offers, in the visitor's language — used when an account
 * has no offer rows at all (a fresh account, or one where she deleted every
 * offer). Reads the same copy dictionary the rest of the storefront uses, so
 * her Settings → Landing page overrides still apply to them.
 */
export function builtInOffers(
  c: LandingCopy,
  circleHref: string
): RenderedOffer[] {
  const w = c.ways;
  return [
    {
      id: "builtin-quiz",
      step: w.quiz.step,
      title: w.quiz.title,
      price: w.quiz.price,
      priceSuffix: "",
      description: w.quiz.desc,
      cta: w.quiz.cta,
      href: "/quiz",
      variant: "free",
      rowId: "builtin-row-1",
    },
    {
      id: "builtin-circle",
      step: w.circle.step,
      title: w.circle.title,
      price: w.circle.price,
      priceSuffix: w.perSession,
      description: w.circle.desc,
      cta: w.circle.cta,
      href: circleHref,
      variant: "plain",
      rowId: "builtin-row-1",
    },
    {
      id: "builtin-single",
      step: w.single.step,
      title: w.single.title,
      price: w.single.price,
      priceSuffix: "",
      description: w.single.desc,
      cta: w.single.cta,
      href: "#contact",
      variant: "plain",
      rowId: "builtin-row-1",
    },
    {
      id: "builtin-retainer",
      step: w.retainer.step,
      title: w.retainer.title,
      price: w.retainer.price,
      priceSuffix: w.perMonth,
      description: w.retainer.desc,
      cta: w.retainer.cta,
      href: "#contact",
      variant: "plain",
      rowId: "builtin-row-2",
    },
    {
      id: "builtin-journey",
      step: w.journey.step,
      title: w.journey.title,
      price: w.journey.price,
      priceSuffix: w.per3Months,
      description: w.journey.desc,
      cta: w.journey.cta,
      href: "#contact",
      variant: "feature",
      rowId: "builtin-row-2",
    },
    {
      id: "builtin-talk",
      step: w.talk.step,
      title: w.talk.title,
      price: w.talk.price,
      priceSuffix: w.aRealConversation,
      description: w.talk.desc,
      cta: w.talk.cta,
      href: "#contact",
      variant: "plain",
      rowId: "builtin-row-2",
    },
  ];
}

/** The built-in ladder as two unheaded rows — the shape the page renders when
 *  she has no offers of her own. */
export function builtInRows(
  c: LandingCopy,
  circleHref: string
): RenderedRow[] {
  const all = builtInOffers(c, circleHref);
  return [
    { id: "builtin-row-1", title: "", offers: all.filter((o) => o.rowId === "builtin-row-1") },
    { id: "builtin-row-2", title: "", offers: all.filter((o) => o.rowId === "builtin-row-2") },
  ];
}
