"use client";

// Settings → Offers — the "Ways to work together" ladder, editable.
//
// Grouped by the two rows the storefront actually renders ("Begin gently" /
// "Go deeper") rather than as one flat list, because that's what she sees on
// the page. Reordering is within a row; a card changes rows via "Move to …".
//
// Same bilingual contract as ReviewsManager: one offer, both languages behind
// an EN/УКР switch, both panels stay MOUNTED so switching tabs before saving
// can't drop the other language.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { Field, inputCls, labelCls } from "./Form";
import { notify } from "./FlashNotifier";
import {
  saveOffer,
  deleteOffer,
  moveOffer,
  switchOfferLane,
} from "@/lib/offer-actions";

export type OfferItem = {
  id: string;
  stepEn: string;
  stepUk: string;
  titleEn: string;
  titleUk: string;
  priceEn: string;
  priceUk: string;
  priceSuffixEn: string;
  priceSuffixUk: string;
  descriptionEn: string;
  descriptionUk: string;
  ctaEn: string;
  ctaUk: string;
  linkKind: string;
  customHref: string | null;
  variant: string;
  lane: string;
  published: boolean;
  sortOrder: number;
};

type Lang = "en" | "uk";

const LANGS: { id: Lang; label: string; full: string }[] = [
  { id: "en", label: "EN", full: "English" },
  { id: "uk", label: "УКР", full: "Ukrainian" },
];

const LANES: { id: string; label: string; hint: string }[] = [
  {
    id: "entry",
    label: "Begin gently",
    hint: "The top row — the easy first yes.",
  },
  {
    id: "deep",
    label: "Go deeper",
    hint: "The second row — the bigger commitments.",
  },
];

const LINK_LABELS: Record<string, string> = {
  quiz: "The quiz",
  circle: "The next Circle",
  contact: "Your contact form",
  custom: "A link you choose",
};

