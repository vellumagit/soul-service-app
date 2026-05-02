import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import {
  getClientFile,
  listClientsForPicker,
  getClientActivity,
  getClientDigest,
  listEmailTemplates,
  listNoteTemplates,
  getSettings,
} from "@/db/queries";
import {
  fullDate,
  money,
  relativeTime,
  shortDate,
} from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { EditClientDialog } from "@/components/EditClientDialog";
import { ScheduleSessionDialog } from "@/components/ScheduleSessionDialog";
import { LogPastSessionDialog } from "@/components/LogPastSessionDialog";
import { SessionCard } from "@/components/SessionCard";
import { GoalsBlock } from "@/components/GoalsBlock";
import { AttachmentsBlock } from "@/components/AttachmentsBlock";
import { QuickActions } from "@/components/QuickActions";
import { TasksBlock } from "@/components/TasksBlock";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { EmailComposer } from "@/components/EmailComposer";
import { MarkdownRender } from "@/components/NotesEditor";
import { WhereWeLeftOffCard } from "@/components/WhereWeLeftOffCard";
import { SensitivityFlags } from "@/components/SensitivityFlags";
import { PrivateNotesBlock } from "@/components/PrivateNotesBlock";
import { PeopleInLifeBlock } from "@/components/PeopleInLifeBlock";
import { PatternsTab } from "@/components/PatternsTab";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "activity", label: "Activity" },
  { key: "sessions", label: "Sessions" },
  { key: "patterns", label: "Patterns" },
  { key: "tasks", label: "Tasks" },
  { key: "files", label: "Files" },
  { key: "intake", label: "Intake notes" },
] as const;

export const dynamic = "force-dynamic";

