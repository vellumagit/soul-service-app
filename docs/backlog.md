# Soul Service — Backlog

Things deferred from prior sessions. Not promises; ideas worth keeping in view so we don't re-invent them or forget them.

---

## Deferred audit fixes

### LOW · console.log → console.debug
**Source:** Audit (commit `bfd1aff`), item #8.
**Status:** Deferred — cosmetic only.
**What:** Several `console.log` calls scattered in production paths (notably `src/app/api/webhooks/recall/route.ts` lines 172 and 245 per the audit). In a tighter operational hygiene pass, swap these for `console.debug` (or remove if no debug value). Adds nothing to log volume in production; just noise reduction.
**Where:**
- `src/app/api/webhooks/recall/route.ts` — log lines around event dispatch
- Spot check the other API routes for any leftover debug prints from development

---

## Deferred dedup race condition (CLOSED — fixed 2026-06)

Audit item #5 was actually fixed in the post-audit pass: lead intake now inserts first, then checks for STRICTLY OLDER submissions with the same `(form_id, email)` within 24h, downgrading the loser's status to `duplicate`. Uses `createdAt` timestamps for the race tie-break. Resolved.

---

## Feature backlog (proposed, not built)

Things that came up in conversation as "would be valuable" but got shelved while we focused on higher-leverage shipping.

### A. Sessions Inbox / triage view
The "mop the floor" page. Shows sessions that need her attention:
- Completed but no notes
- Completed but no Closing reflection
- Completed but payment unmarked
- Future sessions with no intention set
- Sessions where the Recall bot failed (`recall_bot_status = "fatal"` or similar)

Inline quick actions on each (Open / Reflect / Mark paid / Add intention). Empty state when there's nothing waiting. Sits alongside `/practice` as a quiet ledger of unfinished business.

**Build estimate:** 3-4 hours. Pure query work + a focused page. No new schema.

### B. Constellation — every client at once
A visual page showing the shape of her whole practice in one view. Every client as a dot/orbit. Active vs quiet, frequency, themes, length of work — all legible at a glance. Beautiful, fits the Arc cluster (Journey → Milestones → Year-in-review → Constellation).

Lets her see who's drifting, who's anchored. Hover any dot for name + last session + themes. Click to open the client.

**Build estimate:** 4-6 hours. SVG/D3-like layout, careful aesthetic work.

### C. Ritual bundle — three small things in one ship
Each ~1 hour:
1. **"Letter to your future self"** on the prep view — she writes a note that surfaces at the top of the NEXT prep view for the same client. Pairs beautifully with The Closing as bookends of the work.
2. **Sabbath landing page** — when she opens the app on a day she's marked off, a quiet welcome card: "Saturday is yours. Peek anyway, or close the tab." No nag, no guilt — just an acknowledgement.
3. **Search palette upgrades** — Cmd+K finds themes, observations, and Network entries in addition to clients / sessions / files / tasks.

**Build estimate:** 3-4 hours total for all three.

### D. AI-assisted closing milestone suggestions
When she fills in The Closing reflections, offer to suggest a milestone label based on her words. E.g. she writes "She finally let herself cry," and a small honey-tinted suggestion appears: "Pin as milestone: 'she let herself cry'?" One tap to accept, dismiss to ignore. Uses the existing Anthropic SDK setup.

**Build estimate:** 2-3 hours.

### E. Tag / theme explorer
A discovery page showing every tag/theme across her practice. Which clients carry which themes. Frequency over time. Lets her notice "I've worked with 7 people on grief this year" without manually counting.

**Build estimate:** 3-4 hours.

### F. Year-over-year comparison on /practice
The Year-in-review page currently shows one year at a time. A small comparison view: "2026 vs 2025 — sessions up 18%, you're seeing more new people, longer arcs." Read-only, ambient, no action required.

**Build estimate:** 2-3 hours.

### G. Voice-note "letter from the field" mode
Like the existing "From audio" button but framed as "leave yourself a quick voice memo" rather than full session notes. Shorter prompts, lighter structuring, surfaces at the top of the next prep view for that client (overlap with C.1 — "Letter to your future self").

**Build estimate:** 1-2 hours (extends existing voice-memo pipeline).

### H. Per-form origin allowlist for lead capture
Right now lead capture is bearer-token-only (no origin check). A client-side form in her marketing site exposes the token in HTML, where anyone can extract + reuse it. Origin allowlist on each form would close that hole for browser-based forms. Server-to-server flows (Make.com) wouldn't need it.

**Build estimate:** 1-2 hours. Just an extra field on `lead_forms` and a check in the intake route.

### I. Recall bot consent flow
Currently the Recall notetaker bot joins meetings without explicit per-session client consent. The intake convo is the only place she discloses it. A nicer flow:
- Before scheduling, a checkbox on the schedule dialog: "Notetaker is on for this session" (default per-form preference)
- Pre-meeting email to the client: "Heads up — I'll have a notetaker in our call. It just transcribes; nothing is shared."
- Post-meeting email option: "Want a copy of the structured notes?"

Optional but elegant. Some clients won't mind; the explicit consent moment is more practitioner-appropriate than a corporate-style bot dropping in unannounced.

**Build estimate:** 4-5 hours.

---

## When picking next work

Lean toward the ritual / quiet-utility end of this list when in doubt. The app's identity is "the practitioner's attention extended into software" — things like A (Sessions Inbox) and C (Ritual bundle) reinforce that. B (Constellation) is the most visually distinctive but also the most "feature-y." H (origin allowlist) and I (consent flow) are the more responsible-engineering items.

The very next session is probably worth opening with "where do you want to point me today?" rather than auto-picking — different days call for different shapes of work.

---

## Svitlana's landing-copy notes — "maybe later" ideas

From her copy-revision doc ("Sharing with Brian.docx", reviewed 2026-06). These were scattered notes at the top of the doc, NOT finished page copy — parked here so they aren't lost. The section-by-section copy edits from that doc were applied; only "Payment based on their income" was used (folded into the storefront payment-options line). The rest live here until she clarifies intent.

- **Course "Who am I?"** — a future offering. Likely maps to the currently greyed-out "Quiz & Workbook" card on the storefront ("Coming soon"). If she wants it real, this could be its name/anchor. Needs scope (is it a self-guided workbook, a video course in the Library, a cohort?).
- **"Blessing/Love sent to your family/home after the cleaning"** — references *the cleaning*, so this looks cross-pollinated from her cleaning business OR is a ritual concept (a closing blessing). Unclear if it belongs on Soul Service at all. Needs her clarification before doing anything.
- **"What I want to make sure — the client understands my guidance and is okay before they leave"** — a value statement about how she works (a care/safety check at the end of a session). Could become a line of landing copy (e.g. in About or a "how I hold space" note), or could inform a session-closing checklist feature. Currently just a value, no home.
- **"Payment based on their income"** — DONE: folded into the storefront payment line as "rates that meet your income." If she wants a real sliding-scale mechanism (not just "ask me"), that's a future feature: a per-offering "name your rate / income-based" option.
- "Offer" / "Copy from my phone" — notes-to-self, no action.

**When picking this up:** open with her, don't guess — especially the "Who am I?" course (could be a real Library product) and the after-cleaning blessing (may not be a Soul Service thing at all).
