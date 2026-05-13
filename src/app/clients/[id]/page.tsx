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
import { shortDate } from "@/lib/format";
import { SessionCard } from "@/components/SessionCard";
import { GoalsBlock } from "@/components/GoalsBlock";
import { AttachmentsBlock } from "@/components/AttachmentsBlock";
import { QuickActions } from "@/components/QuickActions";
import { TasksBlock } from "@/components/TasksBlock";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { ScheduleSessionDialog } from "@/components/ScheduleSessionDialog";
import { LogPastSessionDialog } from "@/components/LogPastSessionDialog";
import { MarkdownRender } from "@/components/NotesEditor";
import { WhereWeLeftOffCard } from "@/components/WhereWeLeftOffCard";
import { SensitivityFlags } from "@/components/SensitivityFlags";
import { PrivateNotesBlock } from "@/components/PrivateNotesBlock";
import { PeopleInLifeBlock } from "@/components/PeopleInLifeBlock";
import { PatternsTab } from "@/components/PatternsTab";
import { ClientHeader } from "@/components/ClientHeader";
import { ClientStatStrip } from "@/components/ClientStatStrip";
import { RecentActivityMini } from "@/components/RecentActivityMini";
import { requireSession } from "@/lib/session-cookies";
import { asLocale, t } from "@/lib/i18n";

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
  const { email } = await requireSession();
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
  const unpaidCents = file.sessions
    .filter((s) => s.status === "completed" && !s.paid)
    .reduce((sum, s) => sum + (s.paymentAmountCents ?? 0), 0);

  const nextSession = upcomingSessions[upcomingSessions.length - 1] ?? null;
  const lastSession = completedSessions[0] ?? null;

  const openTasks = file.tasks.filter((t) => !t.completedAt);
  const locale = asLocale(settings.uiLanguage);

  return (
    <AppShell
      breadcrumb={[
        { label: t(locale, "nav.clients"), href: "/clients" },
        { label: client.fullName },
      ]}
      rightAction={<QuickActions clients={allClients} />}
      userEmail={email}
      locale={locale}
    >
      {/* Sensitivity flags — first thing visible if any */}
      <SensitivityFlags
        sensitivities={(client.sensitivities ?? []) as string[]}
      />

      {/* Header — identity, status, working-on, tags, action buttons */}
      <ClientHeader
        client={client}
        emailTemplates={emailTpls}
        nextSession={nextSession}
        lastSession={lastSession}
        paymentInstructions={settings.paymentInstructions}
        allClients={allClients}
        resendConfigured={!!process.env.RESEND_API_KEY}
      />

      {/* Stat strip — sessions / together since / next / paid / unpaid */}
      <ClientStatStrip
        clientId={client.id}
        stats={{
          sessionsHeld: completedSessions.length,
          togetherSince: client.createdAt,
          nextSessionAt: nextSession?.scheduledAt ?? null,
          lifetimePaidCents: lifetimeCents,
          unpaidCents,
          unpaidCount,
        }}
      />

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
              : t.key === "activity"
              ? activity.length
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

      {/* OVERVIEW — the dashboard */}
      {tab === "overview" && (
        <div className="space-y-5">
          {/* Hero: pre-session digest */}
          <WhereWeLeftOffCard
            digest={digest}
            clientName={client.fullName}
          />

          {/* Three-column scan grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ScanCard title="Where her work is now">
              <GoalsBlock clientId={client.id} goals={file.goals} />
            </ScanCard>

            <ScanCard title="People in her life">
              <PeopleInLifeBlock
                clientId={client.id}
                people={file.importantPeople}
              />
            </ScanCard>

            <ScanCard title="Patterns">
              {file.themes.length === 0 && file.observations.length === 0 ? (
                <div className="text-xs text-ink-400 italic">
                  Tag themes and capture observations as they surface in your
                  work together.{" "}
                  <Link
                    href={`/clients/${client.id}?tab=patterns`}
                    className="text-flame-700 hover:underline"
                  >
                    Open Patterns →
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {file.themes.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1.5">
                        Recurring themes
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {file.themes.slice(0, 12).map((t) => (
                          <span
                            key={t.id}
                            className="chip bg-ink-100 text-ink-700"
                          >
                            {t.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {file.observations.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1.5">
                        Latest observations
                      </div>
                      <ul className="text-xs text-ink-700 space-y-1.5 list-disc pl-4">
                        {file.observations.slice(0, 3).map((o) => (
                          <li key={o.id} className="leading-relaxed">
                            {o.body}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="text-right">
                    <Link
                      href={`/clients/${client.id}?tab=patterns`}
                      className="text-xs text-flame-700 hover:underline"
                    >
                      Open Patterns →
                    </Link>
                  </div>
                </div>
              )}
            </ScanCard>
          </div>

          {/* About — full width, prominent */}
          <ScanCard title="About this client">
            {client.aboutClient && client.aboutClient.trim().length > 0 ? (
              <div className="md-render text-sm text-ink-700 leading-relaxed">
                <MarkdownRender body={client.aboutClient} />
              </div>
            ) : (
              <div className="text-sm text-ink-400 italic">
                Nothing written yet. Click <strong>Edit profile</strong> in the
                header to add anything you&apos;d want to remember about them.
              </div>
            )}
          </ScanCard>

          {/* Two-column bottom: Recent activity + Open tasks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ScanCard title="Recent activity">
              <RecentActivityMini
                events={activity}
                clientId={client.id}
                limit={6}
              />
            </ScanCard>

            <ScanCard title="Open tasks for her">
              <TasksBlock
                clientId={client.id}
                tasks={file.tasks}
                emptyText="Nothing on the list."
              />
            </ScanCard>
          </div>

          {/* Practitioner-only private notes */}
          <PrivateNotesBlock body={client.privateNotes} />

          {/* Emergency contact — small footer-ish block */}
          {client.emergencyName && (
            <div className="border border-ink-200 rounded-md bg-white p-4 flex items-center gap-4 text-sm">
              <span className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold shrink-0">
                If anything ever happens
              </span>
              <span className="text-ink-800">{client.emergencyName}</span>
              {client.emergencyPhone && (
                <span className="text-ink-500 font-mono">
                  {client.emergencyPhone}
                </span>
              )}
            </div>
          )}
        </div>
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
                autoUploadAiNotes={settings.autoUploadAiNotes}
              />
            ))
          )}
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

      {tab === "tasks" && (
        <ScanCard title="Tasks">
          <TasksBlock clientId={client.id} tasks={file.tasks} />
        </ScanCard>
      )}

      {tab === "files" && (
        <AttachmentsBlock
          clientId={client.id}
          attachments={file.attachments}
        />
      )}

      {tab === "intake" && (
        <ScanCard title="Intake notes">
          {client.intakeNotes && client.intakeNotes.trim().length > 0 ? (
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
                How they found you
              </div>
              <div className="text-sm text-ink-700 mt-1">
                {client.howTheyFoundMe}
              </div>
            </div>
          )}
        </ScanCard>
      )}
    </AppShell>
  );
}

function ScanCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-ink-200 rounded-md bg-white p-5">
      <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-3 font-semibold">
        {title}
      </div>
      {children}
    </div>
  );
}
