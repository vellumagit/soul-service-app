"use client";

import Link from "next/link";
import { NewClientDialog } from "./NewClientDialog";
import { ScheduleSessionDialog } from "./ScheduleSessionDialog";
import type { SetupStatus } from "@/db/queries";

type ClientOption = { id: string; fullName: string };

/**
 * The "are you set up?" card at the top of Today. Auto-hides once all four
 * steps are done so the page returns to normal once she's settled in.
 *
 * Note: this is a client component because the action buttons trigger client-
 * side dialogs (NewClientDialog, ScheduleSessionDialog). The status booleans
 * come from a server-side query — they're not reactive, page revalidation
 * after each action causes a server round-trip.
 */
export function SetupChecklist({
  status,
  clients,
}: {
  status: SetupStatus;
  clients: ClientOption[];
}) {
  const allDone =
    status.hasBusinessInfo &&
    status.hasClient &&
    status.hasSession &&
    status.hasNotes;
  if (allDone) return null;

  const completed = [
    status.hasBusinessInfo,
    status.hasClient,
    status.hasSession,
    status.hasNotes,
  ].filter(Boolean).length;
  const total = 4;

  return (
    <div className="border border-flame-100 bg-gradient-to-br from-flame-50 to-white rounded-lg p-5 mb-6">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">
            Get your space set up
          </h2>
          <p className="text-xs text-ink-500 mt-0.5">
            A few one-time things to make this yours. Hides automatically when
            you&apos;re done.
          </p>
        </div>
        <div className="text-[11px] text-ink-500 font-mono shrink-0">
          {completed} / {total}
        </div>
      </div>

      <div className="space-y-2">
        <ChecklistRow done={status.hasBusinessInfo}>
          <div className="flex-1">
            <div className="text-sm font-medium text-ink-900">
              Add your name + payment instructions
            </div>
            <div className="text-xs text-ink-500">
              Used on invoices, in emails, and shown to clients.
            </div>
          </div>
          {!status.hasBusinessInfo && (
            <Link
              href="/settings"
              className="text-xs text-flame-700 hover:underline font-medium shrink-0"
            >
              Open Settings →
            </Link>
          )}
        </ChecklistRow>

        <ChecklistRow done={status.hasClient}>
          <div className="flex-1">
            <div className="text-sm font-medium text-ink-900">
              Add your first client
            </div>
            <div className="text-xs text-ink-500">
              Everything else builds out from here.
            </div>
          </div>
          {!status.hasClient && (
            <NewClientDialog
              trigger={(open) => (
                <button
                  onClick={open}
                  className="text-xs text-flame-700 hover:underline font-medium shrink-0"
                >
                  Add client →
                </button>
              )}
            />
          )}
        </ChecklistRow>

        <ChecklistRow done={status.hasSession}>
          <div className="flex-1">
            <div className="text-sm font-medium text-ink-900">
              Schedule a session
            </div>
            <div className="text-xs text-ink-500">
              Or log a past one — both count.
            </div>
          </div>
          {!status.hasSession && status.hasClient && (
            <ScheduleSessionDialog
              clients={clients}
              trigger={(open) => (
                <button
                  onClick={open}
                  className="text-xs text-flame-700 hover:underline font-medium shrink-0"
                >
                  Schedule →
                </button>
              )}
            />
          )}
          {!status.hasSession && !status.hasClient && (
            <span className="text-xs text-ink-400 italic shrink-0">
              Add a client first
            </span>
          )}
        </ChecklistRow>

        <ChecklistRow done={status.hasNotes}>
          <div className="flex-1">
            <div className="text-sm font-medium text-ink-900">
              Try AI session notes
            </div>
            <div className="text-xs text-ink-500">
              Paste a transcript (Fathom, Otter, Meet — anywhere) into any
              session card, click &ldquo;AI: structure from transcript&rdquo;
              and let it draft your notes for you.
            </div>
          </div>
        </ChecklistRow>
      </div>
    </div>
  );
}

function ChecklistRow({
  done,
  children,
}: {
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2 border-t border-ink-100 first:border-t-0">
      <div className="mt-0.5 shrink-0">
        {done ? (
          <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
            <svg
              className="w-3 h-3 text-green-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={3}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        ) : (
          <div className="w-5 h-5 rounded-full border-2 border-ink-300" />
        )}
      </div>
      {children}
    </div>
  );
}
