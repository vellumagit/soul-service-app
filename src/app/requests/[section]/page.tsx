// One kind of request, on its own page.
//
// Reached from a card on /requests. The whole point of the split is that
// this page holds exactly one decision-type — a list of reschedule requests,
// or a list of Circle sign-ups — instead of ten piles in one scroll.
//
// A section that's currently empty still renders (rather than 404ing): she
// may have just cleared the last one, and "you've finished these" is a
// better landing than an error.

import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { QuickActions } from "@/components/QuickActions";
import { requireSession } from "@/lib/session-cookies";
import { getLooseEnds, getSettings, listClientsForPicker } from "@/db/queries";
import { resolveTimeZone } from "@/lib/timezone";
import { asLocale } from "@/lib/i18n";
import { findRequestSection } from "@/lib/request-sections";
import {
  ProductPurchasesSection,
  RefundRequestsSection,
  GroupSignupsSection,
  BookingRequestsSection,
  RescheduleRequestsSection,
  Section,
} from "@/components/RequestSections";

export const dynamic = "force-dynamic";

export default async function RequestSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: slug } = await params;
  const meta = findRequestSection(slug);
  if (!meta) notFound();

  const { email, accountId } = await requireSession();
  const [ends, settings, clients] = await Promise.all([
    getLooseEnds(accountId),
    getSettings(accountId),
    listClientsForPicker(accountId),
  ]);
  const locale = asLocale(settings.uiLanguage);
  const tz = resolveTimeZone(settings.timezone);
  const count = meta.count(ends);
  // Signs the pre-written reply draft on request rows.
  const practitionerFirstName =
    settings.practitionerName?.split(" ")[0] ?? "me";

  return (
    <AppShell
      breadcrumb={[
        { label: "Requests", href: "/requests" },
        { label: meta.title },
      ]}
      rightAction={<QuickActions clients={clients} />}
      userEmail={email}
      locale={locale}
      timeZone={settings.timezone}
    >
      <Link
        href="/requests"
        className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 mb-5"
      >
        ← All requests
      </Link>

      <header className="mb-6 max-w-3xl">
        <h1
          className="text-3xl md:text-4xl text-ink-900 serif mb-2"
          style={{ fontWeight: 500, letterSpacing: "-0.015em" }}
        >
          {meta.title}
        </h1>
        <p className="text-sm text-ink-500 italic serif-italic">
          {meta.blurb}
        </p>
      </header>

      {count === 0 ? (
        <div className="paper-card p-12 text-center max-w-2xl">
          <div
            className="serif-italic text-lg text-plum-700 mb-2"
            style={{ fontWeight: 400 }}
          >
            Nothing here.
          </div>
          <p className="text-sm text-ink-500 leading-relaxed">
            You&apos;ve cleared these.{" "}
            <Link href="/requests" className="text-plum-700 hover:underline">
              Back to everything else →
            </Link>
          </p>
        </div>
      ) : (
        <div className="max-w-3xl">
          {renderSection(slug, ends, tz, practitionerFirstName)}
        </div>
      )}
    </AppShell>
  );
}

/** Slug → the renderer that knows how to draw that pile. Kept next to the
 *  catalogue in lib/request-sections so adding a kind touches two places
 *  that sit beside each other, not ten scattered ones. */
function renderSection(
  slug: string,
  ends: Awaited<ReturnType<typeof getLooseEnds>>,
  tz: string,
  practitionerFirstName: string
) {
  switch (slug) {
    case "reschedules":
      return (
        <RescheduleRequestsSection
          rows={ends.rescheduleRequests}
          timeZone={tz}
          practitionerFirstName={practitionerFirstName}
        />
      );
    case "sessions":
      return (
        <BookingRequestsSection
          rows={ends.bookingRequests}
          timeZone={tz}
          practitionerFirstName={practitionerFirstName}
        />
      );
    case "refunds":
      return (
        <RefundRequestsSection rows={ends.refundRequests} timeZone={tz} />
      );
    case "circle-signups":
      return <GroupSignupsSection rows={ends.groupSignups} timeZone={tz} />;
    case "purchases":
      return (
        <ProductPurchasesSection rows={ends.productPurchases} timeZone={tz} />
      );
    case "notetaker":
      return (
        <Section
          title="Notetaker didn't show up"
          hint="The Recall bot hit a fatal status. You can try sending a new one (if the session is happening now), or write notes by hand."
          count={ends.botFailed.length}
          tone="warning"
          rows={ends.botFailed}
          actionLabel="Open session →"
          timeZone={tz}
          showRetryBot
        />
      );
    case "closings":
      return (
        <Section
          title="Waiting for a closing"
          hint="Completed sessions where you didn't pause for the three quiet questions. Doing it now still counts — the work is fresh until you say it isn't."
          count={ends.needReflection.length}
          rows={ends.needReflection}
          actionLabel="Reflect →"
          timeZone={tz}
          showReflectInline
        />
      );
    case "notes":
      return (
        <Section
          title="Notes to write up"
          hint="Sessions you marked complete but never typed into. Even a few lines is enough — the texture of the thing is what matters."
          count={ends.needNotes.length}
          rows={ends.needNotes}
          actionLabel="Open session →"
          timeZone={tz}
        />
      );
    case "intentions":
      return (
        <Section
          title="Intentions to set"
          hint="Upcoming sessions without anything in the intention field. Not required — just a kindness to your future self walking in."
          count={ends.needIntention.length}
          rows={ends.needIntention}
          actionLabel="Open session →"
          timeZone={tz}
        />
      );
    case "payments":
      return (
        <Section
          title="Payments to mark"
          hint="Completed but not yet marked paid. Mark as gifted / no charge if it wasn't a paying session."
          count={ends.needPayment.length}
          rows={ends.needPayment}
          actionLabel="Open session →"
          timeZone={tz}
        />
      );
    default:
      return null;
  }
}
