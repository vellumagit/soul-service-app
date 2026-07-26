"use client";

// Quiet danger-zone control at the bottom of a Circle's page. The server
// action refuses to delete a Circle with any sign-up history (records are
// part of her books), so this is only destructive for empty/mistake
// Circles — still, it double-confirms.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteGroup } from "@/lib/group-actions";
import { notify } from "./FlashNotifier";

interface Props {
  groupId: string;
  groupName: string;
}

export function DeleteGroupButton({ groupId, groupName }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    if (
      !confirm(
        `Delete “${groupName}” entirely? Its scheduled sessions go with it. This can't be undone.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await deleteGroup(groupId);
      if (!r.ok) {
        notify({
          kind: "warning",
          title: "This Circle can't be deleted",
          body: r.error,
          ttlMs: 8000,
        });
        return;
      }
      notify({
        kind: "success",
        title: "Circle deleted",
        ttlMs: 2500,
      });
      router.push("/groups");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-[11px] text-ink-400 hover:text-rose-700 disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete this Circle"}
    </button>
  );
}
