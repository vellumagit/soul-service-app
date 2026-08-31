// Create a lead magnet — the full editor page (replaces the old cramped modal).

import Link from "next/link";
import { headers } from "next/headers";
import { AppShell } from "@/components/AppShell";
import { QuickActions } from "@/components/QuickActions";
import { LeadMagnetEditor } from "@/components/LeadMagnetEditor";
import { requireSession } from "@/lib/session-cookies";
import { getSettings, listClientsForPicker } from "@/db/queries";
import { asLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function NewLeadMagnetPage() {
  const { email, accountId } = await requireSession();
  const [settings, clientsList] = await Promise.all([
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
      breadcrumb={[
        { label: "Lead magnets", href: "/lead-magnets" },
        { label: "New" },
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
          New lead magnet
        </h1>
        <Link href="/lead-magnets" className="text-sm text-ink-500 hover:text-ink-900">
          ← All lead magnets
        </Link>
      </header>

      <LeadMagnetEditor magnet={null} accountId={accountId} origin={origin} />
    </AppShell>
  );
}
