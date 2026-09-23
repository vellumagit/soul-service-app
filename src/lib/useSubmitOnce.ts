"use client";

// One submit at a time, for forms that use `<form action={async fd => …}>`.
//
// Why this exists: React runs a form action as a transition, which has two
// consequences that together made double-clicks create duplicates —
//   1. `setSubmitting(true)` inside the action doesn't render until the action
//      FINISHES, so the "disabled while submitting" button never disables.
//   2. A second submit isn't dropped, it's QUEUED, and runs right after the
//      first one completes — so a lock taken inside the action has already
//      been released by the time the queued copy runs.
// That's how Svitlana got two identical sessions 3 seconds apart (each with
// its own Calendar invite), and two copies of a new client 0.6s apart.
//
// So the lock is taken in `onSubmit`, which fires synchronously on the click,
// before React queues anything. A submit that arrives while one is in flight
// calls preventDefault(), and React skips the action entirely. The lock is
// released when the action settles (success, early return, throw, redirect).
//
// Usage — spread it onto the form in place of `action=`:
//   const submitOnce = useSubmitOnce();
//   <form {...submitOnce(async (fd) => { … })}>
// One hook per component is enough; forms in it share the lock.

import { useRef, type FormEvent } from "react";

export function useSubmitOnce() {
  const busy = useRef(false);
  return (action: (fd: FormData) => Promise<void> | void) => ({
    onSubmit: (e: FormEvent<HTMLFormElement>) => {
      if (busy.current) e.preventDefault();
      else busy.current = true;
    },
    action: async (fd: FormData) => {
      try {
        await action(fd);
      } finally {
        busy.current = false;
      }
    },
  });
}
