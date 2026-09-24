// /sitemap.xml — every public storefront page, in both languages, with
// hreflang pairs so Google treats /x and /uk/x as translations of one page.
// Only the storefront is listed; the workspace and portal are private.

import type { MetadataRoute } from "next";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { leadMagnets } from "@/db/schema";
import { OFFER_PAGES } from "@/lib/landing-offers";
import { QUIZ_PAUSED } from "@/lib/quiz-status";
import { resolveStorefrontAccountId } from "@/lib/storefront-account";
import { CANONICAL_ORIGIN, localePath } from "@/lib/storefront-seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: { path: string; lastModified?: Date; priority: number }[] = [
    { path: "/", priority: 1 },
    ...OFFER_PAGES.map((p) => ({ path: `/${p}`, priority: 0.9 })),
    { path: "/privacy", priority: 0.2 },
    { path: "/terms", priority: 0.2 },
  ];
  // While the quiz is paused its page is a "back soon" note — not worth indexing.
  if (!QUIZ_PAUSED) pages.push({ path: "/quiz", priority: 0.7 });

  // Her published free resources (/free/<slug>). A DB hiccup just leaves
  // them out this time rather than failing the whole sitemap.
  try {
    const accountId = await resolveStorefrontAccountId();
    if (accountId) {
      const magnets = await db
        .select({ slug: leadMagnets.slug, updatedAt: leadMagnets.updatedAt })
        .from(leadMagnets)
        .where(
          and(
            eq(leadMagnets.accountId, accountId),
            eq(leadMagnets.published, true),
            isNull(leadMagnets.archivedAt),
            isNotNull(leadMagnets.assetUrl)
          )
        );
      for (const m of magnets) {
        pages.push({ path: `/free/${m.slug}`, lastModified: m.updatedAt, priority: 0.6 });
      }
    }
  } catch (err) {
    console.warn("[sitemap] lead magnets skipped:", err);
  }

  return pages.flatMap(({ path, lastModified, priority }) => {
    const en = CANONICAL_ORIGIN + path;
    const uk = CANONICAL_ORIGIN + localePath("uk", path);
    const alternates = { languages: { en, uk } };
    return [
      { url: en, lastModified, priority, alternates },
      { url: uk, lastModified, priority, alternates },
    ];
  });
}
