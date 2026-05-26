<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Help Buddy stays current — no exceptions

The orange chat bubble in the bottom-right of every page is the practitioner's first stop when she's unsure how to do something. It's powered by `src/lib/help-prompt.ts` — a long, hand-maintained system prompt that lists every feature the app has.

**If you ship a user-facing change, update that file in the same commit.** Specifically:

- Added a button, page, dialog, shortcut, toast, or workflow → add a sentence to the relevant section in `What she can do RIGHT NOW`.
- Changed how an existing flow works → revise the relevant section so it stays truthful.
- Shipped something noteworthy (new feature, fix she'd notice) → also drop a one-line bullet at the top of the **Recent updates** block so she can ask "what's new?" and get a real, current answer.
- Removed or deprecated something → remove the bullet, don't leave dead references.

Why this matters: if the prompt is stale, the buddy will tell her "I don't see that in the app yet" about a button she's literally looking at. That's worse than no buddy at all — it erodes trust in the app.

The prompt is large (~6KB) and cached via `cache_control: ephemeral`, so adding a few lines costs essentially nothing per call. Don't worry about being concise — be accurate.
