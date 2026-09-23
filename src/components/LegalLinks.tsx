// "Privacy Policy · Terms of Service" — the small link pair at the foot of every
// storefront page, so the policies are one tap away wherever someone signs up,
// pays or leaves their email. Labels come from legal-copy (EN + УКР).

import Link from "next/link";
import { getLegalCopy } from "@/lib/legal-copy";
import type { LandingLang } from "@/lib/landing-copy";

export function LegalLinks({ lang }: { lang: LandingLang }) {
  const { chrome } = getLegalCopy(lang);
  return (
    <p className="legal-links">
      <Link href="/privacy">{chrome.privacy}</Link>
      <span aria-hidden="true"> · </span>
      <Link href="/terms">{chrome.terms}</Link>
    </p>
  );
}
