"use client";

import { useState } from "react";
import { signOutAction } from "@/lib/auth-actions";
import { useT } from "./LocaleProvider";

// Tiny "sign out" link for the sidebar footer. Calls the signOutAction server
// action which clears the session cookie and redirects to /signin.
export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const t = useT();

  return (
    <form
      action={async () => {
        setPending(true);
        try {
          await signOutAction();
        } finally {
          // signOutAction redirects, so we generally don't reach this — but
          // restore state if it ever fails.
          setPending(false);
        }
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="text-[10px] uppercase tracking-wide text-ink-400 hover:text-ink-700 disabled:opacity-60"
      >
        {pending ? t("sidebar.signingOut") : t("sidebar.signOut")}
      </button>
    </form>
  );
}
