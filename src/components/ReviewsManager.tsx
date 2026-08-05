"use client";

// Settings → Landing page → Reviews.
//
// One list, one dialog. Each review carries BOTH languages behind an EN/УКР
// tab pair — the same shape as the storefront copy editor above it, so the two
// panels feel like one idea. Both language panels stay mounted (the inactive
// one is hidden, not unmounted) so switching tabs before saving can't silently
// drop the other language's text.
//
// The photo and the position in the list are shared across languages: a review
// is one person saying one thing, so only the words are per-language.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { Field, inputCls, labelCls } from "./Form";
import { notify } from "./FlashNotifier";
import { downscaleImage } from "@/lib/downscale-image";
import {
  saveReview,
  deleteReview,
  moveReview,
  removeReviewPhoto,
} from "@/lib/review-actions";

export type ReviewItem = {
  id: string;
  quoteEn: string;
  quoteUk: string;
  authorEn: string;
  authorUk: string;
  photoUrl: string | null;
  published: boolean;
  sortOrder: number;
};

type Lang = "en" | "uk";

const LANGS: { id: Lang; label: string; full: string }[] = [
  { id: "en", label: "EN", full: "English" },
  { id: "uk", label: "УКР", full: "Ukrainian" },
];

export function ReviewsManager({ initial }: { initial: ReviewItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ReviewItem | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<void>, done: string) {
    setBusyId(id);
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
      setBusyId(null);
    }
  }

  return (
    <div>
      <p className="text-[12px] text-ink-500 italic mb-4 leading-relaxed">
        These appear on your public page, in the section just under &ldquo;Ways
        to work together&rdquo;. Add each review once — you write it in English
        and Ukrainian, and visitors see the version that matches the language
        they&apos;re reading. If you only fill in one language, that one is
        shown to everybody.
      </p>

      {initial.length === 0 ? (
        <div className="border border-dashed border-ink-200 rounded-lg p-6 text-center mb-4">
          <div className="text-sm text-ink-600 mb-1">No reviews yet.</div>
          <div className="text-[12px] text-ink-400">
            While this list is empty, the reviews section stays off your page
            entirely.
          </div>
        </div>
      ) : (
        <ul className="space-y-2 mb-4">
          {initial.map((r, i) => (
            <li
              key={r.id}
              className="flex items-start gap-3 border border-ink-200 rounded-lg p-3"
            >
              <Avatar review={r} />

              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink-800 line-clamp-2 leading-snug">
                  {r.quoteEn || r.quoteUk}
                </div>
                <div className="text-[11px] text-ink-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{r.authorEn || r.authorUk || "—"}</span>
                  {!r.published && (
                    <span className="px-1.5 py-0.5 rounded bg-ink-100 text-ink-600">
                      Hidden
                    </span>
                  )}
                  {(!r.quoteEn || !r.quoteUk) && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                      {r.quoteEn ? "No Ukrainian yet" : "No English yet"}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <IconBtn
                  label="Move up"
                  disabled={i === 0 || busyId === r.id}
                  onClick={() =>
                    run(r.id, () => moveReview(r.id, "up"), "Moved up")
                  }
                >
                  ↑
                </IconBtn>
                <IconBtn
                  label="Move down"
                  disabled={i === initial.length - 1 || busyId === r.id}
                  onClick={() =>
                    run(r.id, () => moveReview(r.id, "down"), "Moved down")
                  }
                >
                  ↓
                </IconBtn>
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="text-xs px-2 py-1 rounded-md text-plum-700 hover:bg-plum-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => {
                    if (
                      !confirm(
                        "Delete this review? To take it off the page without losing it, edit it and untick “Show on my page” instead."
                      )
                    )
                      return;
                    run(r.id, () => deleteReview(r.id), "Review deleted");
                  }}
                  className="text-xs px-2 py-1 rounded-md text-ink-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
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
        + Add a review
      </button>

      {editing && (
        <ReviewDialog
          review={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
          onPhotoRemoved={async (id) => {
            await removeReviewPhoto(id);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Avatar({ review }: { review: ReviewItem }) {
  const initial = (review.authorEn || review.authorUk || "?")
    .trim()
    .charAt(0)
    .toUpperCase();
  if (review.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={review.photoUrl}
        alt=""
        className="w-9 h-9 rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div className="w-9 h-9 rounded-full bg-plum-100 text-plum-700 flex items-center justify-center text-xs font-medium shrink-0">
      {initial}
    </div>
  );
}

function IconBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="w-6 h-6 rounded text-ink-500 hover:bg-ink-100 disabled:opacity-30 disabled:hover:bg-transparent text-xs"
    >
      {children}
    </button>
  );
}

function ReviewDialog({
  review,
  onClose,
  onSaved,
  onPhotoRemoved,
}: {
  review: ReviewItem | null;
  onClose: () => void;
  onSaved: () => void;
  onPhotoRemoved: (id: string) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [active, setActive] = useState<Lang>("en");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(
    review?.photoUrl ?? null
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData(e.currentTarget);
      // Shrink the photo in the browser before it goes anywhere. A photo
      // straight off a phone is several MB, which a Server Action rejects
      // outright — that was the "server error" on this dialog.
      const picked = fd.get("photo");
      if (picked instanceof File && picked.size > 0) {
        fd.set("photo", await downscaleImage(picked));
      }
      await saveReview(fd);
      notify({
        kind: "success",
        title: review ? "Review updated" : "Review added",
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
      title={review ? "Edit review" : "Add a review"}
      size="lg"
    >
      <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
        {review && <input type="hidden" name="id" value={review.id} />}

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

        {LANGS.map((l) => (
          <div
            key={l.id}
            style={{ display: active === l.id ? "block" : "none" }}
            className="space-y-3"
          >
            <Field label={`What they said (${l.full})`}>
              <textarea
                name={l.id === "en" ? "quoteEn" : "quoteUk"}
                rows={4}
                defaultValue={
                  (l.id === "en" ? review?.quoteEn : review?.quoteUk) ?? ""
                }
                className={inputCls}
                placeholder={
                  l.id === "en"
                    ? "I came in carrying something I couldn't name…"
                    : "Я прийшла з тим, чого не могла назвати…"
                }
              />
            </Field>
            <Field
              label={`Who said it (${l.full})`}
              hint="However they'd like to be credited — a first name, an initial, a city."
            >
              <input
                name={l.id === "en" ? "authorEn" : "authorUk"}
                defaultValue={
                  (l.id === "en" ? review?.authorEn : review?.authorUk) ?? ""
                }
                className={inputCls}
                placeholder={l.id === "en" ? "M., Kyiv" : "М., Київ"}
              />
            </Field>
          </div>
        ))}

        <div className="border-t border-ink-100 pt-4">
          <label className={labelCls}>Photo (optional)</label>
          <div className="flex items-center gap-3">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt=""
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-ink-100" />
            )}
            <div className="flex-1">
              <input
                type="file"
                name="photo"
                accept="image/*"
                className="text-xs text-ink-600"
              />
              <div className="text-[11px] text-ink-400 mt-1">
                JPG or PNG — big photos are shrunk automatically, so anything
                straight off your phone is fine. The same photo is used on both
                languages. Leave empty to keep the current one.
              </div>
            </div>
            {review && photoUrl && (
              <button
                type="button"
                onClick={async () => {
                  await onPhotoRemoved(review.id);
                  setPhotoUrl(null);
                }}
                className="text-[11px] text-ink-500 hover:text-red-600"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            name="published"
            defaultChecked={review ? review.published : true}
            className="rounded border-ink-300"
          />
          Show on my page
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
            disabled={submitting}
            className="text-xs font-medium px-4 py-2 rounded-md bg-plum-700 text-white hover:bg-plum-800 disabled:opacity-60"
          >
            {submitting ? "Saving…" : review ? "Save changes" : "Add review"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
