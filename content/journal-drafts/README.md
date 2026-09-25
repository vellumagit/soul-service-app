# Journal drafts — set aside, not on the site

Three articles written in Svitlana's voice (English + Ukrainian), waiting
for her approval. They are NOT imported anywhere, so they don't build into
the site and their URLs 404.

- `what-is-a-womens-circle.ts` — "women's circle" (~140 searches/mo, Canada)
- `feeling-lost-in-life.ts` — "feeling lost in life" + "inner compass" (~210 + 90)
- `people-pleasing.ts` — "people pleasing" + "how to stop" (~2,400 + 210)

To publish one once she's approved it:

1. Move the file to `src/lib/journal/`.
2. Import it in `src/lib/journal.ts` and add it to `ARTICLES`.
3. Set `status: "published"` and `published` / `updated` to that day.

`/journal` and the footer's Journal link appear automatically once one
article is published. Add a line to Lumi's "Recent updates" in
`src/lib/help-prompt.ts` when you do.
