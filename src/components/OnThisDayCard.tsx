// "On this day" — quietly surfaces birthdays + work anniversaries that fall
// on today. Renders nothing when the list is empty (and most days it will be).
//
// Designed to feel like a small note from a friend, not a notification panel.
// Honey-tinted, serif label, plain client names with a soft line of context.
// Each client name links to their file. Optional sentence suggesting a small
// gesture — never demands an action, never tracks "did she follow up."

import Link from "next/link";
import type { AnniversaryEvent } from "@/db/queries";

export function OnThisDayCard({ events }: { events: AnniversaryEvent[] }) {
  if (events.length === 0) return null;

  // Sort: birthdays first, then anniversaries (gentle priority).
  const sorted = [...events].sort((a, b) => {
    if (a.kind === b.kind) return a.clientName.localeCompare(b.clientName);
    return a.kind === "birthday" ? -1 : 1;
  });

  return (
    <div
      className="rounded-xl p-4 md:p-5 mb-6"
      style={{
        background:
          "linear-gradient(135deg, var(--color-honey-50) 0%, var(--color-parchment) 100%)",
        border: "1px solid var(--color-honey-100)",
        boxShadow:
          "0 1px 0 rgba(120, 90, 50, 0.03), 0 4px 16px rgba(120, 90, 50, 0.05)",
      }}
    >
      <div className="flex items-baseline gap-2 mb-2">
        <span
          className="serif-italic text-base text-honey-700"
          style={{ fontWeight: 500 }}
        >
          On this day
        </span>
        <span className="text-[10px] uppercase tracking-wider text-ink-400">
          {events.length} {events.length === 1 ? "note" : "notes"}
        </span>
      </div>
      <ul className="space-y-1.5">
        {sorted.map((e) => (
          <li key={`${e.kind}-${e.clientId}`} className="text-sm text-ink-700 leading-relaxed">
            <EventLine event={e} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EventLine({ event }: { event: AnniversaryEvent }) {
  const link = (
    <Link
      href={`/clients/${event.clientId}`}
      className="font-medium text-ink-900 hover:text-plum-700 hover:underline"
    >
      {event.clientName}
    </Link>
  );

  if (event.kind === "birthday") {
    return (
      <>
        It&apos;s {link}&apos;s birthday today
        {event.yearsOld != null && (
          <span className="text-ink-500"> · {event.yearsOld}</span>
        )}
        .{" "}
        <span className="text-ink-500 italic text-[13px]">
          A quick note would land soft.
        </span>
      </>
    );
  }

  // first-session anniversary
  const yrs = event.yearsTogether;
  return (
    <>
      <span className="text-ink-500">
        {yrs} {yrs === 1 ? "year" : "years"} with{" "}
      </span>
      {link}
      <span className="text-ink-500"> today.</span>{" "}
      <span className="text-ink-500 italic text-[13px]">
        Worth noticing.
      </span>
    </>
  );
}
