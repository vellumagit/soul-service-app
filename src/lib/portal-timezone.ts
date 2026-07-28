// Which clock the client portal speaks in.
//
// Server components render in UTC on Vercel, so any bare toLocaleString() in
// /portal showed a client in Edmonton their 7:00 PM session as "1:00 AM" the
// next day. Every portal surface must format through an explicit zone.
//
// Resolution order (most-specific first):
//   1. clients.timezone   — captured invisibly by PortalTimezoneCapture on the
//                           client's first portal visit. Their real clock.
//   2. practitionerSettings.timezone — the practice's zone. Better than UTC,
//                           and it's the zone she'd quote them on the phone.
//   3. DEFAULT_TIME_ZONE  — legacy rows with neither.
//
// `hasOwnZone` tells the caller whether we're showing the client THEIR clock
// or borrowing hers, so the page can label times honestly.

import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, practitionerSettings } from "@/db/schema";
import { isValidTimeZone, resolveTimeZone } from "@/lib/timezone";

export type PortalZone = {
  /** IANA zone to pass to every format helper on portal pages. */
  timeZone: string;
  /** True when this is the client's captured zone (not a fallback). */
  hasOwnZone: boolean;
};

/** Cached per request — every portal page can call it without extra queries. */
export const getPortalTimeZone = cache(
  async (accountId: string, clientId: string): Promise<PortalZone> => {
    const [clientRows, settingsRows] = await Promise.all([
      db
        .select({ timezone: clients.timezone })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1),
      db
        .select({ timezone: practitionerSettings.timezone })
        .from(practitionerSettings)
        .where(eq(practitionerSettings.accountId, accountId))
        .limit(1),
    ]);

    const clientTz = clientRows[0]?.timezone ?? null;
    return {
      timeZone: resolveTimeZone(clientTz, settingsRows[0]?.timezone),
      hasOwnZone: isValidTimeZone(clientTz),
    };
  }
);
