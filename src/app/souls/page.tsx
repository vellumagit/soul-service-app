import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { listSouls } from "@/db/queries";
import {
  avatarToneClass,
  flagChip,
  money,
  relativeTime,
} from "@/lib/format";
import { NewSoulDialog } from "@/components/NewSoulDialog";

export const dynamic = "force-dynamic";

export default async function SoulsPage() {
  const souls = await listSouls();

  return (
    <AppShell
      breadcrumb={[
        { label: "Souls", href: "/souls" },
        { label: "Everyone in my care" },
      ]}
    >
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 tracking-tight">
            Souls in my care
          </h1>
          <p className="text-xs text-ink-500 mt-0.5">
            Each row = one soul&apos;s file. Click any to open the full
            structure.
          </p>
        </div>
        <NewSoulDialog />
      </div>

      {souls.length === 0 ? (
        <div className="border border-dashed border-ink-300 rounded-md p-12 text-center">
          <div className="text-sm text-ink-700 font-medium mb-1">
            No souls yet.
          </div>
          <div className="text-xs text-ink-500 mb-5 max-w-md mx-auto">
            Open the first file when someone books with you. Everything you
            track for them — readings, notes, intentions, where their love work
            is — lives inside that file.
          </div>
          <NewSoulDialog />
        </div>
      ) : (
        <div className="border border-ink-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-ink-500 bg-ink-50/60 border-b border-ink-100">
              <tr>
                <th className="text-left font-medium px-4 py-2">Soul</th>
                <th className="text-left font-medium px-4 py-2">
                  The work they&apos;re in
                </th>
                <th className="text-left font-medium px-4 py-2">Readings</th>
                <th className="text-left font-medium px-4 py-2">Last</th>
                <th className="text-left font-medium px-4 py-2">Next</th>
                <th className="text-left font-medium px-4 py-2">Exchanged</th>
                <th className="text-left font-medium px-4 py-2">Files</th>
                <th className="text-left font-medium px-4 py-2">Needs care</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {souls.map((s) => {
                const initials = s.fullName
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                return (
                  <tr key={s.id} className="row-hover">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/souls/${encodeURIComponent(s.code)}`}
                        className="flex items-center gap-3 group"
                      >
                        <div
                          className={`w-8 h-8 rounded-md ${avatarToneClass(
                            s.avatarTone
                          )} flex items-center justify-center text-xs font-semibold`}
                        >
                          {initials}
                        </div>
                        <div>
                          <div className="font-medium text-ink-900 flex items-center gap-2">
                            {s.fullName}{" "}
                            <span className="font-mono text-[10px] text-ink-400">
                              {s.code}
                            </span>
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-ink-600 text-xs">
                      {s.workingOn ?? (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-900">
                      {s.readingCount}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-600">
                      {relativeTime(s.lastReadingAt)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-xs ${
                        s.nextReadingAt ? "text-flame-700" : "text-ink-300"
                      }`}
                    >
                      {s.nextReadingAt ? relativeTime(s.nextReadingAt) : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-900">
                      {money(s.lifetimeCents ?? 0)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-600">
                      {s.documentCount}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(s.flags as string[]).length === 0 ? (
                          <span className="text-ink-300">—</span>
                        ) : (
                          (s.flags as string[]).map((f) => {
                            const { label, cls } = flagChip(f);
                            return (
                              <span key={f} className={`chip ${cls}`}>
                                {label}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
