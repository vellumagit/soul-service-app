// /network/forms — manage lead-magnet capture forms.
//
// Each "form" is a logical entry point for outside-the-app submissions:
// her marketing site, Substack signup widget, an embedded Notion form, a
// Make.com scenario, etc. Each gets:
//   - a Bearer token (shown once on create / rotate, hashed in the DB)
//   - the public POST endpoint URL she copies into her form code
//   - optional auto-accept (skip the inbox)
//   - optional outbound webhook (fires on every submission → Make.com)
//   - submission counts + last submission timestamp
//
// /network/inbox is where the actual submissions land for triage.

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { LeadFormsManager } from "@/components/LeadFormsManager";
import {
  listLeadForms,
  getLeadInboxCount,
  getSettings,
  listClientsForPicker,
} from "@/db/queries";
import { requireSession } from "@/lib/session-cookies";
import { asLocale, t } from "@/lib/i18n";
import { QuickActions } from "@/components/QuickActions";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function LeadFormsPage() {
  const { email, accountId } = await requireSession();
  const [forms, inboxCount, settings, picker, hdrs] = await Promise.all([
    listLeadForms(accountId, true),
    getLeadInboxCount(accountId),
    getSettings(accountId),
    listClientsForPicker(accountId),
    headers(),
  ]);
  const locale = asLocale(settings.uiLanguage);

  // Compute the public base URL once, server-side, so the UI can show the
  // full endpoint URL she'd paste into her form code.
  const host = hdrs.get("host") ?? "your-domain.example";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const baseUrl = `${proto}://${host}`;
  const intakeUrl = `${baseUrl}/api/leads/intake`;

  return (
    <AppShell
      breadcrumb={[
        { label: t(locale, "nav.network"), href: "/network" },
        { label: "Forms" },
      ]}
      rightAction={<QuickActions clients={picker} />}
      userEmail={email}
      locale={locale}
    >
      <header className="mb-6">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-2">
          <div>
            <h1
              className="text-2xl text-ink-900 serif"
              style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
            >
              Lead capture forms
            </h1>
            <p className="text-sm text-ink-500 italic serif-italic mt-1">
              Endpoints your lead magnets, embed widgets, and Make.com scenarios
              POST to. Each form gets its own token.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {inboxCount > 0 && (
              <Link
                href="/network/inbox"
                className="text-xs text-honey-700 hover:underline font-medium"
              >
                {inboxCount} pending in inbox →
              </Link>
            )}
            <Link
              href="/network"
              className="text-xs text-ink-500 hover:text-ink-900"
            >
              ← Back to Network
            </Link>
          </div>
        </div>
      </header>

      <LeadFormsManager forms={forms} intakeUrl={intakeUrl} />

      <section className="paper-card p-5 mt-8 max-w-3xl">
        <h2
          className="serif-italic text-base text-plum-700 mb-2"
          style={{ fontWeight: 400 }}
        >
          How to use a form
        </h2>
        <p className="text-xs text-ink-600 leading-relaxed mb-3">
          The POST endpoint is{" "}
          <code className="bg-ink-100 px-1.5 py-0.5 rounded text-ink-900">
            {intakeUrl}
          </code>
          . Auth is{" "}
          <code className="bg-ink-100 px-1.5 py-0.5 rounded text-ink-900">
            Authorization: Bearer &lt;form-token&gt;
          </code>
          . Body is JSON; the canonical fields (name, email, phone) are pulled
          out and the rest of the top-level keys are captured into{" "}
          <code className="bg-ink-100 px-1.5 py-0.5 rounded text-ink-900">
            fields
          </code>{" "}
          for triage.
        </p>
        <pre className="text-[11px] bg-ink-900 text-ink-50 rounded p-3 overflow-x-auto leading-relaxed">{`curl -X POST '${intakeUrl}' \\
  -H 'Authorization: Bearer lf_yourtokenhere' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "email": "maria@example.com",
    "name": "Maria Pérez",
    "intent": "navigating grief",
    "utm_source": "instagram"
  }'`}</pre>
        <p className="text-[11px] text-ink-500 mt-3 leading-relaxed">
          For Make.com: use the <strong>HTTP → Make a request</strong> module,
          method POST, the endpoint above, the JSON body, and a custom header{" "}
          <code className="bg-ink-100 px-1 rounded">Authorization</code> ={" "}
          <code className="bg-ink-100 px-1 rounded">Bearer &lt;token&gt;</code>.
          Set the form&apos;s outbound webhook URL to your Make.com scenario
          for downstream nurture (thank-you email, ConvertKit add, Slack ping,
          etc.).
        </p>
      </section>
    </AppShell>
  );
}
