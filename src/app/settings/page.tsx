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

  return (
    <AppShell
      breadcrumb={[{ label: "Settings", href: "/settings" }]}
      rightAction={<QuickActions clients={clientsList} />}
    >
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          Business info, automations, integrations, and reusable templates.
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
          templates={emailTpls.map((t) => ({
            id: t.id,
            name: t.name,
            subject: t.subject,
            body: t.body,
          }))}
        />
        <TemplatesManager
          kind="note"
          templates={noteTpls.map((t) => ({
            id: t.id,
            name: t.name,
            body: t.body,
          }))}
        />
      </div>
    </AppShell>
  );
}
