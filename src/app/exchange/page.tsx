import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { listInvoices } from "@/db/queries";
import { money, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_CHIP: Record<string, string> = {
  paid: "bg-green-50 text-green-700",
  outstanding: "bg-amber-50 text-amber-700",
  overdue: "bg-red-50 text-red-700",
  draft: "bg-ink-100 text-ink-500",
  sent: "bg-ink-100 text-ink-700",
  void: "bg-ink-100 text-ink-400",
};

export default async function ExchangePage() {
  const invoices = await listInvoices();

  const paid = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + i.amountCents, 0);
  const outstanding = invoices
    .filter((i) => i.status === "outstanding")
    .reduce((s, i) => s + i.amountCents, 0);
  const overdue = invoices
    .filter((i) => i.status === "overdue")
    .reduce((s, i) => s + i.amountCents, 0);

  return (
    <AppShell
      breadcrumb={[
        { label: "Exchange", href: "/exchange" },
        { label: "Open & received" },
      ]}
    >
      <h1 className="text-xl font-semibold text-ink-900 tracking-tight mb-5">
        Exchange
      </h1>

      <div className="grid grid-cols-4 border border-ink-200 rounded-md overflow-hidden mb-5">
        <Stat label="Paid lifetime" value={money(paid)} />
        <Stat label="Outstanding" value={money(outstanding)} />
        <Stat label="Overdue" value={money(overdue)} />
        <Stat label="Total invoices" value={invoices.length.toString()} last />
      </div>

      <div className="border border-ink-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-ink-500 bg-ink-50/60 border-b border-ink-100">
            <tr>
              <th className="text-left font-medium px-4 py-2">Invoice</th>
              <th className="text-left font-medium px-4 py-2">Soul</th>
              <th className="text-left font-medium px-4 py-2">Issued</th>
              <th className="text-left font-medium px-4 py-2">Due</th>
              <th className="text-left font-medium px-4 py-2">Amount</th>
              <th className="text-left font-medium px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {invoices.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-ink-400 text-sm italic"
                >
                  [No invoices yet]
                </td>
              </tr>
            ) : (
              invoices.map((i) => (
                <tr key={i.id} className="row-hover">
                  <td className="px-4 py-2 font-mono text-xs font-medium text-ink-900">
                    {i.number}
                  </td>
                  <td className="px-4 py-2 text-ink-700">
                    <Link
                      href={`/souls`}
                      className="hover:underline"
                    >
                      {i.soulName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-600">
                    {shortDate(i.issuedAt)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-600">
                    {shortDate(i.dueAt)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-900 font-medium">
                    {money(i.amountCents, i.currency)}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`chip ${
                        STATUS_CHIP[i.status] ?? "bg-ink-100 text-ink-600"
                      }`}
                    >
                      {i.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div className={`px-4 py-3 ${last ? "" : "border-r border-ink-100"}`}>
      <div className="text-[10px] uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold text-ink-900 font-mono">
        {value}
      </div>
    </div>
  );
}
