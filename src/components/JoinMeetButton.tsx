"use client";

// Tiny client-side wrapper around the "Join Meet" link.
//
// Why: the link appears nested inside a wrapping <Link> (the row navigates to
// the client profile when clicked). Without stopPropagation, clicking "Join
// Meet" opens Meet in a new tab AND navigates the current tab to the client
// page — confusing. stopPropagation needs a real event handler, which can't
// live in a server component (the function prop is silently dropped at
// server-render time and the link becomes a dead end for its intended job).
//
// Used from src/app/page.tsx (Today's sessions row) — a server component, so
// this client wrapper is the only way to keep the propagation guard alive.

export function JoinMeetButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="bg-ink-900 hover:bg-ink-800 text-white text-xs font-medium px-3 py-1.5 rounded-md shrink-0"
    >
      Join Meet
    </a>
  );
}
