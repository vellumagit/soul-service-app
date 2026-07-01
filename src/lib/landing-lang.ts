import "server-only";

// Storefront language preference. UKRAINIAN is the default; visitors can
// switch to English via the УКР·EN toggle, which sets the `landing_lang`
// cookie (a plain preference cookie — not httponly, no security role). The
// cookie persists across all storefront pages so the choice sticks.
//
// Default logic: only an explicit "en" cookie yields English. No cookie
// (first visit) or any other value → Ukrainian. So the site greets everyone
// in Ukrainian, and anyone who toggles to English stays there.

import { cookies } from "next/headers";
import type { LandingLang } from "./landing-copy";

export const LANDING_LANG_COOKIE = "landing_lang";

export async function getLandingLang(): Promise<LandingLang> {
  const store = await cookies();
  return store.get(LANDING_LANG_COOKIE)?.value === "en" ? "en" : "uk";
}
