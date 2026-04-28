import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getSoulFile } from "@/db/queries";
import {
  avatarToneClass,
  bytes,
  money,
  readingTypeLabel,
  shortDate,
  relativeTime,
} from "@/lib/format";
import { TimelineFeed } from "@/components/TimelineFeed";
import { ReadingsList } from "@/components/ReadingsList";

const SUBTABS = [
  { key: "timeline", label: "Timeline" },
  { key: "readings", label: "Readings" },
  { key: "documents", label: "Altar & docs" },
  { key: "soul-log", label: "Soul log" },
  { key: "exchange", label: "Offerings & exchange" },
  { key: "intake", label: "Soul intake" },
] as const;

export default async function SoulFilePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { code } = await params;
  const { tab = "timeline" } = await searchParams;
  const decodedCode = decodeURIComponent(code);

  const file = await getSoulFile(decodedCode);
  if (!file) notFound();

  const { soul } = file;

  const completedReadings = file.readings.filter(
    (r) => r.status === "completed"
  );
  const upcomingReadings = file.readings.filter(
    (r) => r.status === "scheduled"
  );
  const lifetimePaidCents = file.invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + i.amountCents, 0);
  const outstandingCents = file.invoices
    .filter((i) => i.status === "outstanding" || i.status === "overdue")
    .reduce((s, i) => s + i.amountCents, 0);
  const avgPerReadingCents = completedReadings.length
    ? Math.round(lifetimePaidCents / completedReadings.length)
    : 0;

  return (
    <AppShell
      breadcrumb={[
        { label: "Souls", href: "/souls" },
        { label: soul.fullName },
      ]}
    >
      {/* — File header (folder-tab strip + identity + stat strip) — */}
      <div className="border border-ink-200 rounded-md bg-ink-50/40 overflow-hidden mb-5">
        <div className="flex items-center gap-1 bg-white border-b border-ink-200 px-2 pt-2">
          <div className="folder-tab bg-ink-50 border border-ink-200 border-b-0 rounded-t px-3 py-1 text-[11px] font-mono text-ink-700">
            {soul.code} · {soul.fullName}
          </div>
          <div className="flex-1" />
          <Link
            href="/souls"
            className="text-[11px] text-ink-500 hover:text-ink-900 px-2 py-1"
          >
            ← Back to all files
          </Link>
        </div>

        <div className="p-5 flex items-start gap-5">
          <div
            className={`w-20 h-20 rounded-md ${avatarToneClass(
              soul.avatarTone
            )} flex items-center justify-center text-2xl font-semibold shrink-0`}
          >
            ·
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">
                {soul.fullName}
              </h1>
              <span className="text-xs text-ink-500">{soul.pronouns}</span>
              <span className="text-xs text-ink-400">·</span>
              <span className="font-mono text-xs text-ink-500">
                {soul.code} · opened {shortDate(soul.createdAt)}
              </span>
            </div>
            <div className="mt-1.5 text-xs text-ink-600 font-mono flex items-center gap-3 flex-wrap">
              {soul.email && <span>{soul.email}</span>}
              {soul.phone && (
                <>
                  <span className="text-ink-300">·</span>
                  <span>{soul.phone}</span>
                </>
              )}
              {soul.city && (
                <>
                  <span className="text-ink-300">·</span>
                  <span>
                    {soul.city}
                    {soul.timezone ? ` · ${soul.timezone}` : ""}
                  </span>
                </>
              )}
            </div>
            <div className="mt-3 flex items-center gap-1.5 flex-wrap">
              {soul.primaryReadingType && (
                <span className="chip bg-flame-100 text-flame-700">
                  {readingTypeLabel(soul.primaryReadingType).toUpperCase()}
                </span>
              )}
              <span className="chip bg-green-50 text-green-700">
                <span className="dot bg-green-500" />
                {soul.status.toUpperCase()}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button className="bg-ink-900 hover:bg-ink-800 text-white text-xs font-medium px-3 py-1.5 rounded">
              Schedule reading
            </button>
            <button className="border border-ink-200 hover:bg-white text-xs font-medium text-ink-700 px-3 py-1.5 rounded">
              Write reading log
            </button>
            <button className="border border-ink-200 hover:bg-white text-xs font-medium text-ink-700 px-3 py-1.5 rounded">
              Altar photo / doc
            </button>
          </div>
        </div>

        <div className="grid grid-cols-6 border-t border-ink-200 bg-white">
          <Stat
            label="Readings held"
            value={completedReadings.length.toString()}
          />
          <Stat label="Love exchanged" value={money(lifetimePaidCents)} mono />
          <Stat
            label="Next meeting"
            value={
              upcomingReadings[upcomingReadings.length - 1]
                ? relativeTime(
                    upcomingReadings[upcomingReadings.length - 1].scheduledAt
                  )
                : "—"
            }
            highlight
          />
          <Stat label="Open exchange" value={money(outstandingCents)} mono />
          <Stat
            label="Avg per reading"
            value={
              avgPerReadingCents > 0 ? money(avgPerReadingCents) : "—"
            }
            mono
          />
          <Stat
            label="In her file"
            value={file.documents.length.toString()}
            last
          />
        </div>
      </div>

      {/* — Subtabs — */}
      <div className="border-b border-ink-200 flex items-center mb-5 -mt-1 text-sm">
        {SUBTABS.map((s) => (
          <Link
            key={s.key}
            href={`/souls/${encodeURIComponent(soul.code)}?tab=${s.key}`}
            data-active={tab === s.key}
            className="subtab border-b-2 border-transparent px-3 py-2 text-ink-500 hover:text-ink-800 font-medium"
          >
            {s.label}
          </Link>
        ))}
      </div>

      {/* — Tab content — */}
      {tab === "timeline" && (
        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-2">
            <TimelineFeed events={file.timelineEvents} />
          </div>
          <aside className="space-y-4">
            <div className="border border-ink-200 rounded-md p-4">
              <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-2">
                What I&apos;m holding for her
              </div>
              <div className="text-sm text-ink-700 leading-relaxed italic">
                {soul.pinnedNote ?? (
                  <span className="text-ink-400">
                    [No pinned note yet — write what you&apos;re holding for
                    this soul]
                  </span>
                )}
              </div>
            </div>
            <div className="border border-ink-200 rounded-md p-4">
              <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-3">
                Where her love work is now
              </div>
              <div className="space-y-3">
                {file.goals.length === 0 ? (
                  <div className="text-xs text-ink-400 italic">
                    [No goals recorded yet]
                  </div>
                ) : (
                  file.goals.map((g) => (
                    <div key={g.id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink-800">{g.label}</span>
                        <span className="font-mono text-[11px] text-ink-500">
                          {g.progress}%
                        </span>
                      </div>
                      <div className="bar mt-1">
                        <span style={{ width: `${g.progress}%` }} />
                      </div>
                      {g.note && (
                        <div className="text-[11px] text-ink-500 mt-1">
                          {g.note}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            {soul.emergencyName && (
              <div className="border border-ink-200 rounded-md p-4">
                <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-2">
                  If anything ever happens
                </div>
                <div className="text-sm text-ink-800">
                  {soul.emergencyName}
                </div>
                <div className="text-xs text-ink-500 font-mono mt-0.5">
                  {soul.emergencyPhone}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {tab === "readings" && <ReadingsList readings={file.readings} />}

      {tab === "documents" && (
        <div className="border border-ink-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-ink-500 bg-ink-50/60 border-b border-ink-100">
              <tr>
                <th className="text-left font-medium px-4 py-2">File</th>
                <th className="text-left font-medium px-4 py-2">Type</th>
                <th className="text-left font-medium px-4 py-2">Size</th>
                <th className="text-left font-medium px-4 py-2">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {file.documents.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-ink-400 text-sm italic"
                  >
                    [No documents yet]
                  </td>
                </tr>
              ) : (
                file.documents.map((d) => (
                  <tr key={d.id} className="row-hover">
                    <td className="px-4 py-2 font-mono text-xs text-ink-900">
                      {d.name}
                    </td>
                    <td className="px-4 py-2">
                      <span className="chip bg-ink-100 text-ink-700">
                        {d.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-ink-500">
                      {bytes(d.sizeBytes)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-ink-500">
                      {relativeTime(d.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "soul-log" && (
        <div className="grid grid-cols-2 gap-5">
          <div className="border border-ink-200 rounded-md p-5">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-3">
              Heart-opening map · pre / post
            </div>
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-ink-400 border-b border-ink-100">
                <tr>
                  <th className="text-left font-medium py-2">Reading</th>
                  <th className="text-left font-medium">Heart open</th>
                  <th className="text-left font-medium">Self-love</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {completedReadings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="text-xs text-ink-400 italic py-3"
                    >
                      No completed readings yet.
                    </td>
                  </tr>
                ) : (
                  completedReadings.map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono text-xs text-ink-700 py-2">
                        {shortDate(r.scheduledAt)}
                      </td>
                      <td className="font-mono text-xs">
                        <span className="text-ink-400">
                          {r.preHeartOpen ?? "—"}
                        </span>{" "}
                        <span className="text-ink-400">→</span>{" "}
                        <span className="text-green-700 font-medium">
                          {r.postHeartOpen ?? "—"}
                        </span>
                      </td>
                      <td className="font-mono text-xs">
                        <span className="text-ink-400">
                          {r.preSelfLove ?? "—"}
                        </span>{" "}
                        <span className="text-ink-400">→</span>{" "}
                        <span className="text-green-700 font-medium">
                          {r.postSelfLove ?? "—"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="border border-ink-200 rounded-md p-5">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-3">
              Love patterns showing up
            </div>
            <div className="flex flex-wrap gap-2">
              {file.themes.length === 0 ? (
                <span className="text-xs text-ink-400 italic">
                  [No themes recorded yet]
                </span>
              ) : (
                file.themes.map((t) => (
                  <span
                    key={t.id}
                    className="chip bg-ink-100 text-ink-700"
                  >
                    {t.label}
                  </span>
                ))
              )}
            </div>
            <div className="mt-5 text-[10px] uppercase tracking-wider text-ink-500 mb-2">
              What I keep receiving for her
            </div>
            <ul className="text-sm text-ink-700 space-y-2 list-disc pl-4">
              {file.observations.length === 0 ? (
                <li className="list-none text-ink-400 italic">
                  [No observations yet]
                </li>
              ) : (
                file.observations.map((o) => <li key={o.id}>{o.body}</li>)
              )}
            </ul>
          </div>
          <div className="col-span-2 border border-ink-200 rounded-md p-5">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-3">
              Intentions she has set (in her own words)
            </div>
            <ol className="text-sm space-y-3">
              {completedReadings.filter((r) => r.intention).length === 0 ? (
                <li className="text-xs text-ink-400 italic list-none">
                  [No intentions recorded yet]
                </li>
              ) : (
                completedReadings
                  .filter((r) => r.intention)
                  .map((r) => (
                    <li
                      key={r.id}
                      className="flex gap-3 items-baseline list-none"
                    >
                      <span className="font-mono text-xs text-ink-400 w-20 shrink-0">
                        {shortDate(r.scheduledAt)}
                      </span>
                      <span className="text-ink-700 italic">
                        {r.intention}
                      </span>
                    </li>
                  ))
              )}
            </ol>
          </div>
        </div>
      )}

      {tab === "exchange" && (
        <>
          <div className="grid grid-cols-4 border border-ink-200 rounded-md overflow-hidden mb-5">
            <Stat label="Lifetime paid" value={money(lifetimePaidCents)} mono />
            <Stat label="Outstanding" value={money(outstandingCents)} mono />
            <Stat
              label="Avg per reading"
              value={avgPerReadingCents > 0 ? money(avgPerReadingCents) : "—"}
              mono
            />
            <Stat label="Payment method" value="Stripe" last />
          </div>
          <div className="border border-ink-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-ink-500 bg-ink-50/60 border-b border-ink-100">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Invoice</th>
                  <th className="text-left font-medium px-4 py-2">Issued</th>
                  <th className="text-left font-medium px-4 py-2">Due</th>
                  <th className="text-left font-medium px-4 py-2">Amount</th>
                  <th className="text-left font-medium px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {file.invoices.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-ink-400 text-sm italic"
                    >
                      [No invoices yet]
                    </td>
                  </tr>
                ) : (
                  file.invoices.map((i) => (
                    <tr key={i.id} className="row-hover">
                      <td className="px-4 py-2 font-mono text-xs font-medium text-ink-900">
                        {i.number}
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
                        <span className="chip bg-green-50 text-green-700">
                          {i.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "intake" && (
        <div className="grid grid-cols-2 gap-5">
          <div className="border border-ink-200 rounded-md p-5">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-3">
              Contact
            </div>
            <dl className="text-sm grid grid-cols-[120px_1fr] gap-y-2 gap-x-4">
              <dt className="text-ink-500 text-xs">Email</dt>
              <dd className="text-ink-800">{soul.email ?? "—"}</dd>
              <dt className="text-ink-500 text-xs">Phone</dt>
              <dd className="text-ink-800">{soul.phone ?? "—"}</dd>
              <dt className="text-ink-500 text-xs">City</dt>
              <dd className="text-ink-800">{soul.city ?? "—"}</dd>
              <dt className="text-ink-500 text-xs">Timezone</dt>
              <dd className="text-ink-800">{soul.timezone ?? "—"}</dd>
              <dt className="text-ink-500 text-xs">Pronouns</dt>
              <dd className="text-ink-800">{soul.pronouns ?? "—"}</dd>
              <dt className="text-ink-500 text-xs">Source</dt>
              <dd className="text-ink-800">{soul.source ?? "—"}</dd>
            </dl>
          </div>
          <div className="border border-ink-200 rounded-md p-5">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-3">
              Consents &amp; agreements
            </div>
            <ul className="text-sm space-y-2">
              {file.consents.length === 0 ? (
                <li className="text-ink-400 italic text-xs">
                  [No consents recorded]
                </li>
              ) : (
                file.consents.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between border-b border-ink-100 pb-2 last:border-0"
                  >
                    <span className="text-ink-800">{c.label}</span>
                    <span className="text-xs text-green-700">{c.status}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="col-span-2 border border-ink-200 rounded-md p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-500">
                Intake answers
              </div>
            </div>
            <dl className="text-sm grid grid-cols-[280px_1fr] gap-y-3 gap-x-4">
              {file.intakeAnswers.length === 0 ? (
                <div className="col-span-2 text-ink-400 italic">
                  [No intake answers recorded]
                </div>
              ) : (
                file.intakeAnswers.map((a) => (
                  <div key={a.id} className="contents">
                    <dt className="text-ink-500 text-xs">{a.question}</dt>
                    <dd className="text-ink-800">{a.answer ?? "—"}</dd>
                  </div>
                ))
              )}
            </dl>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Stat({
  label,
  value,
  mono,
  highlight,
  last,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`px-4 py-3 ${last ? "" : "border-r border-ink-100"}`}
    >
      <div className="text-[10px] uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div
        className={`mt-0.5 ${
          highlight
            ? "text-sm font-medium text-flame-700"
            : "text-lg font-semibold text-ink-900"
        } ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
