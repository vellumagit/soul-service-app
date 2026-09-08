"use client";

import { useState, useTransition } from "react";
import {
  addTheme,
  deleteTheme,
  updateTheme,
  addObservation,
  deleteObservation,
  updateObservation,
} from "@/lib/actions";
import type { Theme, Observation, Session } from "@/db/schema";
import { ConfirmButton } from "./ConfirmButton";
import { shortDate } from "@/lib/format";
import { useTimeZone } from "./TimeZoneProvider";

// A theme chip's label: click to rename in place. Enter saves, Escape or an
// unchanged blur cancels.
function ThemeLabel({ theme, clientId }: { theme: Theme; clientId: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(theme.label);
  const [pending, start] = useTransition();
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(theme.label);
          setEditing(true);
        }}
        className="hover:underline decoration-dotted"
        title="Click to rename"
      >
        {theme.label}
      </button>
    );
  }
  const save = () => {
    const next = value.trim();
    if (!next || next === theme.label) {
      setEditing(false);
      return;
    }
    start(async () => {
      const r = await updateTheme(theme.id, clientId, next);
      if (r.ok) setEditing(false);
    });
  };
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        } else if (e.key === "Escape") {
          setEditing(false);
        }
      }}
      disabled={pending}
      className="bg-white border border-ink-200 rounded px-1 text-xs w-32"
    />
  );
}

