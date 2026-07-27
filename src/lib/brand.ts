import "server-only";

// Her brand marks (logo + favicon), loaded once per request.
//
// These live on practitioner_settings and are set in Settings → Branding.
// The root layout needs them in two places — generateMetadata (favicon) and
// the render tree (logo) — and the public pages want the logo too, so this is
// wrapped in React's `cache()`: every caller in a single request shares ONE
// query, and a page that never asks pays nothing.
//
// Fails soft on purpose. Branding is decoration; a database hiccup here must
// never take down a page, so every error resolves to "no marks set", which is
// exactly how the app looked before this feature existed.

import { cache } from "react";
import { or, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { practitionerSettings } from "@/db/schema";

export type Brand = {
  logoUrl: string | null;
  faviconUrl: string | null;
};

const EMPTY: Brand = { logoUrl: null, faviconUrl: null };

export const getBrand = cache(async (): Promise<Brand> => {
  try {
    const [row] = await db
      .select({
        logoUrl: practitionerSettings.logoUrl,
        faviconUrl: practitionerSettings.faviconUrl,
      })
      .from(practitionerSettings)
      // The row that actually carries branding — public pages have no session
      // to scope by, and this app runs one practice per deployment.
      .where(
        or(
          isNotNull(practitionerSettings.logoUrl),
          isNotNull(practitionerSettings.faviconUrl)
        )
      )
      .limit(1);
    if (!row) return EMPTY;
    return {
      logoUrl: row.logoUrl?.trim() || null,
      faviconUrl: row.faviconUrl?.trim() || null,
    };
  } catch (err) {
    console.error("[brand] couldn't load branding:", err);
    return EMPTY;
  }
});
