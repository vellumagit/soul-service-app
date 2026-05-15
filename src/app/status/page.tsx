// "What's set up" — a glance-able view of every integration / capability.
// Visible to the signed-in user, scoped to their account (so each tenant
// sees their own Google connection status, etc.).
import { AppShell } from "@/components/AppShell";
import { QuickActions } from "@/components/QuickActions";
import { requireSession } from "@/lib/session-cookies";
import {
  getSettings,
  listClientsForPicker,
  getSetupStatus,
} from "@/db/queries";
import { getGoogleConnectionStatus } from "@/lib/google-calendar";
import { asLocale, t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type StatusRow = {
  label: string;
  state: "ok" | "warn" | "soon" | "off";
  detail: string;
};

export default async function StatusPage() {
  const { email, accountId } = await requireSession();
  const [settings, clientsList, setup, googleStatus] = await Promise.all([
    getSettings(accountId),
    listClientsForPicker(accountId),
    getSetupStatus(accountId),
    getGoogleConnectionStatus(accountId),
  ]);
  const locale = asLocale(settings.uiLanguage);

  // ── Build the status rows ────────────────────────────────────────────────
  const rows: StatusRow[] = [
    {
      label: "Database",
      state: "ok",
      detail: "Neon Postgres, healthy. You're seeing this page, so reads work.",
    },
    {
      label: "Sign-in",
      state: "ok",
      detail: `You're signed in as ${email}. Your data is isolated to this account.`,
    },
    {
      label: "File uploads · Avatars · Invoice PDFs",
      state: process.env.BLOB_READ_WRITE_TOKEN ? "ok" : "warn",
      detail: process.env.BLOB_READ_WRITE_TOKEN
        ? "Vercel Blob connected. Uploads enabled."
        : "Connect Vercel Blob in your project storage settings to enable uploads.",
    },
    {
      label: "AI session notes (transcript → markdown)",
      state: process.env.ANTHROPIC_API_KEY ? "ok" : "warn",
      detail: process.env.ANTHROPIC_API_KEY
        ? "Anthropic API key set. Paste a transcript on any session card to try it."
        : "Set ANTHROPIC_API_KEY in your Vercel env vars to enable AI note generation.",
    },
    {
      label: "Email sending (to clients · session reminders)",
      state: process.env.RESEND_API_KEY ? "ok" : "warn",
      detail: process.env.RESEND_API_KEY
        ? `Resend connected. Reminders run hourly via cron. From: ${process.env.AUTH_EMAIL_FROM ?? "(not set — using fallback)"}`
        : "Without Resend, EmailComposer falls back to opening your local mail app, and session reminder emails won't fire.",
    },
    {
      label: "Session reminder cron job",
      state:
        process.env.CRON_SECRET && process.env.RESEND_API_KEY ? "ok" : "warn",
      detail:
        process.env.CRON_SECRET && process.env.RESEND_API_KEY
          ? `Hourly cron at /api/cron/reminders. Client reminders: ${settings.clientReminderHours}h before. You: ${settings.practitionerReminderHours}h before.`
          : "Needs CRON_SECRET and RESEND_API_KEY set on Vercel. See README.",
    },
    {
      label: "Google Calendar + Meet",
      state: googleStatus.connected
        ? "ok"
        : process.env.GOOGLE_CLIENT_ID
        ? "off"
        : "warn",
      detail: googleStatus.connected
        ? `Connected as ${googleStatus.email}. Schedule a session → Calendar event + Meet link created automatically.`
        : process.env.GOOGLE_CLIENT_ID
        ? "Google client credentials set, but you haven't connected this account yet. Go to Settings → Google Calendar & Meet → Connect."
        : "Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in env vars first. See README for the 5-min Google Cloud Console setup.",
    },
    {
      label: "Multi-language UI (English · Русский · Українська)",
      state: "ok",
      detail: `Currently: ${
        locale === "ru" ? "Русский" : locale === "uk" ? "Українська" : "English"
      }. Change in Settings → Language.`,
    },
    {
      label: "Auto-import transcripts (Fathom · Tactiq · Otter)",
      state: "soon",
      detail:
        "Coming next. For now, paste transcripts manually into the AI dialog on any session.",
    },
    {
      label: "Stripe payments",
      state: "soon",
      detail:
        "Coming later. For now, mark sessions paid manually with the payment method she actually received.",
    },
  ];

  // ── Setup progress ───────────────────────────────────────────────────────
  const setupItems = [
    { label: "Business info set", done: setup.hasBusinessInfo },
    { label: "First client added", done: setup.hasClient },
    { label: "First session created", done: setup.hasSession },
    { label: "AI notes tried", done: setup.hasNotes },
  ];
  const setupDone = setupItems.filter((i) => i.done).length;

  return (
    <AppShell
      breadcrumb={[{ label: "Status" }]}
      rightAction={<QuickActions clients={clientsList} />}
      userEmail={email}
      locale={locale}
    >
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">
          Status
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          What&apos;s working, what&apos;s not, and what&apos;s coming.
        </p>
      </div>

      {/* Setup progress */}
      <section className="border border-ink-200 rounded-md bg-white p-5 mb-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink-900">
            Your setup progress
          </h2>
          <div className="text-[11px] text-ink-500 font-mono">
            {setupDone} / {setupItems.length}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {setupItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 text-sm py-1"
            >
              {item.done ? (
                <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <svg
                    className="w-2.5 h-2.5 text-green-700"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </span>
              ) : (
                <span className="w-4 h-4 rounded-full border-2 border-ink-300 shrink-0" />
              )}
              <span
                className={item.done ? "text-ink-700" : "text-ink-500"}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Capability rows */}
      <section className="border border-ink-200 rounded-md bg-white overflow-hidden">
        <h2 className="text-sm font-semibold text-ink-900 px-5 pt-5 pb-3 border-b border-ink-100">
          What&apos;s set up
        </h2>
        <ul className="divide-y divide-ink-100">
          {rows.map((row) => (
            <li key={row.label} className="px-5 py-3 flex items-start gap-3">
              <StatusBadge state={row.state} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink-900">
                  {row.label}
                </div>
                <div className="text-xs text-ink-500 mt-0.5 leading-relaxed">
                  {row.detail}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-[11px] text-ink-400 mt-4 leading-relaxed">
        Something not working? Check your Vercel env vars (Settings → Environment
        Variables) and the README for setup steps for each capability.
      </p>
    </AppShell>
  );
}

function StatusBadge({ state }: { state: StatusRow["state"] }) {
  const styles = {
    ok: { bg: "bg-green-100", fg: "text-green-700", label: "OK" },
    warn: { bg: "bg-amber-100", fg: "text-amber-700", label: "OFF" },
    off: { bg: "bg-ink-100", fg: "text-ink-600", label: "NOT YET" },
    soon: { bg: "bg-flame-50", fg: "text-flame-700", label: "SOON" },
  }[state];

  return (
    <span
      className={`chip ${styles.bg} ${styles.fg} shrink-0 mt-0.5`}
      style={{ minWidth: 56, justifyContent: "center" }}
    >
      {styles.label}
    </span>
  );
}
