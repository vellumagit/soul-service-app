"use client";

// Merge a duplicate client into this one (or fold this one into another).
// Shows exactly what will be carried across before anything happens. Nothing
// is lost, nothing is emailed; the duplicate profile disappears afterwards.

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { getMergePreview, mergeClients, type MergePreview } from "@/lib/actions";
import { rethrowIfRedirect } from "@/lib/redirect-error";
import { notify } from "./FlashNotifier";

const LABELS: Record<string, string> = {
  sessions: "sessions",
  series: "recurring series",
  notesAndFiles: "files",
  tasks: "tasks",
  goals: "goals",
  communications: "logged communications",
  people: "people in their life",
  themes: "themes",
  observations: "observations",
  reflections: "portal reflections",
  requests: "requests",
  circleSeats: "Circle seats",
};

export function MergeClientDialog({
  client,
  candidates,
}: {
  client: { id: string; fullName: string };
  candidates: { id: string; fullName: string }[];
}) {
  const formId = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [otherId, setOtherId] = useState("");
  // "keep" = this profile absorbs the other; "fold" = this one is the duplicate.
  const [direction, setDirection] = useState<"keep" | "fold">("keep");
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [previewing, startPreview] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const others = candidates.filter((c) => c.id !== client.id);
  const otherName = others.find((c) => c.id === otherId)?.fullName ?? "the other profile";

  // The profile that disappears is the one being folded in.
  const goneId = direction === "keep" ? otherId : client.id;
  const keptId = direction === "keep" ? client.id : otherId;
  const goneName = direction === "keep" ? otherName : client.fullName;
  const keptName = direction === "keep" ? client.fullName : otherName;

  useEffect(() => {
    if (!open || !goneId) {
      setPreview(null);
      return;
    }
    startPreview(async () => setPreview(await getMergePreview(goneId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goneId]);

  const counts = preview?.ok ? preview.counts : null;
  const nonZero = counts ? Object.entries(counts).filter(([, n]) => n > 0) : [];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
        className="text-xs text-ink-500 hover:text-ink-900"
        title="Combine a duplicate profile with this one"
      >
        Merge duplicate…
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        locked={submitting}
        title="Merge duplicate clients"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-2 text-sm text-ink-700 hover:bg-ink-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              form={formId}
              disabled={submitting || !otherId || !preview?.ok}
              aria-busy={submitting}
              className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60"
            >
              {submitting ? "Merging…" : `Merge into ${keptName}`}
            </button>
          </>
        }
      >
        <form
          id={formId}
          noValidate
          action={async () => {
            setError(null);
            if (!otherId) {
              setError("Pick the duplicate profile.");
              return;
            }
            setSubmitting(true);
            try {
              const r = await mergeClients(keptId, goneId);
              if (!r.ok) {
                setError(r.error);
                return;
              }
              const total = Object.values(r.moved).reduce((a, b) => a + b, 0);
              notify({
                kind: "success",
                title: "Merged",
                body: `${goneName} folded into ${keptName} — ${total} ${total === 1 ? "record" : "records"} carried across.`,
                ttlMs: 5000,
              });
              setOpen(false);
              if (direction === "fold") router.push(`/clients/${keptId}`);
            } catch (err) {
              rethrowIfRedirect(err);
              setError(err instanceof Error ? err.message : "Couldn't merge.");
            } finally {
              setSubmitting(false);
            }
          }}
          className="space-y-4"
        >
          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
              {error}
            </div>
          )}

          <Field label="Which profile is the duplicate?" required>
            <select
              value={otherId}
              onChange={(e) => setOtherId(e.target.value)}
              className={inputCls}
            >
              <option value="">— choose —</option>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Which one stays?">
            <div className="inline-flex rounded-md border border-ink-200 overflow-hidden text-sm">
              {(
                [
                  { key: "keep", label: `Keep ${client.fullName}` },
                  { key: "fold", label: `Keep ${otherId ? otherName : "the other"}` },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setDirection(opt.key)}
                  className={`px-4 py-1.5 transition ${
                    direction === opt.key
                      ? "bg-ink-900 text-white"
                      : "bg-white text-ink-600 hover:bg-ink-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="border border-ink-200 rounded-md bg-ink-50/40 p-3 text-xs">
            {!otherId ? (
              <div className="text-ink-400 italic">Pick the duplicate to see what moves across.</div>
            ) : previewing && !preview ? (
              <div className="text-ink-500">Counting…</div>
            ) : preview && !preview.ok ? (
              <div className="text-red-700">{preview.error}</div>
            ) : (
              <>
                <div className="font-medium text-ink-800 mb-1">
                  From {goneName} → {keptName}
                </div>
                {nonZero.length === 0 ? (
                  <div className="text-ink-600">
                    Nothing on {goneName} yet — the empty profile is simply removed.
                  </div>
                ) : (
                  <ul className="text-ink-600 space-y-0.5">
                    {nonZero.map(([k, n]) => (
                      <li key={k}>
                        {n} {LABELS[k] ?? k}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-ink-400 mt-2 leading-relaxed">
                  {keptName} keeps its own details and fills in anything blank from {goneName}
                  (email, phone, notes are joined, never overwritten). No emails are sent.
                  {preview?.ok && preview.email ? ` Calendar invites already sent to ${preview.email} stay as they are.` : ""}
                </p>
              </>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}
