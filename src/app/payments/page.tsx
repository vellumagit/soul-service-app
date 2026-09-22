import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import {
  listAllSessionsForPayments,
  listClientsForPicker,
  getPaymentTotals,
  getSettings,
} from "@/db/queries";
import { money } from "@/lib/format";
import { resolveTimeZone } from "@/lib/timezone";
import { PaymentsLedger } from "@/components/PaymentsLedger";
import { QuickActions } from "@/components/QuickActions";
import { requireSession } from "@/lib/session-cookies";
import { asLocale, t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { email: userEmail, accountId } = await requireSession();
  const { filter = "all" } = await searchParams;

  const [sessions, clients, totals, settings] = await Promise.all([
    listAllSessionsForPayments(accountId),
    listClientsForPicker(accountId),
    getPaymentTotals(accountId),
    getSettings(accountId),
  ]);
  const locale = asLocale(settings.uiLanguage);
  const practiceTz = resolveTimeZone(settings.timezone);

  const filtered = sessions.filter((s) => {
    if (filter === "unpaid")
      return (
        s.status === "completed" && !s.paid && s.paymentMethod !== "gifted"
      );
    if (filter === "paid") return s.paid;
    if (filter === "scheduled") return s.status === "scheduled";
    return true;
  });

  return (
    <AppShell
      breadcrumb={[
        { label: t(locale, "nav.payments"), href: "/payments" },
        { label: filterLabel(filter) },
      ]}
      rightAction={<QuickActions clients={clients} />}
      userEmail={userEmail}
      locale={locale}
      timeZone={settings.timezone}
    >
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">
          {t(locale, "payments.title")}
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          Every session you&apos;ve held — paid and unpaid.
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <StatCard label="This month" value={money(totals.paidThisMonthCents)} />
        <StatCard label="This year" value={money(totals.paidThisYearCents)} />
        <StatCard
          label="Unpaid"
          value={money(totals.unpaidCents)}
          tone={totals.unpaidCents > 0 ? "amber" : "default"}
          subtitle={
            totals.unpaidCount > 0
              ? `${totals.unpaidCount} session${totals.unpaidCount === 1 ? "" : "s"}`
              : "all caught up"
          }
        />
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-4 text-sm overflow-x-auto">
        <FilterPill href="/payments" active={filter === "all"} label="All" />
        <FilterPill
          href="/payments?filter=unpaid"
          active={filter === "unpaid"}
          label="Unpaid"
        />
        <FilterPill
          href="/payments?filter=paid"
          active={filter === "paid"}
          label="Paid"
        />
        <FilterPill
          href="/payments?filter=scheduled"
          active={filter === "scheduled"}
          label="Upcoming"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="border-2 border-dashed border-ink-200 rounded-md p-12 text-center bg-white">
          <div className="text-sm text-ink-500">
            {filter === "all"
              ? "No sessions yet."
              : `No ${filterLabel(filter).toLowerCase()} sessions.`}
          </div>
        </div>
      ) : (
        <PaymentsLedger
          // Reset paging when she switches filter — otherwise expanding to
          // 500 rows under "All" would carry straight over into "Unpaid".
          key={filter}
          rows={filtered}
          practiceTz={practiceTz}
          defaultRateCents={settings.defaultRateCents}
        />
      )}
    </AppShell>
  );
}

function filterLabel(filter: string): string {
  if (filter === "unpaid") return "Unpaid";
  if (filter === "paid") return "Paid";
  if (filter === "scheduled") return "Upcoming";
  return "All";
}

function FilterPill({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
        active
          ? "bg-ink-900 text-white"
          : "bg-white border border-ink-200 text-ink-700 hover:bg-ink-50"
      }`}
    >
      {label}
    </Link>
  );
}

function StatCard({
  label,
  value,
  subtitle,
  tone = "default",
}: {
  label: string;
  value: string;
  subtitle?: string;
  tone?: "default" | "amber" | "red";
}) {
  const valueCls = {
    default: "text-ink-900",
    amber: "text-amber-700",
    red: "text-red-700",
  }[tone];
  return (
    <div className="border border-ink-200 rounded-md p-4 bg-white">
      <div className="text-[10px] uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold font-mono ${valueCls}`}>
        {value}
      </div>
      {subtitle && (
        <div className="text-[11px] text-ink-500 mt-0.5">{subtitle}</div>
      )}
    </div>
  );
}
