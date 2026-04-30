import { AppShell } from "@/components/AppShell";
import {
  getSettings,
  listClientsForPicker,
  listEmailTemplates,
  listNoteTemplates,
} from "@/db/queries";
import { QuickActions } from "@/components/QuickActions";
import { SettingsForm } from "@/components/SettingsForm";
import { TemplatesManager } from "@/components/TemplatesManager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, clientsList, emailTpls, noteTpls] = await Promise.all([
    getSettings(),
    listClientsForPicker(),
    listEmailTemplates(),
    listNoteTemplates(),
  ]);

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
          Business info, automations, and reusable templates.
        </p>
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
