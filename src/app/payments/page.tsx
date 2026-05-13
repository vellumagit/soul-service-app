import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import {
  listAllSessionsForPayments,
  listClientsForPicker,
  getPaymentTotals,
  getSettings,
} from "@/db/queries";
import {
  fullDate,
  money,
  paymentMethodLabel,
} from "@/lib/format";
import { MarkPaidDialog } from "@/components/MarkPaidDialog";
import { QuickActions } from "@/components/QuickActions";
import { requireSession } from "@/lib/session-cookies";
import { asLocale, t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { email: userEmail } = await requireSession();
  const { filter = "all" } = await searchParams;

  const [sessions, clients, totals, settings] = await Promise.all([
    listAllSessionsForPayments(),
    listClientsForPicker(),
    getPaymentTotals(),
    getSettings(),
  ]);
  const locale = asLocale(settings.uiLanguage);

  const filtered = sessions.filter((s) => {
    if (filter === "unpaid")
      return s.status === "completed" && !s.paid;
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
        <>
          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {filtered.map((s) => (
              <div
                key={s.id}
                className="border border-ink-200 rounded-md p-3 bg-white"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Link
                    href={`/clients/${s.clientId}`}
                    className="font-medium text-ink-900 hover:underline flex-1 truncate"
                  >
                    {s.clientName}
                  </Link>
                  <span
                    className={`chip ${
                      s.paid
                        ? "bg-green-50 text-green-700"
                        : s.status === "scheduled"
                        ? "bg-flame-100 text-flame-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {s.paid
                      ? "PAID"
                      : s.status === "scheduled"
                      ? "UPCOMING"
                      : "UNPAID"}
                  </span>
                </div>
                <div className="text-xs text-ink-500">
                  {s.type} · {fullDate(s.scheduledAt)}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-ink-700 font-medium">
                    {s.paymentAmountCents
                      ? money(s.paymentAmountCents)
                      : s.paid
                      ? "—"
                      : ""}
                    {s.paid && s.paymentMethod && (
                      <span className="text-xs text-ink-500 ml-2">
                        · {paymentMethodLabel(s.paymentMethod)}
                      </span>
                    )}
                  </span>
                  {!s.paid && s.status === "completed" && (
                    <MarkPaidDialog
                      sessionId={s.id}
                      clientId={s.clientId}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop */}
          <div className="hidden md:block border border-ink-200 rounded-md overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-ink-500 bg-ink-50/60 border-b border-ink-100">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Date</th>
                  <th className="text-left font-medium px-4 py-2">Client</th>
                  <th className="text-left font-medium px-4 py-2">Type</th>
                  <th className="text-left font-medium px-4 py-2">Status</th>
                  <th className="text-left font-medium px-4 py-2">Method</th>
                  <th className="text-left font-medium px-4 py-2">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="row-hover">
                    <td className="px-4 py-2 font-mono text-xs text-ink-600">
                      {fullDate(s.scheduledAt)}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/clients/${s.clientId}`}
                        className="text-ink-900 hover:underline"
                      >
                        {s.clientName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-ink-600">{s.type}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`chip ${
                          s.paid
                            ? "bg-green-50 text-green-700"
                            : s.status === "scheduled"
                            ? "bg-flame-100 text-flame-700"
                            : s.status === "completed"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-ink-100 text-ink-500"
                        }`}
                      >
                        {s.paid
                          ? "PAID"
                          : s.status === "scheduled"
                          ? "UPCOMING"
                          : s.status === "completed"
                          ? "UNPAID"
                          : s.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-ink-600">
                      {s.paid ? paymentMethodLabel(s.paymentMethod) : "—"}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-ink-900 font-medium">
                      {s.paymentAmountCents
                        ? money(s.paymentAmountCents)
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {!s.paid && s.status === "completed" && (
                        <MarkPaidDialog
                          sessionId={s.id}
                          clientId={s.clientId}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
