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

/** Stored shape on practitioner_settings.landingCopyOverrides. */
export type LandingCopyOverrides = Partial<
  Record<LandingLang, Record<string, string>>
>;

export type LandingOverrideField = {
  key: string;
  group: string;
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
    group: "Hero",
    label: "Eyebrow (small line above the headline)",
    plain: (c) => c.hero.eyebrow,
    apply: (c, v) => ({ ...c, hero: { ...c.hero, eyebrow: v } }),
  },
  {
    key: "heroTitle",
    group: "Hero",
    label: "Headline",
    hint: EMPHASIS_HINT,
    multiline: true,
    apply: (c, v) => ({ ...c, hero: { ...c.hero, title: v } }),
  },
  {
    key: "heroSub",
    group: "Hero",
    label: "Sub-headline",
    multiline: true,
    plain: (c) => c.hero.sub,
    apply: (c, v) => ({ ...c, hero: { ...c.hero, sub: v } }),
  },

  // ── Who I am ────────────────────────────────────────────────────────────
  {
    key: "aboutTitle",
    group: "Who I am",
    label: "Heading",
    plain: (c) => c.about.title,
    apply: (c, v) => ({ ...c, about: { ...c.about, title: v } }),
  },
  {
    key: "aboutP1",
    group: "Who I am",
    label: "First paragraph",
    multiline: true,
    plain: (c) => c.about.p1,
    apply: (c, v) => ({ ...c, about: { ...c.about, p1: v } }),
  },
  {
    key: "aboutP2",
    group: "Who I am",
    label: "Second paragraph",
    hint: EMPHASIS_HINT,
    multiline: true,
    apply: (c, v) => ({ ...c, about: { ...c.about, p2: v } }),
  },

  // ── Section intros ──────────────────────────────────────────────────────
  {
    key: "acheBody",
    group: "Section intros",
    label: "“Does this feel familiar?” intro",
    hint: EMPHASIS_HINT,
    multiline: true,
    apply: (c, v) => ({ ...c, ache: { ...c.ache, body: v } }),
  },
  {
    key: "reframeBody",
    group: "Section intros",
    label: "“There's nothing wrong with you” body",
    multiline: true,
    plain: (c) => c.reframe.body,
    apply: (c, v) => ({ ...c, reframe: { ...c.reframe, body: v } }),
  },
  {
    key: "waysBody",
    group: "Section intros",
    label: "“Ways to work together” intro",
    multiline: true,
    plain: (c) => c.ways.body,
    apply: (c, v) => ({ ...c, ways: { ...c.ways, body: v } }),
  },
  {
    key: "circlesBody",
    group: "Section intros",
    label: "“Upcoming Circles” intro",
    multiline: true,
    plain: (c) => c.circles.body,
    apply: (c, v) => ({ ...c, circles: { ...c.circles, body: v } }),
  },
  {
    key: "contactBody",
    group: "Section intros",
    label: "“Send a note” intro",
    multiline: true,
    plain: (c) => c.contact.body,
    apply: (c, v) => ({ ...c, contact: { ...c.contact, body: v } }),
  },
  {
    key: "finalBody",
    group: "Section intros",
    label: "Closing section body",
    multiline: true,
    plain: (c) => c.final.body,
    apply: (c, v) => ({ ...c, final: { ...c.final, body: v } }),
  },

  // ── Offer descriptions ──────────────────────────────────────────────────
  {
    key: "offerQuizDesc",
    group: "Offer descriptions",
    label: "The Quiz & Workbook",
    multiline: true,
    plain: (c) => c.ways.quiz.desc,
    apply: (c, v) => ({
      ...c,
      ways: { ...c.ways, quiz: { ...c.ways.quiz, desc: v } },
    }),
  },
  {
    key: "offerCircleDesc",
    group: "Offer descriptions",
    label: "The Circle",
    multiline: true,
    plain: (c) => c.ways.circle.desc,
    apply: (c, v) => ({
      ...c,
      ways: { ...c.ways, circle: { ...c.ways.circle, desc: v } },
    }),
  },
  {
    key: "offerSingleDesc",
    group: "Offer descriptions",
    label: "A Single Session",
    multiline: true,
    plain: (c) => c.ways.single.desc,
    apply: (c, v) => ({
      ...c,
      ways: { ...c.ways, single: { ...c.ways.single, desc: v } },
    }),
  },
  {
    key: "offerRetainerDesc",
    group: "Offer descriptions",
    label: "Monthly Retainer",
    multiline: true,
    plain: (c) => c.ways.retainer.desc,
    apply: (c, v) => ({
      ...c,
      ways: { ...c.ways, retainer: { ...c.ways.retainer, desc: v } },
    }),
  },
  {
    key: "offerJourneyDesc",
    group: "Offer descriptions",
    label: "The 3-Month Journey",
    multiline: true,
    plain: (c) => c.ways.journey.desc,
    apply: (c, v) => ({
      ...c,
      ways: { ...c.ways, journey: { ...c.ways.journey, desc: v } },
    }),
  },
  {
    key: "offerTalkDesc",
    group: "Offer descriptions",
    label: "Let's talk first",
    multiline: true,
    plain: (c) => c.ways.talk.desc,
    apply: (c, v) => ({
      ...c,
      ways: { ...c.ways, talk: { ...c.ways.talk, desc: v } },
    }),
  },
];

/** Ordered group names, for rendering the editor. */
export const LANDING_OVERRIDE_GROUPS: string[] = Array.from(
  new Set(LANDING_OVERRIDE_FIELDS.map((f) => f.group))
);

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

/** Rebuild the stored JSON from a submitted Settings form. Blank fields are
 *  dropped entirely, so clearing a box restores the built-in wording. */
export function parseLandingOverridesFromForm(
  formData: FormData
): LandingCopyOverrides {
  const out: LandingCopyOverrides = {};
  for (const lang of ["en", "uk"] as const) {
    for (const f of LANDING_OVERRIDE_FIELDS) {
      const raw = String(formData.get(landingOverrideInputName(lang, f.key)) ?? "")
        .trim()
        .slice(0, 4000);
      if (!raw) continue;
      (out[lang] ??= {})[f.key] = raw;
    }
  }
  return out;
}
