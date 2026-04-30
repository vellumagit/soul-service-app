import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { QuickActions } from "@/components/QuickActions";
import { NewClientDialog } from "@/components/NewClientDialog";
import { MarkPaidDialog } from "@/components/MarkPaidDialog";
import { TasksBlock } from "@/components/TasksBlock";
import {
  getDashboardData,
  listClientsForPicker,
} from "@/db/queries";
import { shortTime, fullDate, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [data, clientsList] = await Promise.all([
    getDashboardData(),
    listClientsForPicker(),
  ]);

  const isFirstRun = data.totalClients === 0;
  const upcomingToday = data.todaySessions.filter(
    (s) => s.status === "scheduled"
  );

  return (
    <AppShell
      breadcrumb={[{ label: "Today" }]}
      rightAction={<QuickActions clients={clientsList} />}
    >
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">
          Today
        </h1>
        <p className="text-sm text-ink-500 mt-1">{fullDate(new Date())}</p>
      </div>

      {isFirstRun ? (
        <div className="border-2 border-dashed border-ink-200 rounded-lg p-12 text-center bg-white">
          <div className="text-base text-ink-900 font-medium mb-2">
            Welcome to your space, Svitlana.
          </div>
          <div className="text-sm text-ink-500 mb-6 max-w-md mx-auto leading-relaxed">
            This is where everyone you read for lives — their notes, their
            history, what you&apos;re holding for them. Add your first client to
            begin.
          </div>
          <NewClientDialog />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-6">
            {/* Today's sessions */}
            <Section
              title="Today's sessions"
              count={upcomingToday.length}
              empty="Nothing on the schedule today."
            >
              {upcomingToday.length > 0 && (
                <div className="border border-ink-200 rounded-md overflow-hidden bg-white divide-y divide-ink-100">
                  {upcomingToday.map((s) => (
                    <Link
                      key={s.id}
                      href={`/clients/${s.clientId}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-ink-50"
                    >
                      <div className="font-mono text-sm text-flame-700 font-medium w-20 shrink-0">
                        {shortTime(s.scheduledAt)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-ink-900">
                          {s.clientName}
                        </div>
                        <div className="text-xs text-ink-500">
                          {s.type} · {s.durationMinutes}m
                        </div>
                      </div>
                      {s.meetUrl && (
                        <a
                          href={s.meetUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="bg-ink-900 hover:bg-ink-800 text-white text-xs font-medium px-3 py-1.5 rounded-md shrink-0"
                        >
                          Join Meet
                        </a>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </Section>

            {/* Needs attention */}
            {(data.unpaidSessions.length > 0 ||
              data.missingNotes.length > 0 ||
              data.dormantClients.length > 0) && (
              <Section title="Needs your attention">
                <div className="space-y-2">
                  {data.unpaidSessions.map((s) => (
                    <NeedsRow
                      key={`unpaid-${s.id}`}
                      chip="UNPAID"
                      chipCls="bg-amber-50 text-amber-700"
                      text={
                        <>
                          <Link
                            href={`/clients/${s.clientId}`}
                            className="font-medium text-ink-900 hover:underline"
                          >
                            {s.clientName}
                          </Link>{" "}
                          <span className="text-ink-500">·</span>{" "}
                          <span className="text-ink-600">{s.type}</span>{" "}
                          <span className="text-ink-500">·</span>{" "}
                          <span className="text-ink-500 text-xs">
                            {fullDate(s.scheduledAt)}
                          </span>
                        </>
                      }
                      action={
                        <MarkPaidDialog
                          sessionId={s.id}
                          clientId={s.clientId}
                        />
                      }
                    />
                  ))}
                  {data.missingNotes.slice(0, 5).map((s) => (
                    <NeedsRow
                      key={`note-${s.id}`}
                      chip="NO NOTES"
                      chipCls="bg-ink-100 text-ink-600"
                      text={
                        <>
                          Notes pending for{" "}
                          <Link
                            href={`/clients/${s.clientId}`}
                            className="font-medium text-ink-900 hover:underline"
                          >
                            {s.clientName}
                          </Link>{" "}
                          <span className="text-ink-500">·</span>{" "}
                          <span className="text-ink-500 text-xs">
                            {fullDate(s.scheduledAt)}
                          </span>
                        </>
                      }
                      action={
                        <Link
                          href={`/clients/${s.clientId}?tab=sessions`}
                          className="text-xs text-flame-700 hover:underline font-medium"
                        >
                          Write notes →
                        </Link>
                      }
                    />
                  ))}
                  {data.dormantClients.map((c) => (
                    <NeedsRow
                      key={`dormant-${c.id}`}
                      chip="QUIET"
                      chipCls="bg-ink-100 text-ink-500"
                      text={
                        <>
                          <Link
                            href={`/clients/${c.id}`}
                            className="font-medium text-ink-900 hover:underline"
                          >
                            {c.fullName}
                          </Link>{" "}
                          <span className="text-ink-500">
                            hasn&apos;t been in since{" "}
                            {relativeTime(c.lastSessionAt)}
                          </span>
                        </>
                      }
                      action={
                        <Link
                          href={`/clients/${c.id}`}
                          className="text-xs text-flame-700 hover:underline font-medium"
                        >
                          Reach out →
                        </Link>
                      }
                    />
                  ))}
                </div>
              </Section>
            )}

            {/* This week stats */}
            <Section title="This week">
              <div className="grid grid-cols-3 gap-3">
                <StatCard
                  label="Sessions this week"
                  value={data.thisWeekCount.toString()}
                  href="/calendar"
                />
                <StatCard
                  label="All clients"
                  value={data.totalClients.toString()}
                  href="/clients"
                />
                <StatCard
                  label="Unpaid"
                  value={data.unpaidSessions.length.toString()}
                  tone={data.unpaidSessions.length > 0 ? "amber" : "default"}
                  href="/payments?filter=unpaid"
                />
              </div>
            </Section>
          </div>

          {/* Right rail: tasks */}
          <aside>
            <Section title="My tasks" count={data.openTasks.length}>
              <TasksBlock
                tasks={data.openTasks}
                emptyText="No open tasks. You're caught up."
              />
            </Section>
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count?: number;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-xs font-semibold text-ink-700 uppercase tracking-wider">
          {title}
        </h2>
        {count !== undefined && count > 0 && (
          <span className="font-mono text-xs text-ink-400">· {count}</span>
        )}
      </div>
      {count === 0 && empty ? (
        <div className="text-sm text-ink-400 italic">{empty}</div>
      ) : (
        children
      )}
    </section>
  );
}

function NeedsRow({
  chip,
  chipCls,
  text,
  action,
}: {
  chip: string;
  chipCls: string;
  text: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border border-ink-200 rounded-md bg-white">
      <span className={`chip ${chipCls} shrink-0`}>{chip}</span>
      <div className="flex-1 min-w-0 text-sm">{text}</div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
  href,
}: {
  label: string;
  value: string;
  tone?: "default" | "amber" | "red";
  href?: string;
}) {
  const valueCls = {
    default: "text-ink-900",
    amber: "text-amber-700",
    red: "text-red-700",
  }[tone];
  const inner = (
    <div className="border border-ink-200 rounded-md p-4 bg-white hover:border-ink-300 transition">
      <div className="text-[10px] uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${valueCls}`}>{value}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
