// Full "Reflections" tab on the client profile — shows every reflection
// this client has written in their portal, grouped by month so she can
// scan how the volume + voice has changed over time.
//
// Read-only on her side; the client owns their own (edit + delete only
// from /portal/reflections).

import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientReflections, sessions } from "@/db/schema";
import { fullDate } from "@/lib/format";

export async function ClientReflectionsTab({
  accountId,
  clientId,
  clientFullName,
  timeZone,
}: {
  accountId: string;
  clientId: string;
  clientFullName: string;
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
      sessionType: sessions.type,
    })
    .from(clientReflections)
    .leftJoin(sessions, eq(sessions.id, clientReflections.sessionId))
    .where(
      and(
        eq(clientReflections.accountId, accountId),
        eq(clientReflections.clientId, clientId)
      )
    )
    .orderBy(desc(clientReflections.createdAt));

  const firstName = clientFullName.split(" ")[0] ?? clientFullName;

  if (rows.length === 0) {
    return (
      <div className="paper-card p-10 text-center max-w-xl mx-auto">
        <p
          className="serif-italic text-lg text-plum-700 mb-2"
          style={{ fontWeight: 400 }}
        >
          Nothing here yet.
        </p>
        <p className="text-sm text-ink-500">
          When {firstName} writes a reflection in the portal, it&apos;ll appear
          here. They show up immediately, no notification needed.
        </p>
      </div>
    );
  }

  // Group reflections by year-month label for a quiet visual rhythm.
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const d = new Date(r.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  return (
    <div className="max-w-2xl">
      <header className="mb-5">
        <p className="text-sm text-ink-500 italic serif-italic">
          {rows.length} reflection{rows.length === 1 ? "" : "s"} from{" "}
          {firstName}. They write these in their portal between sessions —
          this is the closest you get to their interior weather without
          asking.
        </p>
      </header>

      <div className="space-y-8">
        {Array.from(groups.entries()).map(([key, items]) => {
          const [year, month] = key.split("-");
          const label = new Date(
            Number(year),
            Number(month) - 1,
            1
          ).toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          });
          return (
            <section key={key}>
              <h3
                className="text-[11px] uppercase tracking-widest text-ink-500 font-mono mb-3"
                style={{ letterSpacing: "0.08em" }}
              >
                {label}
              </h3>
              <ul className="space-y-3">
                {items.map((r) => (
                  <li
                    key={r.id}
                    className="paper-card p-5 border-l-2 border-l-plum-300"
                  >
                    <p
                      className="serif-italic text-base text-ink-800 leading-relaxed whitespace-pre-wrap"
                      style={{ fontWeight: 400 }}
                    >
                      {r.body}
                    </p>
                    <p className="text-[11px] text-ink-500 italic mt-3">
                      {fullDate(new Date(r.createdAt), timeZone)}
                      {r.sessionScheduledAt && (
                        <>
                          {" · "}
                          <Link
                            href={`/clients/${clientId}?tab=sessions#${r.sessionId}`}
                            className="hover:text-plum-700 hover:underline"
                          >
                            about {fullDate(new Date(r.sessionScheduledAt), timeZone)} ·{" "}
                            {r.sessionType}
                          </Link>
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
