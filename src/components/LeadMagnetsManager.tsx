"use client";

// Lead magnets — free, email-gated resources (a PDF, an image, or a pasted
// video link) that grow her list. This is the /lead-magnets admin: a list with
// publish / copy-link / delete, and an editor dialog.
//
// Bilingual contract (same as OffersManager): one magnet, both languages behind
// an EN/УКР switch, and BOTH panels stay MOUNTED (hidden, not unmounted) so
// switching tabs before saving can't drop the other language's text.
//
// Files upload straight from the browser to Vercel Blob (see
// /api/lead-magnets/upload) so a big PDF isn't bound by the 4 MB server-action
// limit; only the resulting URL is submitted with the rest of the form.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { notify } from "./FlashNotifier";
import {
  saveLeadMagnet,
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
};

type Lang = "en" | "uk";

const LANGS: { id: Lang; label: string; full: string }[] = [
  { id: "en", label: "EN", full: "English" },
  { id: "uk", label: "УКР", full: "Ukrainian" },
];

const KIND_LABEL: Record<string, string> = {
  pdf: "PDF",
  image: "Image",
  video_link: "Video link",
};

export function LeadMagnetsManager({
  initial,
  origin,
  accountId,
}: {
  initial: LeadMagnetRow[];
  origin: string;
  accountId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<LeadMagnetRow | "new" | null>(null);
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
                  <button
                    type="button"
                    onClick={() => setEditing(m)}
                    className="text-xs px-2 py-1 rounded-md text-plum-700 hover:bg-plum-50"
                  >
                    Edit
                  </button>
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

      <button
        type="button"
        onClick={() => setEditing("new")}
        className="text-xs font-medium px-3 py-2 rounded-md bg-plum-700 text-white hover:bg-plum-800"
      >
        + New lead magnet
      </button>

      {editing && (
        <LeadMagnetDialog
          magnet={editing === "new" ? null : editing}
          accountId={accountId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function LeadMagnetDialog({
  magnet,
  accountId,
  onClose,
  onSaved,
}: {
  magnet: LeadMagnetRow | null;
  accountId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [active, setActive] = useState<Lang>("en");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<string>(magnet?.assetKind ?? "pdf");
  const fu1 = magnet?.followups?.[0];
  const fu2 = magnet?.followups?.[1];

  // Asset state. For pdf/image the URL comes from a browser-direct Blob upload;
  // for video_link she pastes it. Prefill from the existing magnet on edit.
  const fileKind = kind === "pdf" || kind === "image";
  const [assetUrl, setAssetUrl] = useState<string>(
    magnet && magnet.assetKind !== "video_link" ? magnet.assetUrl ?? "" : ""
  );
  const [assetName, setAssetName] = useState<string>(magnet?.assetName ?? "");
  const [uploading, setUploading] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const blob = await upload(
        `accounts/${accountId}/lead-magnets/${safe}`,
        file,
        { access: "public", handleUploadUrl: "/api/lead-magnets/upload" }
      );
      setAssetUrl(blob.url);
      setAssetName(file.name);
    } catch {
      setError("That upload didn't go through — try again.");
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || uploading) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await saveLeadMagnet(new FormData(e.currentTarget));
      if (!res.ok) {
        setError(res.error);
        setSubmitting(false);
        return;
      }
      notify({
        kind: "success",
        title: magnet ? "Lead magnet updated" : "Lead magnet created",
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that");
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={magnet ? "Edit lead magnet" : "New lead magnet"}
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {magnet && <input type="hidden" name="id" value={magnet.id} />}
        {/* Always carry the uploaded asset URL + name (used for pdf/image). */}
        <input type="hidden" name="assetUrl" value={assetUrl} />
        <input type="hidden" name="assetName" value={assetName} />

        <div className="flex items-center gap-2">
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setActive(l.id)}
              className={
                active === l.id
                  ? "text-xs font-medium px-3 py-1.5 rounded-md bg-plum-700 text-white"
                  : "text-xs font-medium px-3 py-1.5 rounded-md bg-ink-100 text-ink-600 hover:bg-ink-200"
              }
            >
              {l.label}
            </button>
          ))}
          <span className="text-[11px] text-ink-500 italic ml-1">
            Writing the {active === "en" ? "English" : "Ukrainian"} version
          </span>
        </div>

        {LANGS.map((l) => {
          const en = l.id === "en";
          return (
            <div
              key={l.id}
              style={{ display: active === l.id ? "block" : "none" }}
              className="space-y-3"
            >
              <Field label="Title" required>
                <input
                  name={en ? "titleEn" : "titleUk"}
                  defaultValue={(en ? magnet?.titleEn : magnet?.titleUk) ?? ""}
                  className={inputCls}
                  placeholder={
                    en ? "The Coming-Home Workbook" : "Робочий зошит «Повернення до себе»"
                  }
                />
              </Field>
              <Field label="One-line subtitle" hint="Shown under the title. Optional.">
                <input
                  name={en ? "subtitleEn" : "subtitleUk"}
                  defaultValue={
                    (en ? magnet?.subtitleEn : magnet?.subtitleUk) ?? ""
                  }
                  className={inputCls}
                  placeholder={
                    en
                      ? "A quiet 15-minute practice for hearing your own voice."
                      : "Тиха 15-хвилинна практика, щоб почути власний голос."
                  }
                />
              </Field>
              <Field label="Description" hint="A short invitation. Blank lines start new paragraphs.">
                <textarea
                  name={en ? "descriptionEn" : "descriptionUk"}
                  rows={4}
                  defaultValue={
                    (en ? magnet?.descriptionEn : magnet?.descriptionUk) ?? ""
                  }
                  className={inputCls}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sign-up button" hint="On the /free page.">
                  <input
                    name={en ? "buttonEn" : "buttonUk"}
                    defaultValue={
                      (en ? magnet?.buttonEn : magnet?.buttonUk) ?? ""
                    }
                    className={inputCls}
                    placeholder={en ? "Send it to me" : "Надішліть мені"}
                  />
                </Field>
                <Field label="Download button" hint="In the email + after sign-up.">
                  <input
                    name={en ? "assetLabelEn" : "assetLabelUk"}
                    defaultValue={
                      (en ? magnet?.assetLabelEn : magnet?.assetLabelUk) ?? ""
                    }
                    className={inputCls}
                    placeholder={
                      en ? "Download the workbook" : "Завантажити зошит"
                    }
                  />
                </Field>
              </div>
              <Field
                label="Next-step link text"
                hint="An optional gentle nudge shown after they get it (e.g. book a Circle). Pair it with a link below."
              >
                <input
                  name={en ? "ctaLabelEn" : "ctaLabelUk"}
                  defaultValue={
                    (en ? magnet?.ctaLabelEn : magnet?.ctaLabelUk) ?? ""
                  }
                  className={inputCls}
                  placeholder={
                    en ? "When you're ready, come to a Circle →" : "Коли будете готові, завітайте до Кола →"
                  }
                />
              </Field>

              <div className="border-t border-ink-100 pt-3 mt-1 space-y-3">
                <p className="text-[11px] font-medium text-ink-500 uppercase tracking-wide">
                  Follow-up emails ({l.full})
                </p>
                <Field label="Follow-up 1 — subject">
                  <input
                    name={en ? "fuSubjectEn1" : "fuSubjectUk1"}
                    defaultValue={(en ? fu1?.subjectEn : fu1?.subjectUk) ?? ""}
                    className={inputCls}
                    placeholder={en ? "How is it landing?" : "Як воно відгукується?"}
                  />
                </Field>
                <Field label="Follow-up 1 — message" hint="Use {first} for their first name.">
                  <textarea
                    name={en ? "fuBodyEn1" : "fuBodyUk1"}
                    rows={3}
                    defaultValue={(en ? fu1?.bodyEn : fu1?.bodyUk) ?? ""}
                    className={inputCls}
                  />
                </Field>
                <Field label="Follow-up 2 — subject">
                  <input
                    name={en ? "fuSubjectEn2" : "fuSubjectUk2"}
                    defaultValue={(en ? fu2?.subjectEn : fu2?.subjectUk) ?? ""}
                    className={inputCls}
                  />
                </Field>
                <Field label="Follow-up 2 — message" hint="Use {first} for their first name.">
                  <textarea
                    name={en ? "fuBodyEn2" : "fuBodyUk2"}
                    rows={3}
                    defaultValue={(en ? fu2?.bodyEn : fu2?.bodyUk) ?? ""}
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>
          );
        })}

        <div className="border-t border-ink-100 pt-4 space-y-3">
          <Field
            label="Web address"
            hint="The end of the public link: /free/THIS. Leave blank to build it from the title."
          >
            <input
              name="slug"
              defaultValue={magnet?.slug ?? ""}
              className={inputCls}
              placeholder="coming-home-workbook"
            />
          </Field>

          <Field label="What are you giving away?">
            <select
              name="assetKind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className={inputCls}
            >
              <option value="pdf">A PDF (workbook, guide…)</option>
              <option value="image">An image</option>
              <option value="video_link">A video link (YouTube, Vimeo, Loom…)</option>
            </select>
          </Field>

          {fileKind ? (
            <Field
              label={kind === "pdf" ? "The PDF" : "The image"}
              hint="Uploads straight to your storage — up to 30 MB."
            >
              <input
                type="file"
                accept={kind === "pdf" ? "application/pdf" : "image/*"}
                onChange={onFile}
                disabled={uploading}
                className="block w-full text-sm text-ink-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-plum-50 file:text-plum-700 hover:file:bg-plum-100"
              />
              <div className="text-[11px] mt-1 leading-relaxed">
                {uploading ? (
                  <span className="text-plum-700">Uploading…</span>
                ) : assetUrl ? (
                  <span className="text-green-700">
                    ✓ {assetName || "File ready"} —{" "}
                    <a
                      href={assetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      view
                    </a>
                    . Choose another to replace it.
                  </span>
                ) : (
                  <span className="text-ink-400">No file yet.</span>
                )}
              </div>
            </Field>
          ) : (
            <Field
              label="Video link"
              hint="The full web address of the video."
            >
              <input
                name="assetVideoUrl"
                defaultValue={
                  magnet?.assetKind === "video_link" ? magnet.assetUrl ?? "" : ""
                }
                className={inputCls}
                placeholder="https://youtu.be/…"
              />
            </Field>
          )}

          <Field
            label="Next-step link"
            hint="Where the optional nudge above points — a full https:// address or a path on your site like /circles."
          >
            <input
              name="ctaHref"
              defaultValue={magnet?.ctaHref ?? ""}
              className={inputCls}
              placeholder="/#contact"
            />
          </Field>

          <div className="border-t border-ink-100 pt-3 space-y-2">
            <p className="text-xs font-medium text-ink-700">
              Follow-up flow (optional)
            </p>
            <p className="text-[11px] text-ink-400 leading-relaxed">
              Automatic nurture emails sent after someone signs up. Write each
              one&apos;s subject + message in both languages above, and set when
              it goes out here — leave a follow-up blank for none. Type{" "}
              <code className="text-ink-500">{"{first}"}</code> to drop in their
              first name; they&apos;re signed with your name automatically.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Follow-up 1 — days after sign-up">
                <input
                  name="fuDelayDays1"
                  type="number"
                  min={0}
                  max={365}
                  defaultValue={
                    fu1 ? String(Math.round(fu1.delayHours / 24)) : ""
                  }
                  className={inputCls}
                  placeholder="2"
                />
              </Field>
              <Field label="Follow-up 2 — days after sign-up">
                <input
                  name="fuDelayDays2"
                  type="number"
                  min={0}
                  max={365}
                  defaultValue={
                    fu2 ? String(Math.round(fu2.delayHours / 24)) : ""
                  }
                  className={inputCls}
                  placeholder="5"
                />
              </Field>
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            name="published"
            defaultChecked={magnet ? magnet.published : false}
            className="rounded border-ink-300"
          />
          Publish it (the /free page goes live)
        </label>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-2 rounded-md text-ink-600 hover:bg-ink-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || uploading}
            className="text-xs font-medium px-4 py-2 rounded-md bg-plum-700 text-white hover:bg-plum-800 disabled:opacity-60"
          >
            {uploading
              ? "Uploading…"
              : submitting
              ? "Saving…"
              : magnet
              ? "Save changes"
              : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
