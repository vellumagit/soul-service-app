import "server-only";

// Storefront language preference. ENGLISH is the default; visitors can
// switch to Ukrainian via the EN·УКР toggle, which sets the `landing_lang`
// cookie (a plain preference cookie — not httponly, no security role). The
// cookie persists across all storefront pages so the choice sticks.
//
// Default logic: only an explicit "uk" cookie yields Ukrainian. No cookie
// (first visit) or any other value → English. So the site greets everyone
// in English, and anyone who toggles to Ukrainian stays there.

import { cookies } from "next/headers";
import type { LandingLang } from "./landing-copy";

export const LANDING_LANG_COOKIE = "landing_lang";

export async function getLandingLang(): Promise<LandingLang> {
  const store = await cookies();
  return store.get(LANDING_LANG_COOKIE)?.value === "uk" ? "uk" : "en";
}
