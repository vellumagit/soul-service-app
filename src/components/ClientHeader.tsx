"use client";

import Link from "next/link";
import { useState } from "react";
import type { Client } from "@/db/schema";
import { Avatar } from "./Avatar";
import { EditClientDialog } from "./EditClientDialog";
import { ScheduleSessionDialog } from "./ScheduleSessionDialog";
import { LogPastSessionDialog } from "./LogPastSessionDialog";
import { EmailComposer } from "./EmailComposer";
import { setClientLeadStatus } from "@/lib/actions";
import { notify } from "./FlashNotifier";
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
  togetherSince,
}: {
  client: Client;
  emailTemplates: EmailTemplate[];
  nextSession: Session | null;
  lastSession: Session | null;
  paymentInstructions: string | null;
  allClients: { id: string; fullName: string }[];
  resendConfigured?: boolean;
  /** First non-cancelled session date for this client. Falls back to
   *  client.createdAt if she hasn't had a session yet. Drives the small
   *  "Together since…" anchor in the header. */
  togetherSince: Date | null;
}) {
  const anchorDate = togetherSince ?? client.createdAt;
  const togetherLine = formatTogetherSince(anchorDate);
  const [promotingLead, setPromotingLead] = useState(false);

  // Find referrer name for the small "via …" line (no extra query — already
  // in allClients, which is the picker list).
  const referrer = client.metViaClientId
    ? allClients.find((c) => c.id === client.metViaClientId)
    : null;

  async function toggleLead() {
    if (promotingLead) return;
    setPromotingLead(true);
    try {
      const next = !client.isLead;
      const res = await setClientLeadStatus(client.id, next);
      if (!res.ok) {
        notify({ kind: "warning", title: "Couldn't update", body: res.error });
        return;
      }
      notify({
        kind: "success",
        title: next
          ? `Moved back to your network`
          : `Promoted to active client`,
        ttlMs: 3000,
      });
    } finally {
      setPromotingLead(false);
    }
  }

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
              {client.isLead && (
                <span
                  className="chip border bg-honey-50 text-honey-700"
                  style={{ borderColor: "var(--color-honey-100)" }}
                  title="In your network — no first session yet. Scheduling one will move them to active clients."
                >
                  NETWORK
                </span>
              )}
              <div className="flex-1" />
              <EditClientDialog client={client} referrerOptions={allClients} />
            </div>

            {/* Contact line */}
            {(client.email || client.phone || client.city) && (
              <div className="mt-2 text-sm text-ink-600 flex items-center gap-2 flex-wrap">
                {client.email && (
                  <a
                    href={`mailto:${client.email}`}
                    className="hover:text-plum-700"
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
                    className="hover:text-plum-700"
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

            {/* "Together since…" — small serif anchor line. Roots her in
                the length of the relationship every time she opens the file. */}
            {togetherLine && (
              <div className="mt-2 text-[12px] text-ink-500 italic serif-italic">
                {togetherLine}
              </div>
            )}

            {/* "From: <source>" — the network-source line. Persists even after
                a lead promotes to client, so years from now she can still see
                how Maria originally arrived. Only renders when something's set. */}
            {(client.howTheyFoundMe || client.metOn || referrer) && (
              <div className="mt-1 text-[12px] text-ink-500 flex flex-wrap gap-x-2 gap-y-0.5">
                {client.howTheyFoundMe && (
                  <span>
                    <span className="text-ink-400">From:</span>{" "}
                    <span className="text-ink-700">
                      {client.howTheyFoundMe}
                    </span>
                  </span>
                )}
                {referrer && (
                  <span>
                    <span className="text-ink-400">·</span>{" "}
                    <span className="text-ink-400">via</span>{" "}
                    <Link
                      href={`/clients/${referrer.id}`}
                      className="text-plum-700 hover:underline"
                    >
                      {referrer.fullName}
                    </Link>
                  </span>
                )}
                {client.metOn && (
                  <span>
                    <span className="text-ink-400">·</span>{" "}
                    <span className="text-ink-400">met</span>{" "}
                    <span className="font-mono">{client.metOn}</span>
                  </span>
                )}
              </div>
            )}

            {/* Working on — large, italic, prominent */}
            {client.workingOn && (
              <div className="mt-4 text-base text-ink-800 italic leading-relaxed border-l-2 border-plum-500 pl-3">
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
              <div className="flex-1" />
              {/* Manual lead/active override. Most of the time auto-promotion
                  (scheduling a first session) handles this — but if she wants
                  to demote a client back to the network, or promote a lead
                  before scheduling them in, this is the door. */}
              <button
                type="button"
                onClick={toggleLead}
                disabled={promotingLead}
                className="text-xs text-ink-500 hover:text-ink-900 px-2 py-2 disabled:opacity-50"
                title={
                  client.isLead
                    ? "Promote to active client"
                    : "Move back to your network"
                }
              >
                {client.isLead
                  ? "Promote to client →"
                  : "Move to network ←"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Format the "Together since…" anchor.
 *  < 1 month → "Just beginning"
 *  1-11 months → "Together 4 months"
 *  12+ months → "Together 1 year" / "Together 2 years"
 *  On the actual anniversary day → adds " · anniversary today" */
function formatTogetherSince(date: Date | null): string | null {
  if (!date) return null;
  const start = new Date(date);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  const ms = now.getTime() - start.getTime();
  if (ms < 0) return null; // future-dated (shouldn't happen, defensive)

  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days < 14) return "Just beginning";

  const months = Math.floor(days / 30.4);
  const years = Math.floor(days / 365.25);

  // Mark anniversary day specifically.
  const isAnniversary =
    now.getMonth() === start.getMonth() && now.getDate() === start.getDate();
  const tail = isAnniversary && years > 0 ? " · anniversary today" : "";

  if (years >= 1) {
    return `Together ${years} ${years === 1 ? "year" : "years"}${tail}`;
  }
  return `Together ${months} ${months === 1 ? "month" : "months"}${tail}`;
}
