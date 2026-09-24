// /robots.txt — the storefront is open to search engines; the private
// workspace, client portal and APIs are not. (They're behind sign-in anyway;
// this just stops crawlers wasting time on redirects to /signin.)

import type { MetadataRoute } from "next";
import { CANONICAL_ORIGIN } from "@/lib/storefront-seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/portal", "/signin", "/circles/cancel/"],
    },
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
    host: CANONICAL_ORIGIN,
  };
}