// An observation's text: hover "edit" swaps in a textarea.
function ObservationBody({
  observation,
  clientId,
}: {
  observation: Observation;
  clientId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!editing) {
    return (
      <>
        <span className="flex-1 leading-relaxed">{observation.body}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[10px] text-ink-400 hover:text-ink-900 opacity-0 group-hover:opacity-100"
        >
          edit
        </button>
      </>
    );
  }
  return (
    <form
      className="flex-1 space-y-1.5"
      action={(fd) => {
        setError(null);
        start(async () => {
          const r = await updateObservation(observation.id, clientId, String(fd.get("body") ?? ""));
          if (!r.ok) {
            setError(r.error);
            return;
          }
          setEditing(false);
        });
      }}
    >
      <textarea
        name="body"
        defaultValue={observation.body}
        rows={3}
        autoFocus
        className="w-full bg-white border border-ink-200 rounded-md px-2 py-1.5 text-sm"
      />
      {error && <div className="text-[11px] text-red-700">{error}</div>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="px-2.5 py-1 text-[11px] font-medium bg-ink-900 hover:bg-ink-800 text-white rounded-md disabled:opacity-60"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-[11px] text-ink-500 hover:text-ink-900"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function PatternsTab({
  clientId,
  themes,
  observations,
  sessions,
}: {
  clientId: string;
  themes: Theme[];
  observations: Observation[];
  sessions: Session[];
}) {
  const tz = useTimeZone();
  const completed = sessions.filter((s) => s.status === "completed");

  // Modality breakdown — count + average something useful
  const modalityStats = new Map<string, number>();
  for (const s of completed) {
    modalityStats.set(s.type, (modalityStats.get(s.type) ?? 0) + 1);
  }
  const modalitySorted = Array.from(modalityStats.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <Card title="Recurring themes">
        <ThemesBlock clientId={clientId} themes={themes} />
      </Card>

      <Card title="What I keep noticing">
        <ObservationsBlock
          clientId={clientId}
          observations={observations}
        />
      </Card>

      <Card title="Session arc · last 8" className="md:col-span-2">
        {completed.length === 0 ? (
          <div className="text-xs text-ink-400 italic">
            Once you have completed sessions, the arrival/departure phrases
            will appear here, oldest → newest. Useful for spotting drift.
          </div>
        ) : (
          <ol className="space-y-2">
            {completed.slice(0, 8).map((s) => (
              <li
                key={s.id}
                className="grid grid-cols-[80px_1fr] gap-3 text-sm border-l-2 border-ink-100 pl-3 py-1"
              >
                <span className="font-mono text-xs text-ink-500">
                  {shortDate(s.scheduledAt, tz)}
                </span>
                <div>
                  <div className="text-ink-700">
                    {s.type}
                    {s.intention && (
                      <span className="text-ink-500 italic">
                        {" — "}&ldquo;{s.intention}&rdquo;
                      </span>
                    )}
                  </div>
                  {(s.arrivedAs || s.leftAs) && (
                    <div className="text-xs text-ink-600 mt-0.5">
                      {s.arrivedAs && (
                        <span className="text-ink-500">{s.arrivedAs}</span>
                      )}
                      {s.arrivedAs && s.leftAs && (
                        <span className="text-plum-600 mx-1.5">→</span>
                      )}
                      {s.leftAs && (
                        <span className="text-green-700">{s.leftAs}</span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card title="Modality balance" className="md:col-span-2">
        {modalitySorted.length === 0 ? (
          <div className="text-xs text-ink-400 italic">
            What you do most appears here once you have completed sessions.
          </div>
        ) : (
          <div className="space-y-2">
            {modalitySorted.map(([type, count]) => {
              const pct = Math.round((count / completed.length) * 100);
              return (
                <div key={type}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-700">{type}</span>
                    <span className="font-mono text-xs text-ink-500">
                      {count} {count === 1 ? "session" : "sessions"} · {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden mt-1">
                    <div
                      className="h-full bg-plum-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Card({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border border-ink-200 rounded-md bg-white p-5 ${className}`}
    >
      <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function ThemesBlock({
  clientId,
  themes,
}: {
  clientId: string;
  themes: Theme[];
}) {
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap gap-2 items-center">
        {themes.length === 0 && !adding && (
        <span className="text-xs text-ink-400 italic">
          Add tags as patterns surface — anything that keeps coming up.
        </span>
      )}

      {themes.map((t) => (
        <span
          key={t.id}
          className="chip bg-ink-100 text-ink-700 group flex items-center gap-1"
        >
          <ThemeLabel theme={t} clientId={clientId} />
          <button
            onClick={() => start(() => deleteTheme(t.id, clientId))}
            disabled={pending}
            className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-red-700"
            title="Remove"
            type="button"
          >
            ×
          </button>
        </span>
      ))}

      {adding ? (
        <form
          action={async (fd) => {
            setSubmitting(true);
            try {
              await addTheme(fd);
              setAdding(false);
            } finally {
              setSubmitting(false);
            }
          }}
          className="flex items-center gap-1"
        >
          <input type="hidden" name="clientId" value={clientId} />
          <input
            name="label"
            autoFocus
            required
            disabled={submitting}
            placeholder="theme"
            onKeyDown={(e) => {
              if (e.key === "Escape") setAdding(false);
            }}
            className="px-2 py-0.5 border border-ink-300 rounded text-xs outline-none focus:border-plum-600 w-32"
          />
          <button
            type="submit"
            disabled={submitting} aria-busy={submitting}
            className="text-[10px] text-plum-700 font-medium"
          >
            {submitting ? "…" : "add"}
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="text-[10px] text-ink-400"
          >
            cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-plum-700 hover:underline"
        >
          + add
        </button>
      )}
    </div>
  );
}

function ObservationsBlock({
  clientId,
  observations,
}: {
  clientId: string;
  observations: Observation[];
}) {
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div>
      {observations.length === 0 && !adding && (
        <div className="text-xs text-ink-400 italic">
          Hunches, hypotheses, things you keep receiving for them — drop
          observations here as they surface.
        </div>
      )}

      <ul className="space-y-2 list-disc pl-4 text-sm text-ink-700">
        {observations.map((o) => (
          <li key={o.id} className="group flex items-start gap-2">
            <ObservationBody observation={o} clientId={clientId} />
            <ConfirmButton
              label={
                <span className="text-[10px] text-ink-400 hover:text-red-700 opacity-0 group-hover:opacity-100">
                  remove
                </span>
              }
              message="Remove this observation?"
              confirmLabel="Yes, remove"
              onConfirm={() => deleteObservation(o.id, clientId)}
            />
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          action={async (fd) => {
            setSubmitting(true);
            try {
              await addObservation(fd);
              setAdding(false);
            } finally {
              setSubmitting(false);
            }
          }}
          className="border border-ink-200 rounded p-3 mt-3 bg-white space-y-2"
        >
          <input type="hidden" name="clientId" value={clientId} />
          <textarea
            name="body"
            autoFocus
            required
            rows={2}
            placeholder="Something you keep noticing across sessions"
            className="w-full px-2 py-1 border border-ink-200 rounded text-sm outline-none focus:border-plum-600"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-xs text-ink-500"
            >
              cancel
            </button>
            <button
              type="submit"
              disabled={submitting} aria-busy={submitting}
              className="text-xs bg-ink-900 text-white px-2 py-1 rounded font-medium disabled:opacity-60"
            >
              {submitting ? "…" : "add"}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 text-xs text-plum-700 hover:underline font-medium"
        >
          + add observation
        </button>
      )}

      {/* silence unused 'pending' for build */}
      <span className="hidden" aria-hidden>
        {pending ? "" : ""}
      </span>
    </div>
  );
}