export default async function ClientProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = "overview" } = await searchParams;

  const [file, allClients, activity, digest, emailTpls, noteTpls, settings] =
    await Promise.all([
      getClientFile(id),
      listClientsForPicker(),
      getClientActivity(id),
      getClientDigest(id),
      listEmailTemplates(),
      listNoteTemplates(),
      getSettings(),
    ]);

  if (!file) notFound();

  const { client } = file;

  const completedSessions = file.sessions.filter(
    (s) => s.status === "completed"
  );
  const upcomingSessions = file.sessions.filter(
    (s) => s.status === "scheduled"
  );
  const lifetimeCents = file.sessions
    .filter((s) => s.paid)
    .reduce((sum, s) => sum + (s.paymentAmountCents ?? 0), 0);
  const unpaidCount = file.sessions.filter(
    (s) => s.status === "completed" && !s.paid
  ).length;

  const nextSession = upcomingSessions[upcomingSessions.length - 1] ?? null;
  const lastSession = completedSessions[0] ?? null;

  const openTasks = file.tasks.filter((t) => !t.completedAt);

  return (
    <AppShell
      breadcrumb={[
        { label: "Clients", href: "/clients" },
        { label: client.fullName },
      ]}
      rightAction={<QuickActions clients={allClients} />}
    >
      {/* Sensitivity flags — first thing visible if any */}
      <SensitivityFlags sensitivities={(client.sensitivities ?? []) as string[]} />

      {/* Profile header */}
      <div className="bg-white border border-ink-200 rounded-lg overflow-hidden mb-5">
        <div className="p-5 md:p-6 flex flex-col md:flex-row gap-5 items-start">
          <Avatar
            clientId={client.id}
            fullName={client.fullName}
            url={client.avatarUrl}
            size="lg"
            editable
          />
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">
                {client.fullName}
              </h1>
              {client.pronouns && (
                <span className="text-xs text-ink-500">{client.pronouns}</span>
              )}
              <span
                className={`chip ${
                  client.status === "active"
                    ? "bg-green-50 text-green-700"
                    : client.status === "new"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-ink-100 text-ink-500"
                }`}
              >
                {client.status.toUpperCase()}
              </span>
              <div className="flex-1" />
              <EditClientDialog client={client} />
            </div>

            <div className="mt-2 text-sm text-ink-600 flex items-center gap-2 flex-wrap">
              {client.email && (
                <a
                  href={`mailto:${client.email}`}
                  className="hover:text-flame-700"
                >
                  {client.email}
                </a>
              )}
              {client.email && client.phone && (
                <span className="text-ink-300">·</span>
              )}
              {client.phone && (
                <a
                  href={`tel:${client.phone}`}
                  className="hover:text-flame-700"
                >
                  {client.phone}
                </a>
              )}
              {(client.email || client.phone) &&
                (client.city || client.timezone) && (
                  <span className="text-ink-300">·</span>
                )}
              {client.city && <span>{client.city}</span>}
              {client.timezone && (
                <span className="text-ink-400 text-xs">
                  ({client.timezone})
                </span>
              )}
            </div>

            {client.workingOn && (
              <div className="mt-3 text-sm text-ink-700">
                <span className="text-ink-500 text-xs">
                  Working on:&nbsp;
                </span>
                {client.workingOn}
              </div>
            )}

            {(client.tags ?? []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(client.tags as string[]).map((t) => (
                  <span
                    key={t}
                    className="chip bg-ink-100 text-ink-700"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <ScheduleSessionDialog
                clients={allClients}
                defaultClientId={client.id}
                defaultType={client.primarySessionType}
              />
              <LogPastSessionDialog
                clients={allClients}
                defaultClientId={client.id}
              />
              <EmailComposer
                client={client}
                templates={emailTpls}
                nextSession={nextSession}
                lastSession={lastSession}
                paymentInstructions={settings.paymentInstructions}
                trigger={(open) => (
                  <button
                    onClick={open}
                    disabled={!client.email}
                    title={
                      !client.email
                        ? "Add an email to compose"
                        : "Compose email"
                    }
                    className="border border-ink-200 hover:bg-ink-50 text-ink-700 text-sm font-medium px-3 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Email
                  </button>
                )}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 border-t border-ink-100">
          <Stat
            label="Sessions"
            value={completedSessions.length.toString()}
          />
          <Stat
            label="Next"
            value={nextSession ? relativeTime(nextSession.scheduledAt) : "—"}
            highlight={!!nextSession}
          />
          <Stat label="Paid" value={money(lifetimeCents)} />
          <Stat
            label="Unpaid"
            value={
              unpaidCount === 0
                ? "0"
                : `${unpaidCount} session${unpaidCount === 1 ? "" : "s"}`
            }
            tone={unpaidCount > 0 ? "amber" : "default"}
            last
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-ink-200 flex items-center mb-5 text-sm overflow-x-auto">
        {TABS.map((t) => {
          const count =
            t.key === "tasks"
              ? openTasks.length
              : t.key === "sessions"
              ? file.sessions.length
              : t.key === "files"
              ? file.attachments.length
              : null;
          return (
            <Link
              key={t.key}
              href={`/clients/${client.id}?tab=${t.key}`}
              data-active={tab === t.key}
              className="subtab border-b-2 border-transparent px-3 py-2 text-ink-500 hover:text-ink-800 font-medium whitespace-nowrap"
            >
              {t.label}
              {count !== null && count > 0 && (
                <span className="ml-1.5 text-[10px] font-mono text-ink-400">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="space-y-5">
          {/* Pre-session digest — auto-derived snapshot at the top */}
          <WhereWeLeftOffCard
            digest={digest}
            clientName={client.fullName}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-2 space-y-5">
              <Card title="About this client">
                {client.aboutClient ? (
                  <div className="md-render text-sm text-ink-700 leading-relaxed">
                    <MarkdownRender body={client.aboutClient} />
                  </div>
                ) : (
                  <div className="text-sm text-ink-400 italic">
                    Nothing written yet.{" "}
                    <span className="text-flame-700">Click Edit profile</span> to
                    add what you&apos;re holding for them.
                  </div>
                )}
              </Card>

              <Card title="People in their life">
                <PeopleInLifeBlock
                  clientId={client.id}
                  people={file.importantPeople}
                />
              </Card>

              <Card title="Recent sessions">
                {file.sessions.slice(0, 3).length === 0 ? (
                  <div className="text-sm text-ink-400 italic">
                    No sessions yet.{" "}
                    <Link
                      href={`/clients/${client.id}?tab=sessions`}
                      className="text-flame-700"
                    >
                      Schedule the first one
                    </Link>
                    .
                  </div>
                ) : (
                  <ul className="divide-y divide-ink-100">
                    {file.sessions.slice(0, 3).map((s) => (
                      <li
                        key={s.id}
                        className="py-2 flex items-center gap-3 text-sm"
                      >
                        <span className="font-mono text-xs text-ink-500 w-24 shrink-0">
                          {shortDate(s.scheduledAt)}
                        </span>
                        <span className="text-ink-700 flex-1 min-w-0 truncate">
                          {s.type}
                        </span>
                        <span
                          className={`chip ${
                            s.status === "scheduled"
                              ? "bg-flame-100 text-flame-700"
                              : s.status === "completed"
                              ? "bg-green-50 text-green-700"
                              : "bg-ink-100 text-ink-500"
                          }`}
                        >
                          {s.status.toUpperCase()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 text-right">
                  <Link
                    href={`/clients/${client.id}?tab=sessions`}
                    className="text-xs text-flame-700 hover:underline"
                  >
                    All sessions →
                  </Link>
                </div>
              </Card>

              <PrivateNotesBlock body={client.privateNotes} />
            </div>

            <aside className="space-y-5">
              <Card title="What they're working on">
                <GoalsBlock clientId={client.id} goals={file.goals} />
              </Card>
              <Card title="Open tasks">
                <TasksBlock
                  clientId={client.id}
                  tasks={file.tasks}
                  emptyText="Nothing on the list."
                />
              </Card>
              {client.emergencyName && (
                <Card title="Emergency contact">
                  <div className="text-sm text-ink-800">
                    {client.emergencyName}
                  </div>
                  {client.emergencyPhone && (
                    <div className="text-xs text-ink-500 font-mono mt-0.5">
                      {client.emergencyPhone}
                    </div>
                  )}
                </Card>
              )}
            </aside>
          </div>
        </div>
      )}

      {tab === "patterns" && (
        <PatternsTab
          clientId={client.id}
          themes={file.themes}
          observations={file.observations}
          sessions={file.sessions}
        />
      )}

      {tab === "activity" && <ActivityTimeline events={activity} />}

      {tab === "sessions" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <ScheduleSessionDialog
              clients={allClients}
              defaultClientId={client.id}
              defaultType={client.primarySessionType}
            />
            <LogPastSessionDialog
              clients={allClients}
              defaultClientId={client.id}
            />
          </div>
          {file.sessions.length === 0 ? (
            <div className="border-2 border-dashed border-ink-200 rounded-md p-8 text-center text-sm text-ink-500">
              No sessions yet.
            </div>
          ) : (
            file.sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                noteTemplates={noteTpls}
              />
            ))
          )}
        </div>
      )}

      {tab === "tasks" && (
        <Card title="Tasks">
          <TasksBlock clientId={client.id} tasks={file.tasks} />
        </Card>
      )}

      {tab === "files" && (
        <AttachmentsBlock
          clientId={client.id}
          attachments={file.attachments}
        />
      )}

      {tab === "intake" && (
        <div className="space-y-5">
          <Card title="Intake notes">
            {client.intakeNotes ? (
              <div className="md-render text-sm text-ink-700 leading-relaxed">
                <MarkdownRender body={client.intakeNotes} />
              </div>
            ) : (
              <div className="text-sm text-ink-400 italic">
                No intake notes yet. Click <strong>Edit profile</strong> to add
                what they shared on the way in.
              </div>
            )}
            {client.howTheyFoundMe && (
              <div className="mt-4 pt-4 border-t border-ink-100">
                <div className="text-[10px] uppercase tracking-wider text-ink-500">
                  How they found me
                </div>
                <div className="text-sm text-ink-700 mt-1">
                  {client.howTheyFoundMe}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-ink-200 rounded-md bg-white p-5">
      <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
  highlight,
  last,
}: {
  label: string;
  value: string;
  tone?: "default" | "amber" | "red";
  highlight?: boolean;
  last?: boolean;
}) {
  const valueCls = {
    default: highlight ? "text-flame-700" : "text-ink-900",
    amber: "text-amber-700",
    red: "text-red-700",
  }[tone];
  return (
    <div
      className={`px-4 py-3 ${
        last ? "" : "border-r border-ink-100 last:border-r-0"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-ink-500">
        {label}
      </div>
      <div className={`mt-1 text-base font-semibold ${valueCls}`}>{value}</div>
    </div>
  );
}
