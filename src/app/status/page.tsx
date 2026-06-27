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
import { isTokenEncryptionConfigured } from "@/lib/token-crypto";
import { TestGoogleButton } from "@/components/TestGoogleButton";
import { SyncAllSessionsButton } from "@/components/SyncAllSessionsButton";
import { ReconnectGoogleButton } from "@/components/ReconnectGoogleButton";
import { asLocale, t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type StatusRow = {
  label: string;
  state: "ok" | "warn" | "soon" | "off";
  detail: string;
  /** Optional inline UI to render under the detail — e.g. a "Test connection"
   *  button for diagnosing rows that say "OK" but don't actually work. */
  extra?: React.ReactNode;
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
      label: "Voice memos → notes (Whisper + AI)",
      state: process.env.OPENAI_API_KEY ? "ok" : "warn",
      detail: process.env.OPENAI_API_KEY
        ? "OpenAI Whisper key set. Use the 'From audio' button on any session to record / upload a voice memo and structure it into notes."
        : "Set OPENAI_API_KEY in your Vercel env vars to enable the voice-memo → notes pipeline. Whisper handles the transcription; Claude (already configured above) structures it.",
    },
    {
      label: "Card payments — Circles (Stripe)",
      state:
        process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
          ? "ok"
          : "warn",
      detail:
        process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
          ? "Stripe connected. Visitors can pay for a Circle seat by card on the public sign-up page; the webhook marks them paid, sends the welcome email with the meeting link, and reminders go out 24h + 1h before. (The manual Venmo/cash lane still works alongside it.)"
          : "Set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in your Vercel env vars and point a Stripe webhook at <your-domain>/api/webhooks/stripe (event: checkout.session.completed). Until then, Circles take seats via the manual hold-a-seat + mark-paid flow only. Also set the Circle room link in Settings so welcome emails carry the meeting link — and verify a Resend domain so those emails deliver.",
    },
    {
      label: "Video hosting (Cloudflare Stream)",
      state:
        process.env.CLOUDFLARE_ACCOUNT_ID &&
        process.env.CLOUDFLARE_STREAM_API_TOKEN &&
        process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE
          ? "ok"
          : "warn",
      detail:
        process.env.CLOUDFLARE_ACCOUNT_ID &&
        process.env.CLOUDFLARE_STREAM_API_TOKEN &&
        process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE
          ? "Cloudflare Stream connected. Upload session recaps from the session card and storefront video offerings from /library. Signed URLs expire every 24h so leaked iframe links die overnight."
          : "Set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_STREAM_API_TOKEN (with Stream:Edit scope) + CLOUDFLARE_STREAM_CUSTOMER_CODE (the customer-XXXX subdomain prefix) in Vercel env vars to enable session recap videos and the storefront Library.",
    },
    {
      label: "Auto-notes — meeting notetaker bot (Recall.ai)",
      state:
        process.env.RECALL_API_KEY &&
        process.env.RECALL_REGION &&
        process.env.RECALL_WEBHOOK_SECRET
          ? "ok"
          : "warn",
      detail:
        process.env.RECALL_API_KEY &&
        process.env.RECALL_REGION &&
        process.env.RECALL_WEBHOOK_SECRET
          ? `Recall.ai connected (${process.env.RECALL_REGION}). Turn on the bot in Settings → Auto-notes; it will join scheduled Meet calls, transcribe, and write the notes for you.`
          : "Set RECALL_API_KEY + RECALL_REGION (e.g. us-east-1) + RECALL_WEBHOOK_SECRET in your Vercel env vars. Point Recall's webhooks at <your-domain>/api/webhooks/recall. Then enable in Settings → Auto-notes.",
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
          ? `Hourly cron via GitHub Actions → /api/cron/reminders. Client reminders: ${settings.clientReminderHours}h before. You: ${settings.practitionerReminderHours}h before.`
          : "Needs CRON_SECRET on Vercel + the same value as a GitHub Actions secret, plus RESEND_API_KEY for emails. See README.",
    },
    {
      label: "Google Calendar + Meet",
      // If we've recently seen an actual sync failure, downgrade the badge
      // even though OAuth itself is still technically "connected" — she
      // shouldn't see green when calendar inserts are failing.
      state: googleStatus.connected
        ? settings.googleLastError
          ? "warn"
          : "ok"
        : process.env.GOOGLE_CLIENT_ID
        ? "off"
        : "warn",
      detail: googleStatus.connected
        ? `Connected as ${googleStatus.email}. Schedule a session → Calendar event + Meet link created automatically. If sessions aren't appearing on your Google calendar, click "Test Google connection" to see why.`
        : process.env.GOOGLE_CLIENT_ID
        ? "Google client credentials set, but you haven't connected this account yet. Go to Settings → Google Calendar & Meet → Connect."
        : "Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in env vars first. See README for the 5-min Google Cloud Console setup.",
      extra: googleStatus.connected ? (
        <>
          {settings.googleLastError && (
            <div className="mt-3 text-xs rounded-md p-3 bg-red-50 border border-red-100 text-red-800 leading-relaxed">
              <div className="font-semibold mb-1">
                Last Google error
                {settings.googleLastErrorAt && (
                  <span className="font-normal text-red-700/80 ml-1.5">
                    · {settings.googleLastErrorAt.toLocaleString()}
                  </span>
                )}
              </div>
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-red-900">
                {settings.googleLastError}
              </pre>
              <div className="text-[11px] text-red-700/90 mt-2 leading-relaxed">
                This message comes straight from Google.{" "}
                <strong>If it mentions scopes, grant, or permission</strong>{" "}
                — the fix is to reconnect Google, which forces a fresh
                consent screen and re-grants every scope we need:{" "}
                <ReconnectGoogleButton variant="inline" />.
                <br />
                If it mentions an API not being enabled, ask Brian to enable
                the Google Calendar API in the Google Cloud project that
                issued these credentials.
              </div>
            </div>
          )}
          <TestGoogleButton />
          <SyncAllSessionsButton />
        </>
      ) : null,
    },
    {
      label: "OAuth token encryption at rest",
      state: isTokenEncryptionConfigured() ? "ok" : "warn",
      detail: isTokenEncryptionConfigured()
        ? "Google OAuth tokens are encrypted with AES-256-GCM before being written to the DB. A leaked DB backup won't expose your calendar access."
        : "TOKEN_ENCRYPTION_KEY isn't set, so OAuth tokens are stored in plaintext. Generate one with `node -e \"console.log('base64:' + require('crypto').randomBytes(32).toString('base64'))\"` and add it as an env var on Vercel to encrypt them. Existing tokens upgrade automatically on the next refresh.",
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
                {row.extra}
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
    soon: { bg: "bg-plum-50", fg: "text-plum-700", label: "SOON" },
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
