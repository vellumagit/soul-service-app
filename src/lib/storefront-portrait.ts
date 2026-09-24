import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitionerSettings } from "@/db/schema";
import { resolveStorefrontAccountId } from "./storefront-account";

/** Her storefront portrait (Settings → Landing page), which doubles as the
 *  link-preview image. Any DB hiccup just means no preview image — never a
 *  failed page. */
export async function storefrontPortraitUrl(): Promise<string | null> {
  try {
    const accountId = await resolveStorefrontAccountId();
    if (!accountId) return null;
    const [row] = await db
      .select({ url: practitionerSettings.landingPortraitUrl })
      .from(practitionerSettings)
      .where(eq(practitionerSettings.accountId, accountId))
      .limit(1);
    return row?.url?.trim() || null;
  } catch {
    return null;
  }
}
