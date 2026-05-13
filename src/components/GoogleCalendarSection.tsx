"use client";

// "Coming soon" state for v1 delivery.
//
// The full OAuth + Calendar event sync is wired up in lib/google-calendar.ts
// and the connect/disconnect server actions still exist — we're just hiding
// the UI controls so Svitlana doesn't see a half-finished integration during
// the demo. To re-enable, flip GOOGLE_CALENDAR_ENABLED=true in env vars and
// swap this component back to the active controls (see git history for the
// prior version).

type Props = {
  // All the old props remain so the page can keep passing them; we just don't
  // render anything that uses them yet.
  connected: boolean;
  email: string | null;
  connectedAt: Date | null;
  flashStatus?: "connected" | "error" | null;
  flashEmail?: string | null;
  flashReason?: string | null;
};

export function GoogleCalendarSection(_props: Props) {
  return (
    <section className="border border-ink-200 rounded-md bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-md bg-ink-100 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-ink-500" viewBox="0 0 24 24" fill="none">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="currentColor"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-ink-900">
              Google Calendar &amp; Meet
            </h2>
            <span className="chip bg-amber-50 text-amber-700">COMING SOON</span>
          </div>
          <p className="text-xs text-ink-500 mt-1 leading-relaxed">
            Once this is on, scheduling a session here will auto-create a
            Google Calendar event with a Meet link and email an invite to
            your client. Reschedules and cancellations sync automatically.
            <br />
            <span className="text-ink-400">
              For now, you can paste a Meet link manually on each session.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
