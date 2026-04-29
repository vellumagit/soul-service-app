import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { listClients, listClientsForPicker } from "@/db/queries";
import { initials, money, relativeTime } from "@/lib/format";
import { NewClientDialog } from "@/components/NewClientDialog";
import { QuickActions } from "@/components/QuickActions";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const [clients, picker] = await Promise.all([
    listClients(),
    listClientsForPicker(),
  ]);

  return (
    <AppShell
      breadcrumb={[
        { label: "Clients", href: "/clients" },
        { label: "Everyone" },
      ]}
      rightAction={<QuickActions clients={picker} />}
    >
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">
            Clients
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            Open a client to see their full profile, sessions, and notes.
          </p>
        </div>
        <NewClientDialog />
      </div>

      {clients.length === 0 ? (
        <div className="border-2 border-dashed border-ink-200 rounded-lg p-12 text-center bg-white">
          <div className="text-base text-ink-900 font-medium mb-2">
            No clients yet.
          </div>
          <div className="text-sm text-ink-500 mb-6 max-w-md mx-auto">
            Add your first one and start building their profile.
          </div>
          <NewClientDialog />
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-2">
            {clients.map((c) => (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="block border border-ink-200 rounded-md p-3 bg-white hover:bg-ink-50"
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    fullName={c.fullName}
                    avatarUrl={c.avatarUrl}
                    size={40}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-ink-900">
                      {c.fullName}
                    </div>
                    {c.workingOn && (
                      <div className="text-xs text-ink-500 truncate">
                        {c.workingOn}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-ink-500">
                      {c.sessionCount} session
                      {c.sessionCount === 1 ? "" : "s"}
                    </div>
                    {c.unpaidCents > 0 && (
                      <div className="text-xs text-amber-700 mt-0.5">
                        {money(c.unpaidCents)} unpaid
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block border border-ink-200 rounded-md overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-ink-500 bg-ink-50/60 border-b border-ink-100">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Client</th>
                  <th className="text-left font-medium px-4 py-2">
                    What they&apos;re working on
                  </th>
                  <th className="text-left font-medium px-4 py-2">Sessions</th>
                  <th className="text-left font-medium px-4 py-2">Last</th>
                  <th className="text-left font-medium px-4 py-2">Next</th>
                  <th className="text-left font-medium px-4 py-2">Paid</th>
                  <th className="text-left font-medium px-4 py-2">Unpaid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {clients.map((c) => (
                  <tr key={c.id} className="row-hover">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/clients/${c.id}`}
                        className="flex items-center gap-3"
                      >
                        <Avatar
                          fullName={c.fullName}
                          avatarUrl={c.avatarUrl}
                          size={32}
                        />
                        <div>
                          <div className="font-medium text-ink-900">
                            {c.fullName}
                          </div>
                          {(c.tags as string[])?.length > 0 && (
                            <div className="flex gap-1 mt-0.5">
                              {(c.tags as string[])
                                .slice(0, 3)
                                .map((t) => (
                                  <span
                                    key={t}
                                    className="text-[10px] text-ink-500"
                                  >
                                    #{t}
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-ink-600 text-xs max-w-xs truncate">
                      {c.workingOn ?? <span className="text-ink-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-900">
                      {c.sessionCount}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-600">
                      {relativeTime(c.lastSessionAt)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-xs ${
                        c.nextSessionAt ? "text-flame-700" : "text-ink-300"
                      }`}
                    >
                      {c.nextSessionAt ? relativeTime(c.nextSessionAt) : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-700">
                      {money(c.lifetimeCents ?? 0)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {c.unpaidCents > 0 ? (
                        <span className="text-amber-700">
                          {money(c.unpaidCents)}
                        </span>
                      ) : (
                        <span className="text-ink-300">—</span>
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

function Avatar({
  fullName,
  avatarUrl,
  size,
}: {
  fullName: string;
  avatarUrl: string | null;
  size: number;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={fullName}
        width={size}
        height={size}
        className="rounded-md object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-md bg-flame-100 text-flame-700 flex items-center justify-center font-semibold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.35),
      }}
    >
      {initials(fullName)}
    </div>
  );
}
