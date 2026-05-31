// /network/inbox — triage queue for incoming lead-form submissions.
//
// Every submission to /api/leads/intake (on a form that isn't auto-accept)
// lands here as `status="pending"`. She decides:
//
//   Accept   → creates a Network entry (clients row, is_lead=true) using
//              the form's defaultIntent as the source line + any "intent" /
//              "working_on" field as the workingOn, with the rest of the
//              custom fields folded into private notes for context.
//   Reject   → flips status, never appears in /network.
//   Delete   → hard-removes the submission row (used to clean history).
//
// Also shows reviewed entries for context — toggle filter at top.

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { LeadInboxList } from "@/components/LeadInboxList";
import {
  listLeadInbox,
  listClientsForPicker,
  getSettings,
} from "@/db/queries";
import { requireSession } from "@/lib/session-cookies";
import { asLocale, t } from "@/lib/i18n";
import { QuickActions } from "@/components/QuickActions";

export const dynamic = "force-dynamic";

const FILTERS: {
  value: "pending" | "accepted" | "rejected" | "all";
  label: string;
}[] = [
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

export default async function LeadInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { email, accountId } = await requireSession();
  const { filter: filterRaw = "pending" } = await searchParams;
  const filter = (
    FILTERS.some((f) => f.value === filterRaw) ? filterRaw : "pending"
  ) as "pending" | "accepted" | "rejected" | "all";

  const [submissions, picker, settings] = await Promise.all([
    listLeadInbox(accountId, filter),
    listClientsForPicker(accountId),
    getSettings(accountId),
  ]);
  const locale = asLocale(settings.uiLanguage);

  return (
    <AppShell
      breadcrumb={[
        { label: t(locale, "nav.network"), href: "/network" },
        { label: "Inbox" },
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
              Inbox
            </h1>
            <p className="text-sm text-ink-500 italic serif-italic mt-1">
              Form submissions waiting for review.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/network/forms"
              className="text-xs text-plum-700 hover:underline font-medium"
            >
              Manage forms →
            </Link>
            <Link
              href="/network"
              className="text-xs text-ink-500 hover:text-ink-900"
            >
              ← Back to Network
            </Link>
          </div>
        </div>
      </header>

      <div className="flex items-center gap-2 mb-4 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={
              f.value === "pending"
                ? "/network/inbox"
                : `/network/inbox?filter=${f.value}`
            }
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 ${
              filter === f.value
                ? "bg-ink-900 text-white"
                : "bg-white border border-ink-200 text-ink-700 hover:bg-ink-50"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {submissions.length === 0 ? (
        <div className="paper-card p-10 text-center max-w-xl mx-auto">
          <h2
            className="serif-italic text-xl text-plum-700 mb-2"
            style={{ fontWeight: 400 }}
          >
            {filter === "pending"
              ? "Nothing waiting."
              : `No ${filter} submissions yet.`}
          </h2>
          <p className="text-sm text-ink-600 leading-relaxed">
            {filter === "pending" ? (
              <>
                When a form POSTs to the intake endpoint, it&apos;ll appear
                here for triage.{" "}
                <Link
                  href="/network/forms"
                  className="text-plum-700 hover:underline"
                >
                  Set up a form →
                </Link>
              </>
            ) : (
              <Link
                href="/network/inbox"
                className="text-plum-700 hover:underline"
              >
                See pending →
              </Link>
            )}
          </p>
        </div>
      ) : (
        <LeadInboxList submissions={submissions} filter={filter} />
      )}
    </AppShell>
  );
}
