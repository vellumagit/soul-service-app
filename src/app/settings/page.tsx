import { AppShell } from "@/components/AppShell";
import {
  getSettings,
  listClientsForPicker,
  listEmailTemplates,
  listNoteTemplates,
} from "@/db/queries";
import { getGoogleConnectionStatus } from "@/lib/google-calendar";
import { QuickActions } from "@/components/QuickActions";
import { SettingsForm } from "@/components/SettingsForm";
import { TemplatesManager } from "@/components/TemplatesManager";
import { GoogleCalendarSection } from "@/components/GoogleCalendarSection";
import { requireSession } from "@/lib/session-cookies";
import { asLocale, t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    google?: string;
    email?: string;
    reason?: string;
  }>;
}) {
  const { email: userEmail } = await requireSession();
  const { google, email, reason } = await searchParams;

  const [settings, clientsList, emailTpls, noteTpls, googleStatus] =
    await Promise.all([
      getSettings(),
      listClientsForPicker(),
      listEmailTemplates(),
      listNoteTemplates(),
      getGoogleConnectionStatus(),
    ]);

  const flashStatus =
    google === "connected" ? "connected" : google === "error" ? "error" : null;
  const locale = asLocale(settings.uiLanguage);

  return (
    <AppShell
      breadcrumb={[{ label: t(locale, "nav.settings"), href: "/settings" }]}
      rightAction={<QuickActions clients={clientsList} />}
      userEmail={userEmail}
      locale={locale}
    >
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">
          {t(locale, "settings.title")}
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          {t(locale, "settings.subtitle")}
        </p>
      </div>

      <div className="mb-5">
        <GoogleCalendarSection
          connected={googleStatus.connected}
          email={googleStatus.email}
          connectedAt={googleStatus.connectedAt}
          flashStatus={flashStatus}
          flashEmail={email ?? null}
          flashReason={reason ?? null}
        />
      </div>

      <SettingsForm settings={settings} />

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TemplatesManager
          kind="email"
          templates={emailTpls.map((tpl) => ({
            id: tpl.id,
            name: tpl.name,
            subject: tpl.subject,
            body: tpl.body,
            language: tpl.language,
          }))}
        />
        <TemplatesManager
          kind="note"
          templates={noteTpls.map((tpl) => ({
            id: tpl.id,
            name: tpl.name,
            body: tpl.body,
          }))}
        />
      </div>
    </AppShell>
  );
}