export function OffersManager({ initial }: { initial: OfferItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<OfferItem | "new" | null>(null);
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
        These are the cards under &ldquo;Ways to work together&rdquo; on your
        public page. Add what you offer, set the price and where the button
        goes, and arrange them in the two rows visitors see. Each offer is
        written once, in both languages.
      </p>

      {initial.length === 0 && (
        <div className="border border-dashed border-ink-200 rounded-lg p-6 mb-4">
          <div className="text-sm text-ink-600 mb-1">
            You haven&apos;t set up your own offers yet.
          </div>
          <div className="text-[12px] text-ink-400 leading-relaxed">
            Your page is showing the six built-in ones for now. Add your first
            offer below and this list takes over completely — and if you ever
            delete them all, the built-in six come back rather than leaving
            your page with nothing to book.
          </div>
        </div>
      )}

      {LANES.map((lane) => {
        const rows = initial.filter((o) => o.lane === lane.id);
        return (
          <div key={lane.id} className="mb-5">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-xs font-medium text-ink-700">
                {lane.label}
              </span>
              <span className="text-[11px] text-ink-400">{lane.hint}</span>
            </div>

            {rows.length === 0 ? (
              <div className="text-[11px] text-ink-400 italic border border-dashed border-ink-200 rounded-lg px-3 py-4">
                Nothing in this row.
              </div>
            ) : (
              <ul className="space-y-2">
                {rows.map((o, i) => (
                  <li
                    key={o.id}
                    className="border border-ink-200 rounded-lg p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-sm font-medium text-ink-900">
                            {o.titleEn || o.titleUk}
                          </span>
                          <span className="text-xs text-ink-600">
                            {o.priceEn || o.priceUk}
                            {(o.priceSuffixEn || o.priceSuffixUk) && (
                              <span className="text-ink-400">
                                {" "}
                                {o.priceSuffixEn || o.priceSuffixUk}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="text-[11px] text-ink-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>
                            Button → {LINK_LABELS[o.linkKind] ?? o.linkKind}
                          </span>
                          {o.variant === "feature" && (
                            <span className="px-1.5 py-0.5 rounded bg-plum-50 text-plum-700">
                              Highlighted
                            </span>
                          )}
                          {o.variant === "free" && (
                            <span className="px-1.5 py-0.5 rounded bg-ink-100 text-ink-600">
                              Entry card
                            </span>
                          )}
                          {!o.published && (
                            <span className="px-1.5 py-0.5 rounded bg-ink-100 text-ink-600">
                              Hidden
                            </span>
                          )}
                          {(!o.titleEn || !o.titleUk) && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                              {o.titleEn ? "No Ukrainian yet" : "No English yet"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <IconBtn
                          label="Move up"
                          disabled={i === 0 || busyId === o.id}
                          onClick={() =>
                            run(o.id, () => moveOffer(o.id, "up"), "Moved up")
                          }
                        >
                          ↑
                        </IconBtn>
                        <IconBtn
                          label="Move down"
                          disabled={i === rows.length - 1 || busyId === o.id}
                          onClick={() =>
                            run(
                              o.id,
                              () => moveOffer(o.id, "down"),
                              "Moved down"
                            )
                          }
                        >
                          ↓
                        </IconBtn>
                        <button
                          type="button"
                          disabled={busyId === o.id}
                          onClick={() =>
                            run(
                              o.id,
                              () => switchOfferLane(o.id),
                              `Moved to “${
                                o.lane === "deep" ? "Begin gently" : "Go deeper"
                              }”`
                            )
                          }
                          className="text-[11px] px-2 py-1 rounded-md text-ink-500 hover:bg-ink-100 disabled:opacity-50"
                        >
                          {o.lane === "deep" ? "↥ Begin gently" : "↧ Go deeper"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(o)}
                          className="text-xs px-2 py-1 rounded-md text-plum-700 hover:bg-plum-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busyId === o.id}
                          onClick={() => {
                            if (
                              !confirm(
                                "Delete this offer? To take it off the page without losing it, edit it and untick “Show on my page” instead."
                              )
                            )
                              return;
                            run(
                              o.id,
                              () => deleteOffer(o.id),
                              "Offer deleted"
                            );
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
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => setEditing("new")}
        className="text-xs font-medium px-3 py-2 rounded-md bg-plum-700 text-white hover:bg-plum-800"
      >
        + Add an offer
      </button>

      {editing && (
        <OfferDialog
          offer={editing === "new" ? null : editing}
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

function OfferDialog({
  offer,
  onClose,
  onSaved,
}: {
  offer: OfferItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [active, setActive] = useState<Lang>("en");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkKind, setLinkKind] = useState(offer?.linkKind ?? "contact");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveOffer(new FormData(e.currentTarget));
      notify({
        kind: "success",
        title: offer ? "Offer updated" : "Offer added",
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
      title={offer ? "Edit offer" : "Add an offer"}
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {offer && <input type="hidden" name="id" value={offer.id} />}

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
              <Field
                label="Small line above the name"
                hint="e.g. “One-to-one · your first yes”. Optional."
              >
                <input
                  name={en ? "stepEn" : "stepUk"}
                  defaultValue={(en ? offer?.stepEn : offer?.stepUk) ?? ""}
                  className={inputCls}
                />
              </Field>
              <Field label="Name of the offer" required>
                <input
                  name={en ? "titleEn" : "titleUk"}
                  defaultValue={(en ? offer?.titleEn : offer?.titleUk) ?? ""}
                  className={inputCls}
                  placeholder={en ? "A Single Session" : "Одна сесія"}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price" hint="Written as you want it read.">
                  <input
                    name={en ? "priceEn" : "priceUk"}
                    defaultValue={(en ? offer?.priceEn : offer?.priceUk) ?? ""}
                    className={inputCls}
                    placeholder={en ? "$150" : "Безкоштовно"}
                  />
                </Field>
                <Field label="After the price" hint="e.g. “/ session”.">
                  <input
                    name={en ? "priceSuffixEn" : "priceSuffixUk"}
                    defaultValue={
                      (en ? offer?.priceSuffixEn : offer?.priceSuffixUk) ?? ""
                    }
                    className={inputCls}
                    placeholder={en ? "/ session" : "/ сеанс"}
                  />
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  name={en ? "descriptionEn" : "descriptionUk"}
                  rows={4}
                  defaultValue={
                    (en ? offer?.descriptionEn : offer?.descriptionUk) ?? ""
                  }
                  className={inputCls}
                />
              </Field>
              <Field label="Button text">
                <input
                  name={en ? "ctaEn" : "ctaUk"}
                  defaultValue={(en ? offer?.ctaEn : offer?.ctaUk) ?? ""}
                  className={inputCls}
                  placeholder={en ? "Book a session →" : "Записатися →"}
                />
              </Field>
            </div>
          );
        })}

        <div className="border-t border-ink-100 pt-4 space-y-3">
          <Field label="Where the button goes">
            <select
              name="linkKind"
              value={linkKind}
              onChange={(e) => setLinkKind(e.target.value)}
              className={inputCls}
            >
              <option value="contact">
                Your contact form (the &ldquo;send a note&rdquo; section)
              </option>
              <option value="circle">
                The next Circle&apos;s booking page
              </option>
              <option value="quiz">The quiz</option>
              <option value="custom">A link you choose</option>
            </select>
          </Field>

          {linkKind === "custom" && (
            <Field
              label="The link"
              hint="A full web address (https://…) or a path on your own site (/quiz)."
            >
              <input
                name="customHref"
                defaultValue={offer?.customHref ?? ""}
                className={inputCls}
                placeholder="https://…"
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Which row">
              <select
                name="lane"
                defaultValue={offer?.lane ?? "entry"}
                className={inputCls}
              >
                <option value="entry">Begin gently (top row)</option>
                <option value="deep">Go deeper (second row)</option>
              </select>
            </Field>
            <Field label="Card style">
              <select
                name="variant"
                defaultValue={offer?.variant ?? "plain"}
                className={inputCls}
              >
                <option value="plain">Normal</option>
                <option value="free">Entry card (softer)</option>
                <option value="feature">Highlighted</option>
              </select>
            </Field>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            name="published"
            defaultChecked={offer ? offer.published : true}
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
            {submitting ? "Saving…" : offer ? "Save changes" : "Add offer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
