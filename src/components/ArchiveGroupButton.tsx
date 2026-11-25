"use client";

// Archive / restore a Circle. Archiving keeps every record (sign-ups,
// payments, who came) but takes the Circle off her Circles list and her
// storefront and stops its weekly rhythm — the tidy-up for a Circle that
// delete rightly refuses (it has real history). Restoring brings it back
// unpublished, so nothing reappears on her page by surprise.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveGroup, unarchiveGroup } from "@/lib/group-actions";
import { notify } from "./FlashNotifier";

interface Props {
  groupId: string;
  groupName: string;
  archived: boolean;
  /** "quiet" = the small danger-zone link; "button" = the banner's button. */
  look?: "quiet" | "button";
}

export function ArchiveGroupButton({
  groupId,
  groupName,
  archived,
  look = "quiet",
}: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    if (archived) {
      startTransition(async () => {
        await unarchiveGroup(groupId);
        notify({
          kind: "success",
          title: "Circle restored",
          body: "It's back on your Circles list — still unpublished. Tick “Publish on my storefront” under Edit circle when you want it on your page.",
          ttlMs: 6000,
        });
        router.refresh();
      });
      return;
    }
    if (
      !confirm(
        `Archive “${groupName}”?\n\nIt leaves your Circles list and your page, and its weekly rhythm stops. Upcoming sessions nobody signed up for are cancelled. All records stay, and you can restore it any time.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await archiveGroup(groupId);
      if (!r.ok) {
        notify({
          kind: "warning",
          title: "Not archived yet",
          body: r.error,
          ttlMs: 8000,
        });
        return;
      }
      notify({
        kind: "success",
        title: "Circle archived",
        body:
          r.cancelled > 0
            ? `${r.cancelled} empty upcoming ${r.cancelled === 1 ? "session was" : "sessions were"} cancelled. Find it under “Archived” on your Circles page.`
            : "Find it under “Archived” on your Circles page.",
        ttlMs: 5000,
      });
      router.push("/groups");
      router.refresh();
    });
  }

  const label = archived
    ? pending
      ? "Restoring…"
      : "Restore this Circle"
    : pending
      ? "Archiving…"
      : "Archive this Circle";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-busy={pending}
      className={
        look === "button"
          ? "px-3 py-1.5 text-[13px] font-medium rounded-md bg-ink-900 hover:bg-ink-800 text-white disabled:opacity-50"
          : "text-[11px] text-ink-500 hover:text-ink-900 disabled:opacity-50"
      }
    >
      {label}
    </button>
  );
}
