import "server-only";

// Storefront language. The URL decides: /uk/* is Ukrainian, everything else is
// English — so Google can index both versions (see storefront-seo.ts).
//
// proxy.ts rewrites /uk/* onto the shared pages and passes the language in
// the LANG_HEADER request header; this reads it. The `landing_lang` cookie
// only remembers the visitor's last choice so proxy.ts can send a returning
// Ukrainian reader from "/" to "/uk" — it no longer picks the language here.

import { headers } from "next/headers";
import type { LandingLang } from "./landing-copy";
import { LANG_HEADER } from "./storefront-seo";

export async function getLandingLang(): Promise<LandingLang> {
  const h = await headers();
  return h.get(LANG_HEADER) === "uk" ? "uk" : "en";
}
