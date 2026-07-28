"use client";

// Submit button for the portal's plain <form action={serverAction}> forms.
//
// Those forms are progressive-enhancement server actions with no client state,
// so the button stayed fully alive while the request was in flight — on a
// phone with a slow connection, a client tapping "Send the request" got no
// feedback at all and would tap again, filing two identical requests. This
// reads the form's own pending state and disables itself.

import { useFormStatus } from "react-dom";

export function PortalSubmitButton({
  children,
  pendingLabel,
  className = "px-4 py-2 text-sm bg-plum-700 hover:bg-plum-600 text-white rounded-md font-medium transition-colors",
}: {
  children: React.ReactNode;
  /** What to show while the action is running, e.g. "Sending…". */
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
