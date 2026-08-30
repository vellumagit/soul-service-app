// The one section container for the whole app.
//
// Everything that is a "section" of a page lives in one of these — a flat
// parchment card (see .paper-card) with a quiet, non-italic title and even
// padding. It replaces the old mix of clinical white boxes, bare floating
// blocks, and the client page's local ScanCard, so the eye can lock onto
// section boundaries without effort.
//
// - `title`   : the section label (plain sans, quiet). Omit for a card with no
//               header (e.g. a single stat strip).
// - `action`  : optional right-aligned control on the title row (a link, a
//               small button).
// - `pad`     : "md" (default) | "sm" | "none" — body padding for dense/edge-to-
//               edge content (a list that wants its own dividers).

import type { ReactNode } from "react";

export function Section({
  title,
  action,
  children,
  className = "",
  pad = "md",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: "md" | "sm" | "none";
}) {
  const padCls = pad === "none" ? "" : pad === "sm" ? "p-3.5" : "p-5";
  return (
    <section className={`paper-card ${padCls} ${className}`.trim()}>
      {(title || action) && (
        <div
          className={`flex items-center justify-between gap-3 ${
            pad === "none" ? "px-5 pt-5 pb-3" : "mb-3"
          }`}
        >
          {title ? (
            <h2 className="text-sm font-medium text-ink-800 tracking-tight">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
