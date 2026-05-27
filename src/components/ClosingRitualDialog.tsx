"use client";

// The Closing Ritual.
//
// Right after she marks a session complete, this dialog opens and offers
// three quiet prompts she can answer (or skip). Designed to feel like
// settling, not paperwork:
//
//   "What landed?"
//   "What do you want to remember?"
//   "Anything she said you'd never want to forget?"
//
// All three are optional — she can save with one filled, all three, or none.
// "Save" and "Skip for now" are equally first-class. Either way we stamp
// closingCompletedAt so the next time she sees the card we don't nag her
// again. She can always re-open the ritual via "Reflect on this session"
// on the completed card.
//
// Autosaves locally via useDraft so closing the modal mid-thought never
// loses what she was writing.

import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { saveSessionClosing } from "@/lib/actions";
import { useDraft } from "@/lib/useDraft";
import {
  DraftRestoreBanner,
  SaveStatusChip,
} from "./DraftRestoreBanner";
import { notify } from "./FlashNotifier";
import { describeSaveError } from "@/lib/save-error";

type ClosingState = {
  landed: string;
  remember: string;
  neverForget: string;
  /** Optional named milestone — separate from the three reflections. If she
   *  pins a name here, the session becomes an anchor on the journey timeline. */
  milestoneLabel: string;
};

const EMPTY: ClosingState = {
  landed: "",
  remember: "",
  neverForget: "",
  milestoneLabel: "",
};

