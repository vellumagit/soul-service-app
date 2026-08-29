// The storefront's sections, as a catalogue.
//
// These are PRESET — the page is built from a fixed set of blocks, and this
// file is the single place that names them, orders them by default, and says
// which ones she's allowed to hide. Settings → Landing page renders one card
// per entry; page.tsx renders the blocks in the order this resolves to.
//
// Adding a section to the storefront means adding it here AND adding its node
// in page.tsx under the same slug. Two places, deliberately side by side.

export type LandingSectionSlug =
  | "hero"
  | "ache"
  | "reframe"
  | "about"
  | "ways"
  | "voices"
  | "circles"
  | "library"
  | "contact"
  | "final";

export type LandingSectionMeta = {
  slug: LandingSectionSlug;
  /** What she calls it — matches what she'd recognise on the page. */
  label: string;
  blurb: string;
  /** false → the card shows no Hide button. The hero is the top of the page;
   *  a storefront that opens on "Does this feel familiar?" is broken, not
   *  customised. */
  canHide: boolean;
  /** false → pinned in place (the hero stays first). */
  canMove: boolean;
  /** Sections whose appearance ALSO depends on live data, so hiding isn't the
   *  only reason they might not show. Surfaced in the UI so an absent section
   *  doesn't read as a bug. */
  conditional?: string;
  /** Managed elsewhere in Settings — the card links there instead of
   *  pretending its content is edited here. */
  managedAt?: { label: string; note: string };
};

export const LANDING_SECTIONS: LandingSectionMeta[] = [
  {
    slug: "hero",
    label: "Opening",
    blurb: "The first thing visitors see — the compass, your headline, the two buttons.",
    canHide: false,
    canMove: false,
  },
  {
    slug: "ache",
    label: "Does this feel familiar?",
    blurb: "The three quiet lines that name what they're carrying.",
    canHide: true,
    canMove: true,
  },
  {
    slug: "reframe",
    label: "There's nothing wrong with you",
    blurb: "The turn — your compass isn't broken, it's out of alignment.",
    canHide: true,
    canMove: true,
  },
  {
    slug: "about",
    label: "Who I am",
    blurb: "Your portrait and your story.",
    canHide: true,
    canMove: true,
  },
  {
    slug: "ways",
    label: "Ways to work together",
    blurb: "The heading and intro above your offers.",
    canHide: true,
    canMove: true,
    managedAt: {
      label: "Offers",
      note: "The cards themselves live in Settings → Offers.",
    },
  },
  {
    slug: "voices",
    label: "Reviews",
    blurb: "What people say about working with you.",
    canHide: true,
    canMove: true,
    conditional: "Only shows when you have at least one review.",
    managedAt: {
      label: "Reviews",
      note: "The reviews themselves live in Settings → Reviews.",
    },
  },
  {
    slug: "circles",
    label: "Upcoming Circles",
    blurb: "The next few Circles, bookable straight from the page.",
    canHide: true,
    canMove: true,
    conditional:
      "Only shows when Circle sign-ups are open AND there's an upcoming Circle.",
  },
  {
    slug: "library",
    label: "Library",
    blurb: "Your recorded workshops and replays.",
    canHide: true,
    canMove: true,
    conditional: "Only shows when you have a published offering.",
  },
  {
    slug: "contact",
    label: "Send a note",
    blurb: "The inquiry form — where people reach you.",
    canHide: true,
    canMove: true,
  },
  {
    slug: "final",
    label: "Closing",
    blurb: "The last word before the footer.",
    canHide: true,
    canMove: true,
  },
];

export function findLandingSection(
  slug: string
): LandingSectionMeta | undefined {
  return LANDING_SECTIONS.find((s) => s.slug === slug);
}

/** Her stored arrangement, as it comes out of the DB. */
export type SectionArrangementRow = {
  slug: string;
  sortOrder: number;
  visible: boolean;
};

export type ResolvedSection = LandingSectionMeta & {
  sortOrder: number;
  visible: boolean;
};

/**
 * Merge the catalogue with her stored arrangement.
 *
 * A slug with no row keeps its built-in position and shows — so a section
 * added in a future release appears for everyone without a migration, rather
 * than silently vanishing because nobody has a row for it.
 */
export function resolveSections(
  rows: SectionArrangementRow[]
): ResolvedSection[] {
  const byslug = new Map(rows.map((r) => [r.slug, r]));
  return LANDING_SECTIONS.map((meta, i) => {
    const row = byslug.get(meta.slug);
    return {
      ...meta,
      sortOrder: row ? row.sortOrder : i,
      // The hero can't be hidden however old the stored row is.
      visible: meta.canHide ? (row ? row.visible : true) : true,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Just the slugs, in her order, that should render. */
export function visibleSectionOrder(
  rows: SectionArrangementRow[]
): LandingSectionSlug[] {
  return resolveSections(rows)
    .filter((s) => s.visible)
    .map((s) => s.slug);
}
