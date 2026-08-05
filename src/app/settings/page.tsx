import { AppShell } from "@/components/AppShell";
import {
  getSettings,
  listClientsForPicker,
  listEmailTemplates,
  listNoteTemplates,
  listLandingReviews,
  listLandingOffers,
} from "@/db/queries";
import { getGoogleConnectionStatus } from "@/lib/google-calendar";
import { QuickActions } from "@/components/QuickActions";
import { SettingsForm } from "@/components/SettingsForm";
import { TemplatesManager } from "@/components/TemplatesManager";
import { GoogleCalendarSection } from "@/components/GoogleCalendarSection";
import { PaymentsSection } from "@/components/PaymentsSection";
import { PasswordSettings } from "@/components/PasswordSettings";
import { isStripeConnectEnabled } from "@/lib/stripe";
import { requireSession } from "@/lib/session-cookies";
import { getAccountPasswordHash } from "@/lib/account";
import { asLocale, t } from "@/lib/i18n";
import {
  SettingsTabsProvider,
  SettingsTabBar,
  SettingsPanel,
} from "@/components/SettingsTabs";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    google?: string;
    email?: string;
    reason?: string;
    stripe?: string;
    tab?: string;
  }>;
}) {
  const { email: userEmail, accountId } = await requireSession();
  const { google, email, reason, stripe, tab } = await searchParams;

  const [
    settings,
    clientsList,
    emailTpls,
    noteTpls,
    googleStatus,
    passwordHash,
    reviews,
    offers,
  ] = await Promise.all([
    getSettings(accountId),
    listClientsForPicker(accountId),
    listEmailTemplates(accountId),
    listNoteTemplates(accountId),
    getGoogleConnectionStatus(accountId),
    getAccountPasswordHash(accountId),
    listLandingReviews(accountId),
    listLandingOffers(accountId),
  ]);

  const flashStatus =
    google === "connected" ? "connected" : google === "error" ? "error" : null;
  const locale = asLocale(settings.uiLanguage);

  // Coming back from a Google or Stripe redirect, land on the tab that shows
  // the result — otherwise the flash message renders on a hidden panel and she
  // sees nothing at all.
  const initialTab = google
    ? "connections"
    : stripe
      ? "money"
      : tab;

  return (
    <AppShell
      breadcrumb={[{ label: t(locale, "nav.settings"), href: "/settings" }]}
      rightAction={<QuickActions clients={clientsList} />}
      userEmail={userEmail}
      locale={locale}
      timeZone={settings.timezone}
    >
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">
          {t(locale, "settings.title")}
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          {t(locale, "settings.subtitle")}
        </p>
      </div>

      <SettingsTabsProvider initial={initialTab}>
        <SettingsTabBar />

        {/* Panels OUTSIDE the settings form. Each of these saves itself, so
            unlike the form's sections they can unmount freely. */}
        <SettingsPanel tab="connections">
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
        </SettingsPanel>

        <SettingsPanel tab="money">
          <div className="mb-5">
            <PaymentsSection
              platformReady={
                isStripeConnectEnabled() && !!process.env.STRIPE_WEBHOOK_SECRET
              }
              connected={!!settings.stripeAccountId}
              chargesEnabled={!!settings.stripeChargesEnabled}
              flash={stripe ?? null}
            />
          </div>
        </SettingsPanel>

        <SettingsPanel tab="account">
          <div className="mb-5">
            <PasswordSettings hasPassword={!!passwordHash} />
          </div>
        </SettingsPanel>

        <SettingsPanel tab="templates">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
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
        </SettingsPanel>

        {/* The settings form itself. Every one of its sections stays MOUNTED
            whichever tab is showing — see SettingsTabs.tsx for why. */}
        <SettingsForm
          settings={settings}
          reviews={reviews}
          offers={offers}
        />
      </SettingsTabsProvider>
    </AppShell>
  );
}
