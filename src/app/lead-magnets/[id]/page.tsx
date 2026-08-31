// Edit a lead magnet — the full editor page (replaces the old cramped modal).

import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { QuickActions } from "@/components/QuickActions";
import {
  LeadMagnetEditor,
} from "@/components/LeadMagnetEditor";
import type { LeadMagnetRow } from "@/components/LeadMagnetsManager";
import { requireSession } from "@/lib/session-cookies";
import { db } from "@/db";
import { leadMagnets } from "@/db/schema";
import { getSettings, listClientsForPicker } from "@/db/queries";
import { asLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function EditLeadMagnetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { email, accountId } = await requireSession();
  const { id } = await params;

  const [rows, settings, clientsList] = await Promise.all([
    db
      .select({
        id: leadMagnets.id,
        slug: leadMagnets.slug,
        titleEn: leadMagnets.titleEn,
        titleUk: leadMagnets.titleUk,
        subtitleEn: leadMagnets.subtitleEn,
        subtitleUk: leadMagnets.subtitleUk,
        descriptionEn: leadMagnets.descriptionEn,
        descriptionUk: leadMagnets.descriptionUk,
        buttonEn: leadMagnets.buttonEn,
        buttonUk: leadMagnets.buttonUk,
        assetKind: leadMagnets.assetKind,
        assetUrl: leadMagnets.assetUrl,
        assetName: leadMagnets.assetName,
        assetLabelEn: leadMagnets.assetLabelEn,
        assetLabelUk: leadMagnets.assetLabelUk,
        ctaLabelEn: leadMagnets.ctaLabelEn,
        ctaLabelUk: leadMagnets.ctaLabelUk,
        ctaHref: leadMagnets.ctaHref,
        followups: leadMagnets.followups,
        published: leadMagnets.published,
        optinCount: leadMagnets.optinCount,
      })
      .from(leadMagnets)
      .where(and(eq(leadMagnets.id, id), eq(leadMagnets.accountId, accountId)))
      .limit(1),
    getSettings(accountId),
    listClientsForPicker(accountId),
  ]);

  const magnet = rows[0] as LeadMagnetRow | undefined;
  if (!magnet) notFound();

  const locale = asLocale(settings.uiLanguage);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.svit.live";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  return (
    <AppShell
      breadcrumb={[
        { label: "Lead magnets", href: "/lead-magnets" },
        { label: magnet.titleEn || magnet.titleUk || "Untitled" },
      ]}
      rightAction={<QuickActions clients={clientsList} />}
      userEmail={email}
      locale={locale}
      timeZone={settings.timezone}
    >
      <header className="mb-6 flex items-baseline justify-between gap-3 flex-wrap">
        <h1
          className="text-3xl text-ink-900 serif"
          style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
        >
          Edit lead magnet
        </h1>
        <Link href="/lead-magnets" className="text-sm text-ink-500 hover:text-ink-900">
          ← All lead magnets
        </Link>
      </header>

      <LeadMagnetEditor magnet={magnet} accountId={accountId} origin={origin} />
    </AppShell>
  );
}
