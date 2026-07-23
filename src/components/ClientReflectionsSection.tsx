// Server component — shows the most recent reflections this client has
// written in their portal. Slot it onto the client overview so the
// practitioner can read what's been alive for them between sessions
// before walking into the next one. Quiet plum-tinted styling so it
// reads as the client's voice, not her own.

import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientReflections, sessions } from "@/db/schema";
import { fullDate } from "@/lib/format";

const PREVIEW_LIMIT = 5;

export async function ClientReflectionsSection({
  accountId,
  clientId,
  timeZone,
}: {
  accountId: string;
  clientId: string;
  /** Practice timezone — render dates in HER local zone, not the server's. */
  timeZone?: string;
}) {
  const rows = await db
    .select({
      id: clientReflections.id,
      body: clientReflections.body,
      createdAt: clientReflections.createdAt,
      sessionId: clientReflections.sessionId,
      sessionScheduledAt: sessions.scheduledAt,
    })
    .from(clientReflections)
    .leftJoin(sessions, eq(sessions.id, clientReflections.sessionId))
    .where(
      and(
        eq(clientReflections.accountId, accountId),
        eq(clientReflections.clientId, clientId)
      )
    )
    .orderBy(desc(clientReflections.createdAt))
    .limit(PREVIEW_LIMIT);

  if (rows.length === 0) return null;

  return (
    <section className="paper-card p-5 md:p-6 mb-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h2
          className="serif-italic text-base text-plum-700"
          style={{ fontWeight: 400 }}
        >
          Reflections from them
        </h2>
        <span className="text-[11px] text-ink-400 font-mono">
          {rows.length}
          {rows.length === PREVIEW_LIMIT ? "+" : ""}
        </span>
      </div>
      <p className="text-[12px] text-ink-500 italic mb-4 leading-snug">
        What they&apos;ve been writing for themselves between sessions in the
        portal. They can see + edit + delete their own; you can only read.
      </p>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li
            key={r.id}
            className="pl-3 border-l-2 border-plum-200 py-1"
          >
            <p
              className="serif-italic text-sm text-ink-800 leading-relaxed whitespace-pre-wrap"
              style={{ fontWeight: 400 }}
            >
              {r.body}
            </p>
            <p className="text-[11px] text-ink-400 italic mt-1.5">
              {fullDate(new Date(r.createdAt), timeZone)}
              {r.sessionScheduledAt && (
                <>
                  {" · "}
                  <Link
                    href={`/clients/${clientId}?tab=sessions#${r.sessionId}`}
                    className="hover:text-plum-700 hover:underline"
                  >
                    about {fullDate(new Date(r.sessionScheduledAt), timeZone)}
                  </Link>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