export function ClosingRitualDialog({
  open,
  onClose,
  sessionId,
  clientName,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  /** First name (or full name) to soften the prompts. */
  clientName: string;
  /** Existing closing reflections — passed in when reopening for an
   *  already-closed session. Empty for the first-time post-completion case. */
  initial?: ClosingState;
}) {
  const [state, setState] = useState<ClosingState>(initial ?? EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Autosave the whole closing as one JSON blob. Inert when closed.
  const draft = useDraft<ClosingState>(
    open ? `session:${sessionId}:closing` : null,
    initial ?? EMPTY
  );
  const stored = open ? draft.readStoredValue() : null;
  // Only offer restore if the stored draft differs from initial AND from
  // current state — i.e. there's truly something else to bring back.
  const draftDiffers =
    !!stored &&
    (stored.landed !== state.landed ||
      stored.remember !== state.remember ||
      stored.neverForget !== state.neverForget ||
      stored.milestoneLabel !== state.milestoneLabel) &&
    (stored.landed.trim() !== "" ||
      stored.remember.trim() !== "" ||
      stored.neverForget.trim() !== "" ||
      stored.milestoneLabel.trim() !== "");

  // Re-seed state on open if `initial` changes (parent passed new data).
  const lastInitial = useRef<ClosingState>(initial ?? EMPTY);
  useEffect(() => {
    if (!open) return;
    const next = initial ?? EMPTY;
    const lastJson = JSON.stringify(lastInitial.current);
    const nextJson = JSON.stringify(next);
    if (lastJson !== nextJson) {
      lastInitial.current = next;
      setState(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    initial?.landed,
    initial?.remember,
    initial?.neverForget,
    initial?.milestoneLabel,
  ]);

  function update(next: ClosingState) {
    setState(next);
    draft.saveDraft(next);
  }

  function restoreDraft() {
    if (stored) update(stored);
    draft.discardStored();
  }

  async function submit(mode: "save" | "skip") {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const toSave = mode === "skip" ? EMPTY : state;
      const result = await saveSessionClosing(
        sessionId,
        toSave.landed,
        toSave.remember,
        toSave.neverForget,
        // Only pass milestone when she's in "save" mode — skipping shouldn't
        // touch any existing milestone label.
        mode === "save" ? toSave.milestoneLabel : undefined
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      draft.clearDraft();
      onClose();
      if (mode === "save") {
        notify({
          kind: "success",
          title: "Closing saved",
          body: "These will sit alongside your notes for this session.",
          ttlMs: 3500,
        });
      }
    } catch (err) {
      const info = describeSaveError(err);
      setError(info.message);
      if (info.offline) {
        notify({
          kind: "warning",
          title: "You're offline",
          body: "Your reflection is saved locally — try again once you're back online.",
          ttlMs: 10000,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const firstName = clientName.split(" ")[0] ?? clientName;

  return (
    <Modal
      open={open}
      onClose={onClose}
      locked={submitting}
      title="The Closing"
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={() => submit("skip")}
            disabled={submitting}
            className="px-3 py-2 text-sm text-ink-600 hover:text-ink-900"
          >
            Skip for now
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => submit("save")}
            disabled={submitting}
            className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Soft opening line — sets the tone. Serif italic feels like
            settling into something. */}
        <p
          className="serif-italic text-base text-ink-700 leading-relaxed"
          style={{ fontWeight: 400 }}
        >
          Sit with {firstName} for a moment before moving on.
        </p>

        {draftDiffers && (
          <DraftRestoreBanner
            ageMs={draft.storedAgeMs}
            onRestore={restoreDraft}
            onDiscard={() => draft.discardStored()}
          />
        )}

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
            {error}
          </div>
        )}

        <ClosingField
          label="What landed?"
          hint="The thing you'd describe to a colleague if you had one sentence."
          value={state.landed}
          onChange={(v) => update({ ...state, landed: v })}
          disabled={submitting}
        />
        <ClosingField
          label="What do you want to remember?"
          hint="A texture, a turn, a moment in the session you'd want back to."
          value={state.remember}
          onChange={(v) => update({ ...state, remember: v })}
          disabled={submitting}
        />
        <ClosingField
          label={`Anything ${firstName} said you'd never want to forget?`}
          hint="Their words, as close to them as you can — keep the cadence."
          value={state.neverForget}
          onChange={(v) => update({ ...state, neverForget: v })}
          disabled={submitting}
        />

        {/* Optional milestone — gets its own quiet block above the footer,
            because pinning a milestone is a different kind of act than the
            three reflections. Bordered + honey-tinted so it's recognizable. */}
        <div
          className="rounded-md p-3"
          style={{
            background: "var(--color-honey-50)",
            border: "1px solid var(--color-honey-100)",
          }}
        >
          <label className="block">
            <span
              className="serif-italic text-sm text-honey-700"
              style={{ fontWeight: 500 }}
            >
              Mark this session as a milestone? (optional)
            </span>
            <span className="block text-[11px] text-ink-500 mt-0.5 leading-snug">
              A short name for what just happened. Becomes a labelled anchor on
              the timeline. E.g. &ldquo;first breakthrough&rdquo;, &ldquo;she
              said it out loud&rdquo;, &ldquo;moved out&rdquo;.
            </span>
            <input
              type="text"
              value={state.milestoneLabel}
              onChange={(e) =>
                update({ ...state, milestoneLabel: e.target.value })
              }
              disabled={submitting}
              maxLength={80}
              placeholder="leave empty to skip"
              className="mt-2 w-full px-3 py-1.5 text-sm border border-honey-100 rounded bg-white outline-none focus:border-honey-300 focus:ring-1 focus:ring-honey-100"
            />
          </label>
        </div>

        <div className="flex items-center justify-between pt-1">
          <SaveStatusChip status={draft.status} />
          <span className="text-[10px] text-ink-400 italic">
            All fields optional. None of this is shared with {firstName}.
          </span>
        </div>
      </div>
    </Modal>
  );
}

function ClosingField({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block">
        <span
          className="serif-italic text-sm text-plum-700"
          style={{ fontWeight: 400 }}
        >
          {label}
        </span>
        <span className="block text-[11px] text-ink-500 mt-0.5 leading-snug">
          {hint}
        </span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={2}
          className="mt-1.5 w-full px-3 py-2 text-sm leading-relaxed border border-ink-200 rounded-md bg-white outline-none focus:border-plum-500 focus:ring-1 focus:ring-plum-100 resize-y"
        />
      </label>
    </div>
  );
}
