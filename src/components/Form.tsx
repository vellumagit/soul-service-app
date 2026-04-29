// Shared form input styles + labeled field helpers.
// Used by every dialog and inline edit form so all inputs feel the same.

import type { ReactNode } from "react";

export function Field({
  label,
  hint,
  required,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-ink-700 mb-1">
        {label}
        {required && <span className="text-flame-700"> *</span>}
      </label>
      {children}
      {hint && <div className="text-[11px] text-ink-400 mt-1">{hint}</div>}
    </div>
  );
}

export const inputCls =
  "w-full px-3 py-2 border border-ink-200 rounded-md text-sm outline-none focus:border-flame-600 focus:ring-2 focus:ring-flame-100 transition";

export const labelCls = "block text-xs font-medium text-ink-700 mb-1";
