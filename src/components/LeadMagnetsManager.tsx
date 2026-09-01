"use client";

// Lead magnets — free, email-gated resources (a PDF, an image, or a pasted
// video link) that grow her list. This is the /lead-magnets index: the list
// with publish / copy-link / delete. Creating and editing happen on their own
// full pages (/lead-magnets/new and /lead-magnets/[id]) via LeadMagnetEditor —
// a roomy, flow-ordered form with a live preview, not a cramped dialog.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { notify } from "./FlashNotifier";
import {
  setLeadMagnetPublished,
  deleteLeadMagnet,
} from "@/lib/lead-magnet-actions";

export type LeadMagnetRow = {
  id: string;
  slug: string;
  titleEn: string;
  titleUk: string;
  subtitleEn: string;
  subtitleUk: string;
  descriptionEn: string;
  descriptionUk: string;
  buttonEn: string;
  buttonUk: string;
  assetKind: string;
  assetUrl: string | null;
  assetName: string | null;
  assetLabelEn: string;
  assetLabelUk: string;
  ctaLabelEn: string;
  ctaLabelUk: string;
  ctaHref: string | null;
  followups: LeadMagnetFollowupInput[];
  published: boolean;
  optinCount: number;
};

export type LeadMagnetFollowupInput = {
  delayHours: number;
  subjectEn: string;
  subjectUk: string;
  bodyEn: string;
  bodyUk: string;
  ctaLabelEn?: string;
  ctaLabelUk?: string;
  ctaHref?: string;
};

const KIND_LABEL: Record<string, string> = {
  pdf: "PDF",
  image: "Image",
  video_link: "Video link",
};

export function LeadMagnetsManager({
  initial,
  origin,
}: {
  initial: LeadMagnetRow[];
  origin: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<void>, done: string) {
    setBusy(id);
    try {
      await fn();
      notify({ kind: "success", title: done });
      router.refresh();
    } catch (e) {
      notify({
        kind: "error",
        title: e instanceof Error ? e.message : "Something went wrong",
      });
    } finally {
      setBusy(null);
    }
  }

  function publicUrl(slug: string) {
    return `${origin}/free/${slug}`;
  }

  async function copyLink(slug: string) {
    try {
      await navigator.clipboard.writeText(publicUrl(slug));
      notify({ kind: "success", title: "Link copied" });
    } catch {
      notify({ kind: "error", title: "Couldn't copy — long-press the link instead" });
    }
  }

  return (
    <div>
      <p className="text-[12px] text-ink-500 italic mb-4 leading-relaxed">
        A lead magnet is a free thing you give away — a PDF, an image, or a video
        — in exchange for an email. Each one gets its own page at{" "}
        <code className="not-italic">/free/…</code> that you can share anywhere;
        when someone signs up, the resource is emailed to them instantly and they
        land in your <strong>Network → Inbox</strong>.
      </p>

      {initial.length === 0 && (
        <div className="border border-dashed border-ink-200 rounded-lg p-6 mb-4">
          <div className="text-sm text-ink-600 mb-1">
            You haven&apos;t made a lead magnet yet.
          </div>
          <div className="text-[12px] text-ink-400 leading-relaxed">
            Make your first one below — a workbook PDF is a lovely place to
            start. You&apos;ll get a shareable link and every sign-up in one
            place.
          </div>
        </div>
      )}

      {initial.length > 0 && (
        <ul className="space-y-2 mb-4">
          {initial.map((m) => (
            <li key={m.id} className="border border-ink-200 rounded-lg p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium text-ink-900">
                      {m.titleEn || m.titleUk || "Untitled"}
                    </span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-600">
                      {KIND_LABEL[m.assetKind] ?? m.assetKind}
                    </span>
                    {!m.published && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-600">
                        Draft
                      </span>
                    )}
                    {(!m.titleEn || !m.titleUk) && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                        {m.titleEn ? "No Ukrainian yet" : "No English yet"}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <button
                      type="button"
                      onClick={() => copyLink(m.slug)}
                      className="text-plum-700 hover:underline"
                      title={publicUrl(m.slug)}
                    >
                      /free/{m.slug} · copy link
                    </button>
                    <a
                      href={publicUrl(m.slug)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink-500 hover:text-plum-700"
                    >
                      preview ↗
                    </a>
                    <span className="text-ink-400">
                      {m.optinCount} {m.optinCount === 1 ? "sign-up" : "sign-ups"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={busy === m.id}
                    onClick={() =>
                      run(
                        m.id,
                        () => setLeadMagnetPublished(m.id, !m.published),
                        m.published ? "Unpublished" : "Published"
                      )
                    }
                    className="text-xs px-2 py-1 rounded-md text-ink-600 hover:bg-ink-100 disabled:opacity-50"
                  >
                    {m.published ? "Unpublish" : "Publish"}
                  </button>
                  <Link
                    href={`/lead-magnets/${m.id}`}
                    className="text-xs px-2 py-1 rounded-md text-plum-700 hover:bg-plum-50"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    disabled={busy === m.id}
                    onClick={() => {
                      if (
                        !confirm(
                          "Delete this lead magnet? Its /free page stops working. People who already downloaded it keep their copy, and their sign-ups stay in your inbox."
                        )
                      )
                        return;
                      run(m.id, () => deleteLeadMagnet(m.id), "Deleted");
                    }}
                    className="text-xs px-2 py-1 rounded-md text-ink-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/lead-magnets/new"
        className="inline-block text-xs font-medium px-3 py-2 rounded-md bg-plum-700 text-white hover:bg-plum-800"
      >
        + New lead magnet
      </Link>
    </div>
  );
}
