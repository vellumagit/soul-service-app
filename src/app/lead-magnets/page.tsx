// Lead magnets admin — create/manage free, email-gated resources. Sidebar nav
// "Lead magnets." Each magnet has a public page at /free/<slug>; sign-ups are
// delivered the asset by email and land in Network → Inbox.

import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { QuickActions } from "@/components/QuickActions";
import { requireSession } from "@/lib/session-cookies";
import { db } from "@/db";
import { leadMagnets } from "@/db/schema";
import { getSettings, listClientsForPicker } from "@/db/queries";
import { asLocale } from "@/lib/i18n";
import {
  LeadMagnetsManager,
  type LeadMagnetRow,
} from "@/components/LeadMagnetsManager";

export const dynamic = "force-dynamic";

export default async function LeadMagnetsPage() {
  const { email, accountId } = await requireSession();

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
        published: leadMagnets.published,
        optinCount: leadMagnets.optinCount,
      })
      .from(leadMagnets)
      .where(eq(leadMagnets.accountId, accountId))
      .orderBy(desc(leadMagnets.updatedAt)),
    getSettings(accountId),
    listClientsForPicker(accountId),
  ]);

  const locale = asLocale(settings.uiLanguage);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.svit.live";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  return (
    <AppShell
      breadcrumb={[{ label: "Lead magnets" }]}
      rightAction={<QuickActions clients={clientsList} />}
      userEmail={email}
      locale={locale}
      timeZone={settings.timezone}
    >
      <header className="mb-7">
        <h1
          className="text-3xl md:text-4xl text-ink-900 serif mb-1"
          style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
        >
          Lead magnets
        </h1>
        <p className="text-sm text-ink-500 italic serif-italic">
          Free resources that grow your list — a PDF, an image, or a video,
          gated behind an email.
        </p>
      </header>

      <div className="max-w-3xl">
        <LeadMagnetsManager
          initial={rows as LeadMagnetRow[]}
          origin={origin}
          accountId={accountId}
        />
      </div>
    </AppShell>
  );
}
