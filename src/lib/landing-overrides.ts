// Editable storefront copy — the "voice-carrying" blocks Svitlana can rewrite
// in BOTH English and Ukrainian from Settings → Landing page.
//
// Design: the hand-written dictionary (src/lib/landing-copy.tsx) stays the
// source of truth and the default. This layer patches individual fields on top
// of it, per language. A blank/absent override always falls back to the
// dictionary — so clearing a field restores the original wording, and we can
// never end up with an empty storefront.
//
// Structural bits (nav labels, prices, "/ month", CTA button text) are
// deliberately NOT editable — they're tied to layout and real pricing.

import type { LandingCopy, LandingLang } from "./landing-copy";
import type { LandingSectionSlug } from "./landing-sections";

/** Stored shape on practitioner_settings.landingCopyOverrides. */
export type LandingCopyOverrides = Partial<
  Record<LandingLang, Record<string, string>>
>;

export type LandingOverrideField = {
  key: string;
  /** Which storefront section this line belongs to. Drives which card in
   *  Settings → Landing page opens it. */
  section: LandingSectionSlug;
  label: string;
  hint?: string;
  /** Render as a textarea rather than a single-line input. */
  multiline?: boolean;
  /** Current dictionary text, used as the placeholder. Omitted for fields the
   *  design renders with italic emphasis (they're ReactNode, not plain text). */
  plain?: (c: LandingCopy) => string;
  /** Immutably patch the dictionary with her text. */
  apply: (c: LandingCopy, v: string) => LandingCopy;
};

const EMPHASIS_HINT =
  "Leave blank to keep the current wording. Your text replaces the styled headline as plain text.";

export const LANDING_OVERRIDE_FIELDS: LandingOverrideField[] = [
  // ── Hero ────────────────────────────────────────────────────────────────
  {
    key: "heroEyebrow",
    section: "hero",
    label: "Eyebrow (small line above the headline)",
    plain: (c) => c.hero.eyebrow,
    apply: (c, v) => ({ ...c, hero: { ...c.hero, eyebrow: v } }),
  },
  {
    key: "heroTitle",
    section: "hero",
    label: "Headline",
    hint: EMPHASIS_HINT,
    multiline: true,
    apply: (c, v) => ({ ...c, hero: { ...c.hero, title: v } }),
  },
  {
    key: "heroSub",
    section: "hero",
    label: "Sub-headline",
    multiline: true,
    plain: (c) => c.hero.sub,
    apply: (c, v) => ({ ...c, hero: { ...c.hero, sub: v } }),
  },

  // ── Who I am ────────────────────────────────────────────────────────────
  {
    key: "aboutTitle",
    section: "about",
    label: "Heading",
    plain: (c) => c.about.title,
    apply: (c, v) => ({ ...c, about: { ...c.about, title: v } }),
  },
  {
    key: "aboutP1",
    section: "about",
    label: "First paragraph",
    multiline: true,
    plain: (c) => c.about.p1,
    apply: (c, v) => ({ ...c, about: { ...c.about, p1: v } }),
  },
  {
    key: "aboutP2",
    section: "about",
    label: "Second paragraph",
    hint: EMPHASIS_HINT,
    multiline: true,
    apply: (c, v) => ({ ...c, about: { ...c.about, p2: v } }),
  },

  // ── Section intros ──────────────────────────────────────────────────────
  {
    key: "acheBody",
    section: "ache",
    label: "Intro",
    hint: EMPHASIS_HINT,
    multiline: true,
    apply: (c, v) => ({ ...c, ache: { ...c.ache, body: v } }),
  },
  {
    key: "reframeBody",
    section: "reframe",
    label: "Body",
    multiline: true,
    plain: (c) => c.reframe.body,
    apply: (c, v) => ({ ...c, reframe: { ...c.reframe, body: v } }),
  },
  {
    key: "waysBody",
    section: "ways",
    label: "Intro above your offers",
    multiline: true,
    plain: (c) => c.ways.body,
    apply: (c, v) => ({ ...c, ways: { ...c.ways, body: v } }),
  },
  {
    key: "circlesBody",
    section: "circles",
    label: "Intro",
    multiline: true,
    plain: (c) => c.circles.body,
    apply: (c, v) => ({ ...c, circles: { ...c.circles, body: v } }),
  },
  {
    key: "contactBody",
    section: "contact",
    label: "Intro",
    multiline: true,
    plain: (c) => c.contact.body,
    apply: (c, v) => ({ ...c, contact: { ...c.contact, body: v } }),
  },
  {
    key: "finalBody",
    section: "final",
    label: "Body",
    multiline: true,
    plain: (c) => c.final.body,
    apply: (c, v) => ({ ...c, final: { ...c.final, body: v } }),
  },

  // ── Reviews + Library headings ──────────────────────────────────────────
  {
    key: "voicesTag",
    section: "voices",
    label: "Small line above the heading",
    plain: (c) => c.voices.tag,
    apply: (c, v) => ({ ...c, voices: { ...c.voices, tag: v } }),
  },
  {
    key: "voicesTitle",
    section: "voices",
    label: "Heading",
    hint: EMPHASIS_HINT,
    apply: (c, v) => ({ ...c, voices: { ...c.voices, title: v } }),
  },
];

