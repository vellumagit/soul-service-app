// The "Svitlana" mark at the top of the public Circle pages, swapped for her
// uploaded logo when she's set one. Server component — getBrand() is cached
// per request, so this shares the same query the root layout already made.

import Link from "next/link";
import { getBrand } from "@/lib/brand";
import type { LandingLang } from "@/lib/landing-copy";
import { localePath } from "@/lib/storefront-seo";

// `lang` keeps a Ukrainian reader on the Ukrainian homepage; the Circle
// pages (English URLs only) leave it off.
export async function PublicBrandLink({ lang = "en" }: { lang?: LandingLang }) {
  const { logoUrl } = await getBrand();
  return (
    <Link
      href={localePath(lang, "/")}
      style={{
        display: "inline-block",
        fontFamily: "var(--font-serif, serif)",
        fontSize: 18,
        fontWeight: 500,
        letterSpacing: "0.04em",
        color: "var(--land-clay-deep)",
        textDecoration: "none",
      }}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt="Svitlana"
          style={{
            maxHeight: 48,
            maxWidth: 220,
            objectFit: "contain",
            display: "block",
            margin: "0 auto",
          }}
        />
      ) : (
        "Svitlana"
      )}
    </Link>
  );
}
