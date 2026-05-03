"use client";

import Link from "next/link";
import type { Client } from "@/db/schema";
import { Avatar } from "./Avatar";
import { EditClientDialog } from "./EditClientDialog";
import { ScheduleSessionDialog } from "./ScheduleSessionDialog";
import { LogPastSessionDialog } from "./LogPastSessionDialog";
import { EmailComposer } from "./EmailComposer";
import type { EmailTemplate, Session } from "@/db/schema";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  new: "bg-amber-50 text-amber-700 border-amber-200",
  dormant: "bg-ink-100 text-ink-500 border-ink-200",
  archived: "bg-ink-100 text-ink-400 border-ink-200",
};

export function ClientHeader({
  client,
  emailTemplates,
  nextSession,
  lastSession,
  paymentInstructions,
  allClients,
  resendConfigured = false,
}: {
  client: Client;
  emailTemplates: EmailTemplate[];
  nextSession: Session | null;
  lastSession: Session | null;
  paymentInstructions: string | null;
  allClients: { id: string; fullName: string }[];
  resendConfigured?: boolean;
}) {
  return (
    <div className="bg-white border border-ink-200 rounded-lg overflow-hidden mb-5">
      <div className="p-5 md:p-6">
        <div className="flex flex-col md:flex-row gap-5 items-start">
          <Avatar
            clientId={client.id}
            fullName={client.fullName}
            url={client.avatarUrl}
            size="lg"
            editable
          />
          <div className="flex-1 min-w-0 w-full">
            {/* Top row — name, pronouns, status, edit */}
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-semibold text-ink-900 tracking-tight">
                {client.fullName}
              </h1>
              {client.pronouns && (
                <span className="text-sm text-ink-500">
                  {client.pronouns}
                </span>
              )}
              <span
                className={`chip border ${
                  STATUS_COLORS[client.status] ??
                  "bg-ink-100 text-ink-500 border-ink-200"
                }`}
              >
                {client.status.toUpperCase()}
              </span>
              <div className="flex-1" />
              <EditClientDialog client={client} />
            </div>

            {/* Contact line */}
            {(client.email || client.phone || client.city) && (
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
                {(client.email || client.phone) && client.city && (
                  <span className="text-ink-300">·</span>
                )}
                {client.city && (
                  <span>
                    {client.city}
                    {client.timezone ? (
                      <span className="text-ink-400 text-xs">
                        {" "}
                        ({client.timezone})
                      </span>
                    ) : null}
                  </span>
                )}
              </div>
            )}

            {/* Working on — large, italic, prominent */}
            {client.workingOn && (
              <div className="mt-4 text-base text-ink-800 italic leading-relaxed border-l-2 border-flame-500 pl-3">
                {client.workingOn}
              </div>
            )}

            {/* Tags */}
            {(client.tags ?? []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(client.tags as string[]).map((t) => (
                  <span key={t} className="chip bg-ink-100 text-ink-700">
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-5 flex items-center gap-2 flex-wrap">
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
                templates={emailTemplates}
                nextSession={nextSession}
                lastSession={lastSession}
                paymentInstructions={paymentInstructions}
                resendConfigured={resendConfigured}
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
              {client.email && (
                <Link
                  href={`mailto:${client.email}`}
                  className="text-sm text-ink-500 hover:text-ink-900 px-2 py-2"
                  title="Open in mail app directly"
                >
                  ✉
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
