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
import { EditableField } from "@/components/EditableField";
import { ScheduleReadingDialog } from "@/components/ScheduleReadingDialog";
import { ReadingCard } from "@/components/ReadingCard";
import { GoalsBlock } from "@/components/GoalsBlock";
import { TagListBlock } from "@/components/TagListBlock";
import { ObservationsBlock } from "@/components/ObservationsBlock";
import { IntakeBlock } from "@/components/IntakeBlock";
import {
  updateSoulField,
  addTheme,
  deleteTheme,
} from "@/lib/actions";

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

  // Bind soul id + field for inline edits — server actions can be partially applied.
  const saveField = (field: string) =>
    updateSoulField.bind(null, soul.id, field);

  return (
    <AppShell
      breadcrumb={[
        { label: "Souls", href: "/souls" },
        { label: soul.fullName },
      ]}
    >
      {/* — File header — */}
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
            {soul.fullName
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap text-2xl font-semibold text-ink-900 tracking-tight">
              <EditableField
                value={soul.fullName}
                onSave={saveField("fullName")}
                placeholder="Full name"
                className="text-2xl font-semibold text-ink-900"
              />
              <span className="text-xs text-ink-500 font-normal">
                <EditableField
                  value={soul.pronouns}
                  onSave={saveField("pronouns")}
                  placeholder="pronouns"
                />
              </span>
              <span className="font-mono text-xs text-ink-500 font-normal">
                {soul.code} · opened {shortDate(soul.createdAt)}
              </span>
            </div>
            <div className="mt-1.5 text-xs text-ink-600 font-mono flex items-center gap-3 flex-wrap">
              <EditableField
                value={soul.email}
                onSave={saveField("email")}
                placeholder="email"
              />
              <span className="text-ink-300">·</span>
              <EditableField
                value={soul.phone}
                onSave={saveField("phone")}
                placeholder="phone"
              />
              <span className="text-ink-300">·</span>
              <EditableField
                value={soul.city}
                onSave={saveField("city")}
                placeholder="city"
              />
              <span className="text-ink-300">·</span>
              <EditableField
                value={soul.timezone}
                onSave={saveField("timezone")}
                placeholder="timezone"
              />
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
              <span className="chip bg-flame-100 text-flame-700">
                {soul.primaryReadingType
                  ? readingTypeLabel(soul.primaryReadingType).toUpperCase()
                  : "READING TYPE TBD"}
              </span>
              <span className="chip bg-green-50 text-green-700">
                <span className="dot bg-green-500" />
                {soul.status.toUpperCase()}
              </span>
              <span className="text-ink-500">Working on:</span>
              <span className="flex-1 max-w-md text-ink-700">
                <EditableField
                  value={soul.workingOn}
                  onSave={saveField("workingOn")}
                  placeholder="short phrase naming the love work"
                />
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <ScheduleReadingDialog
              soulId={soul.id}
              defaultType={soul.primaryReadingType}
            />
          </div>
        </div>

        <div className="grid grid-cols-6 border-t border-ink-200 bg-white">
          <Stat
            label="Readings held"
            value={completedReadings.length.toString()}
          />
          <Stat
            label="Love exchanged"
            value={money(lifetimePaidCents)}
            mono
          />
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
            value={avgPerReadingCents > 0 ? money(avgPerReadingCents) : "—"}
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
                <EditableField
                  value={soul.pinnedNote}
                  onSave={saveField("pinnedNote")}
                  placeholder="What you're holding for this soul. Click to write."
                  multiline
                  italic
                />
              </div>
            </div>
            <div className="border border-ink-200 rounded-md p-4">
              <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-3">
                Where her love work is now
              </div>
              <GoalsBlock soulId={soul.id} goals={file.goals} />
            </div>
            <div className="border border-ink-200 rounded-md p-4">
              <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-2">
                If anything ever happens
              </div>
              <div className="text-sm text-ink-800">
                <EditableField
                  value={soul.emergencyName}
                  onSave={saveField("emergencyName")}
                  placeholder="Emergency contact name"
                />
              </div>
              <div className="text-xs text-ink-500 font-mono mt-0.5">
                <EditableField
                  value={soul.emergencyPhone}
                  onSave={saveField("emergencyPhone")}
                  placeholder="Emergency phone"
                />
              </div>
            </div>
          </aside>
        </div>
      )}

      {tab === "readings" && (
        <div className="space-y-3">
          {file.readings.length === 0 ? (
            <div className="border border-dashed border-ink-300 rounded-md p-8 text-center">
              <div className="text-sm text-ink-500 mb-3">
                No readings yet. Schedule the first one when you&apos;re ready.
              </div>
              <ScheduleReadingDialog
                soulId={soul.id}
                defaultType={soul.primaryReadingType}
              />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-end mb-3">
                <ScheduleReadingDialog
                  soulId={soul.id}
                  defaultType={soul.primaryReadingType}
                />
              </div>
              {file.readings.map((r) => (
                <ReadingCard key={r.id} reading={r} />
              ))}
            </>
          )}
        </div>
      )}

      {tab === "documents" && (
        <div className="border border-dashed border-ink-300 rounded-md p-8 text-center">
          <div className="text-sm text-ink-500">
            File uploads coming soon — currently a stub.
          </div>
          <div className="text-[11px] text-ink-400 mt-1">
            Will support: session recordings, intake PDFs, altar photos,
            consent forms, voice memos.
          </div>
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
                      No completed readings yet — pre/post numbers will show up
                      after you complete one.
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
            <TagListBlock
              soulId={soul.id}
              tags={file.themes.map((t) => ({ id: t.id, label: t.label }))}
              onAdd={addTheme}
              onDelete={deleteTheme}
              emptyText="No themes yet — add tags as patterns reveal themselves."
            />
            <div className="mt-5 text-[10px] uppercase tracking-wider text-ink-500 mb-2">
              What I keep receiving for her
            </div>
            <ObservationsBlock
              soulId={soul.id}
              observations={file.observations}
            />
          </div>
          <div className="col-span-2 border border-ink-200 rounded-md p-5">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-3">
              Intentions she has set (in her own words)
            </div>
            <ol className="text-sm space-y-3">
              {completedReadings.filter((r) => r.intention).length === 0 ? (
                <li className="text-xs text-ink-400 italic list-none">
                  Intentions show up here automatically as readings are
                  completed with one recorded.
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
            <Stat label="Payment method" value="—" last />
          </div>
          <div className="border border-dashed border-ink-300 rounded-md p-8 text-center">
            <div className="text-sm text-ink-500">
              Manual invoices + Stripe coming soon.
            </div>
            <div className="text-[11px] text-ink-400 mt-1">
              Until then, you can record an exchange manually from the upcoming
              Exchange page actions.
            </div>
          </div>
        </>
      )}

      {tab === "intake" && (
        <div className="grid grid-cols-2 gap-5">
          <div className="border border-ink-200 rounded-md p-5">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-3">
              Source / referral
            </div>
            <div className="text-sm text-ink-700">
              <EditableField
                value={soul.source}
                onSave={saveField("source")}
                placeholder="How she found you (Instagram, quiz, friend, referral)"
              />
            </div>
          </div>
          <div className="border border-ink-200 rounded-md p-5">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-3">
              Consents (coming soon)
            </div>
            <div className="text-xs text-ink-400 italic">
              Care &amp; recording consent · permission to channel guides ·
              permission to share voice memos · cancellation rhythm.
            </div>
          </div>
          <div className="col-span-2 border border-ink-200 rounded-md p-5">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-3">
              Intake answers
            </div>
            <IntakeBlock soulId={soul.id} answers={file.intakeAnswers} />
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
