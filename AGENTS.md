<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Lumi stays current — no exceptions

**Lumi** is the orange chat bubble in the bottom-right of every page — the practitioner's first stop when she's unsure how to do something. ("Lumi" is the display name she sees; the component + CSS classes are still `HelpBuddy` / `help-buddy` internally.) It's powered by `src/lib/help-prompt.ts` — a long, hand-maintained system prompt that lists every feature the app has.

**If you ship a user-facing change, update that file in the same commit.** Specifically:

- Added a button, page, dialog, shortcut, toast, or workflow → add a sentence to the relevant section in `What you can do RIGHT NOW`.
- Changed how an existing flow works → revise the relevant section so it stays truthful.
- Shipped something noteworthy (new feature, fix she'd notice) → also drop a one-line bullet at the top of the **Recent updates** block so she can ask "what's new?" and get a real, current answer.
- Removed or deprecated something → remove the bullet, don't leave dead references.

Why this matters: if the prompt is stale, Lumi will tell her "I don't see that in the app yet" about a button she's literally looking at. That's worse than no helper at all — it erodes trust in the app.

The prompt is large (~6KB) and cached via `cache_control: ephemeral`, so adding a few lines costs essentially nothing per call. Don't worry about being concise — be accurate.

**Voice rule:** the entire prompt speaks TO Svitlana in the second person ("you can…"), never about her ("she can…"). Lumi is her personal companion, not a manual. Keep any new bullets in that register.

# Anything public is bilingual — English AND Ukrainian

The storefront and every public page (landing, Circle sign-up, offerings, quiz)
serve two audiences. **Anything you add to a public page must exist in both
English and Ukrainian.** No exceptions, no "we'll translate it later" — a half-
translated page is how a Ukrainian visitor hits an English wall mid-scroll.

The split is always the same:

- **Structure is shared.** Layout, sections, ordering, photos, prices — one
  definition, used by both languages. A photo isn't language-specific, and a
  section that only exists in English is a bug.
- **Text is per-language.** Every string she can edit gets a separate English
  and Ukrainian value, editable independently. Never derive one from the other,
  and never machine-translate at render time.
- **Fall back, never blank.** A missing translation renders the other
  language's text. An empty string must never reach the page.

Two implementations of this pattern to copy from:
`src/lib/landing-overrides.ts` (per-field overrides keyed by language, blank →
dictionary default) and `landing_reviews` + `src/lib/landing-reviews.ts` (one
row, both languages, `reviewForLang` picks and falls back). Static copy with no
per-practitioner editing lives in the `en` / `uk` dictionaries in
`src/lib/landing-copy.tsx`.

When you add an editable field, the Settings UI for it needs the same EN/УКР
tab pair the existing editors use — and both language panels must stay MOUNTED
(hidden, not unmounted) so switching tabs before saving can't drop the other
language's value.
