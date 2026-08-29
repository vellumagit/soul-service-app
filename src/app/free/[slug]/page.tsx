// Public lead-magnet page — /free/<slug>. Shows the resource's bilingual copy
// and an email opt-in; on submit the asset is delivered instantly (and emailed)
// and the lead lands in /network/inbox. No auth (see proxy.ts PUBLIC_PREFIXES).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { leadMagnets, type LeadMagnet } from "@/db/schema";
import { TimeOfDayProvider } from "@/components/TimeOfDayProvider";
import { LeadMagnetOptin } from "@/components/LeadMagnetOptin";
import { resolveStorefrontAccountId } from "@/lib/storefront-account";
import { getLandingLang } from "@/lib/landing-lang";
import "../../landing.css";

export const dynamic = "force-dynamic";

/** Bilingual fallback: asked-for language, else the other, else "". */
function pick(en: string, uk: string, lang: "en" | "uk"): string {
  const primary = (lang === "uk" ? uk : en) ?? "";
  const fallback = (lang === "uk" ? en : uk) ?? "";
  return primary.trim() || fallback.trim() || "";
}

async function loadMagnet(slug: string): Promise<LeadMagnet | null> {
  const accountId = await resolveStorefrontAccountId();
  if (!accountId) return null;
  const rows = await db
    .select()
    .from(leadMagnets)
    .where(
      and(
        eq(leadMagnets.accountId, accountId),
        eq(leadMagnets.slug, slug),
        eq(leadMagnets.published, true),
        isNull(leadMagnets.archivedAt)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const lang = await getLandingLang();
  const magnet = await loadMagnet(slug);
  if (!magnet) return { title: lang === "uk" ? "Матеріал" : "A free resource" };
  const title = pick(magnet.titleEn, magnet.titleUk, lang);
  const description = pick(magnet.subtitleEn, magnet.subtitleUk, lang);
  return { title, description: description || undefined };
}

export default async function FreeResourcePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lang = await getLandingLang();
  const magnet = await loadMagnet(slug);
  if (!magnet || !magnet.assetUrl) notFound();

  const title = pick(magnet.titleEn, magnet.titleUk, lang);
  const subtitle = pick(magnet.subtitleEn, magnet.subtitleUk, lang);
  const description = pick(magnet.descriptionEn, magnet.descriptionUk, lang);
  const submitLabel =
    pick(magnet.buttonEn, magnet.buttonUk, lang) ||
    (lang === "uk" ? "Надішліть мені" : "Send it to me");
  const ctaLabel = pick(magnet.ctaLabelEn, magnet.ctaLabelUk, lang);
  const privacy =
    lang === "uk"
      ? "Жодного спаму — лише те, що ви попросили."
      : "No spam — just the thing you asked for.";

  const paragraphs = description
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <>
      <TimeOfDayProvider />
      <main className="landing-root">
        <header
          style={{
            padding: "32px 24px 0",
            maxWidth: 720,
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-serif, serif)",
              fontSize: 18,
              fontWeight: 500,
              letterSpacing: "0.04em",
              color: "var(--land-clay-deep)",
              textDecoration: "none",
            }}
          >
            Svitlana
          </Link>
        </header>

        <section className="circles" style={{ padding: "44px 24px 90px" }}>
          <div
            className="wrap narrow"
            style={{ textAlign: "center", marginBottom: 6 }}
          >
            <h2 style={{ marginBottom: subtitle ? 12 : 20 }}>{title}</h2>
            {subtitle && (
              <p className="p-lg" style={{ marginBottom: 20 }}>
                {subtitle}
              </p>
            )}
            {paragraphs.map((p, i) => (
              <p
                key={i}
                style={{
                  fontSize: 15,
                  lineHeight: 1.7,
                  color: "var(--land-ink-soft, #786b60)",
                  maxWidth: 520,
                  margin: "0 auto 14px",
                }}
              >
                {p}
              </p>
            ))}
          </div>

          <LeadMagnetOptin
            slug={magnet.slug}
            lang={lang}
            submitLabel={submitLabel}
            ctaLabel={ctaLabel || null}
            ctaHref={magnet.ctaHref}
          />

          <p
            style={{
              textAlign: "center",
              fontSize: 12,
              color: "var(--land-ink-soft, #9a8b7c)",
              margin: "16px auto 0",
              maxWidth: 460,
            }}
          >
            {privacy}
          </p>
        </section>
      </main>
    </>
  );
}
