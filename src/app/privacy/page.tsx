// Public Privacy Policy. No auth (see proxy.ts PUBLIC_PATHS). Text lives in
// src/lib/legal-copy.ts; language follows the storefront's landing_lang cookie.

import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { getLandingLang } from "@/lib/landing-lang";
import { getLegalCopy } from "@/lib/legal-copy";
import "../landing.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLandingLang();
  return { title: getLegalCopy(lang).privacy.metaTitle };
}

export default async function PrivacyPage() {
  return <LegalPage doc="privacy" lang={await getLandingLang()} />;
}
