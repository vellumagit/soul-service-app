"use client";

// Invisible helper on the client portal: on first load (when we don't yet know
// the client's timezone), detect the browser's IANA zone and record it, so
// their reminder/confirmation emails show THEIR local time. Renders nothing.

import { useEffect } from "react";
import { capturePortalClientTimezone } from "@/lib/portal-client-actions";

export function PortalTimezoneCapture({
  hasTimezone,
}: {
  hasTimezone: boolean;
}) {
  useEffect(() => {
    if (hasTimezone) return; // already known — don't bother the server
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) void capturePortalClientTimezone(tz);
    } catch {
      // Intl unavailable — the practitioner can still set it by hand.
    }
  }, [hasTimezone]);

  return null;
}
