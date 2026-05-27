"use client";

// "Walk in →" — opens the Threshold prep view for a session in a new tab
// (so she keeps her current context if she's already mid-flow).
//
// Lives nested inside parent links (Today's session rows, the upcoming-
// session line in ClientHeader). stopPropagation keeps clicks from also
// triggering the surrounding nav. Mirrors the JoinMeetButton pattern.

import Link from "next/link";

export function WalkInButton({
  sessionId,
  size = "sm",
}: {
  sessionId: string;
  /** "sm" for compact contexts (rows), "md" for headers. */
  size?: "sm" | "md";
}) {
  const sizing =
    size === "md"
      ? "text-sm px-3 py-1.5"
      : "text-xs px-2.5 py-1";
  return (
    <Link
      href={`/sessions/${sessionId}/prep`}
      onClick={(e) => e.stopPropagation()}
      className={`${sizing} rounded-md border border-plum-200 bg-plum-50 text-plum-700 hover:bg-plum-100 hover:border-plum-300 transition-colors shrink-0 inline-flex items-center gap-1`}
      title="Open the prep view for this session"
    >
      Walk in
      <span aria-hidden="true">→</span>
    </Link>
  );
}