/** The editable lines belonging to one storefront section. Sections with no
 *  entries (the hero aside, everything is optional) render a card that says
 *  so rather than an empty dialog. */
export function fieldsForSection(
  section: LandingSectionSlug
): LandingOverrideField[] {
  return LANDING_OVERRIDE_FIELDS.filter((f) => f.section === section);
}

/** Patch the dictionary with her saved copy for one language. Blank → default. */
export function applyLandingOverrides(
  base: LandingCopy,
  overrides: LandingCopyOverrides | null | undefined,
  lang: LandingLang
): LandingCopy {
  const forLang = overrides?.[lang];
  if (!forLang) return base;
  let out = base;
  for (const f of LANDING_OVERRIDE_FIELDS) {
    const v = forLang[f.key];
    if (typeof v === "string" && v.trim()) out = f.apply(out, v.trim());
  }
  return out;
}

/** Form field name for one language + key (e.g. "lc_uk_heroSub"). */
export function landingOverrideInputName(
  lang: LandingLang,
  key: string
): string {
  return `lc_${lang}_${key}`;
}

/**
 * Patch ONE section's copy into her stored overrides.
 *
 * Merging, not rebuilding: each section is now saved from its own dialog, so a
 * form that only carries the hero's three boxes must leave every other
 * section's wording alone. Rebuilding from the submitted form — which is what
 * this did when all the fields lived in one giant form — would wipe the rest.
 *
 * Blank still means "use the built-in wording", so clearing a box deletes that
 * key rather than storing "".
 */
export function mergeSectionOverrides(
  existing: LandingCopyOverrides | null | undefined,
  section: LandingSectionSlug,
  formData: FormData
): LandingCopyOverrides {
  const out: LandingCopyOverrides = {
    en: { ...(existing?.en ?? {}) },
    uk: { ...(existing?.uk ?? {}) },
  };
  for (const lang of ["en", "uk"] as const) {
    for (const f of fieldsForSection(section)) {
      const raw = String(formData.get(landingOverrideInputName(lang, f.key)) ?? "")
        .trim()
        .slice(0, 4000);
      const bucket = out[lang]!;
      if (raw) bucket[f.key] = raw;
      else delete bucket[f.key];
    }
  }
  // Drop keys for fields that no longer exist (the offer descriptions moved to
  // Settings → Offers) so stale entries don't linger forever.
  const known = new Set(LANDING_OVERRIDE_FIELDS.map((f) => f.key));
  for (const lang of ["en", "uk"] as const) {
    for (const k of Object.keys(out[lang]!)) {
      if (!known.has(k)) delete out[lang]![k];
    }
  }
  return out;
}
