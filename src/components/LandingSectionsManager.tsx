"use client";

// Settings → Landing page — the storefront as a stack of section cards.
//
// Same shape as Offers and Reviews: a list you can rearrange, each row with
// Edit / Show-Hide / ↑ ↓. The difference is that the sections are PRESET —
// there's no "+ Add", because the page is built from a fixed set of blocks.
// What she controls is their order, whether each one appears, and its words.
//
// Words are saved per section, from that section's own dialog — not with the
// big Settings form. Each dialog carries only its own fields, and the action
// merges them over the rest, so saving the hero can't touch the closing.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { notify } from "./FlashNotifier";
import {
  moveLandingSection,
  toggleLandingSection,
  saveSectionCopy,
  resetLandingSections,
} from "@/lib/section-actions";
import {
  fieldsForSection,
  landingOverrideInputName,
  type LandingCopyOverrides,
} from "@/lib/landing-overrides";
import type { LandingSectionSlug } from "@/lib/landing-sections";

export type SectionItem = {
  slug: LandingSectionSlug;
  label: string;
  blurb: string;
  canHide: boolean;
  canMove: boolean;
  visible: boolean;
  conditional?: string;
  managedAt?: { label: string; note: string };
  /** Placeholder text per field key — the wording currently on the page, so
   *  she can see what she's replacing. Computed on the server because the
   *  dictionary lookup needs the copy module. */
  placeholders: Record<string, string>;
  /** How many of this section's fields she has already overridden. */
  editedCount: number;
};

type Lang = "en" | "uk";

const LANGS: { id: Lang; label: string; full: string }[] = [
  { id: "en", label: "EN", full: "English" },
  { id: "uk", label: "УКР", full: "Ukrainian" },
];

export function LandingSectionsManager({
  initial,
  overrides,
}: {
  initial: SectionItem[];
  overrides: LandingCopyOverrides | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<SectionItem | null>(null);
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

  const movable = initial.filter((s) => s.canMove);
  const firstMovable = movable[0]?.slug;
  const lastMovable = movable[movable.length - 1]?.slug;

  return (
    <div>
      <p className="text-[12px] text-ink-500 italic mb-4 leading-relaxed">
        Your public page, section by section, top to bottom. Open one to rewrite
        its words in English and Ukrainian, use ↑ ↓ to move it up or down the
        page, and Hide to take it off without losing anything.
      </p>

      <ul className="space-y-2 mb-4">
        {initial.map((s) => (
          <li
            key={s.slug}
            className={
              s.visible
                ? "border border-ink-200 rounded-lg p-3"
                : "border border-ink-200 rounded-lg p-3 bg-ink-50/60"
            }
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={
                      s.visible
                        ? "text-sm font-medium text-ink-900"
                        : "text-sm font-medium text-ink-500"
                    }
                  >
                    {s.label}
                  </span>
                  {s.canHide && (
                    <span
                      className={
                        s.visible
                          ? "text-[11px] px-1.5 py-0.5 rounded bg-sage-50 text-sage-700"
                          : "text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700"
                      }
                    >
                      {s.visible ? "● On the page" : "○ Hidden"}
                    </span>
                  )}
                  {!s.canMove && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-500">
                      Always first
                    </span>
                  )}
                  {s.editedCount > 0 && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-plum-50 text-plum-700">
                      Your words
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-ink-500 mt-1 leading-relaxed">
                  {s.blurb}
                  {s.conditional && (
                    <span className="text-ink-400"> {s.conditional}</span>
                  )}
                  {s.managedAt && (
                    <span className="text-ink-400"> {s.managedAt.note}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <IconBtn
                  label="Move up"
                  disabled={
                    !s.canMove || s.slug === firstMovable || busy === s.slug
                  }
                  onClick={() =>
                    run(
                      s.slug,
                      () => moveLandingSection(s.slug, "up"),
                      "Moved up"
                    )
                  }
                >
                  ↑
                </IconBtn>
                <IconBtn
                  label="Move down"
                  disabled={
                    !s.canMove || s.slug === lastMovable || busy === s.slug
                  }
                  onClick={() =>
                    run(
                      s.slug,
                      () => moveLandingSection(s.slug, "down"),
                      "Moved down"
                    )
                  }
                >
                  ↓
                </IconBtn>
                {s.canHide && (
                  <button
                    type="button"
                    disabled={busy === s.slug}
                    onClick={() =>
                      run(
                        s.slug,
                        () => toggleLandingSection(s.slug),
                        s.visible ? "Hidden from your page" : "Back on your page"
                      )
                    }
                    className="text-xs px-2 py-1 rounded-md text-ink-500 hover:bg-ink-100 disabled:opacity-50"
                  >
                    {s.visible ? "Hide" : "Show"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={Object.keys(s.placeholders).length === 0}
                  onClick={() => setEditing(s)}
                  className="text-xs px-2 py-1 rounded-md text-plum-700 hover:bg-plum-50 disabled:text-ink-300 disabled:hover:bg-transparent"
                  title={
                    Object.keys(s.placeholders).length === 0
                      ? "This section has no words of its own to edit"
                      : undefined
                  }
                >
                  Edit words
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => {
          if (
            !confirm(
              "Put every section back in its original order, all showing? Your words are kept — only the arrangement resets."
            )
          )
            return;
          run("__reset", resetLandingSections, "Back to the original order");
        }}
        className="text-[11px] text-ink-500 hover:text-ink-900 underline"
      >
        Reset the order
      </button>

      {editing && (
        <SectionDialog
          section={editing}
          overrides={overrides}
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

function SectionDialog({
  section,
  overrides,
  onClose,
  onSaved,
}: {
  section: SectionItem;
  overrides: LandingCopyOverrides | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [active, setActive] = useState<Lang>("en");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = fieldsForSection(section.slug);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveSectionCopy(new FormData(e.currentTarget));
      notify({ kind: "success", title: `${section.label} updated` });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that");
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={section.label} size="lg">
      <form onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="section" value={section.slug} />

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
            Editing the {active === "en" ? "English" : "Ukrainian"} page
          </span>
        </div>

        <p className="text-[12px] text-ink-500 italic leading-relaxed">
          The grey text is what visitors see right now. Leave a box empty to
          keep it — clearing a box is how you undo a change. Both languages
          save together.
        </p>

        {/* Both language panels stay mounted so switching tabs before saving
            can't drop the other language's text. */}
        {LANGS.map((l) => (
          <div
            key={l.id}
            style={{ display: active === l.id ? "block" : "none" }}
            className="space-y-3"
          >
            {fields.map((f) => {
              const name = landingOverrideInputName(l.id, f.key);
              const value = overrides?.[l.id]?.[f.key] ?? "";
              const placeholder =
                l.id === "en" ? (section.placeholders[f.key] ?? "") : "";
              return (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  {f.multiline ? (
                    <textarea
                      name={name}
                      rows={4}
                      defaultValue={value}
                      placeholder={placeholder}
                      className={inputCls}
                    />
                  ) : (
                    <input
                      name={name}
                      defaultValue={value}
                      placeholder={placeholder}
                      className={inputCls}
                    />
                  )}
                </Field>
              );
            })}
          </div>
        ))}

        {section.managedAt && (
          <p className="text-[11px] text-ink-400 italic">
            {section.managedAt.note}
          </p>
        )}

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
            {submitting ? "Saving…" : "Save these words"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
