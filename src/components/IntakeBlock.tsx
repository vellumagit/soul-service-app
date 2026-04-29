"use client";

import { useState, useTransition } from "react";
import {
  upsertIntakeAnswer,
  deleteIntakeAnswer,
} from "@/lib/actions";
import type { IntakeAnswer } from "@/db/schema";

const SUGGESTED_QUESTIONS = [
  "What brings you to me?",
  "Where in your life is love feeling blocked?",
  "Who do you most need to forgive?",
  "Earliest memory of feeling truly loved",
  "What would more love in your life look like?",
  "Open to channeled messages from guides?",
  "Open to ancestral work?",
  "Anything I should know about your nervous system?",
  "How did you find me?",
];

export function IntakeBlock({
  soulId,
  answers,
}: {
  soulId: string;
  answers: IntakeAnswer[];
}) {
  const [adding, setAdding] = useState(false);

  const usedQuestions = new Set(answers.map((a) => a.question));
  const suggestions = SUGGESTED_QUESTIONS.filter(
    (q) => !usedQuestions.has(q)
  );

  return (
    <div className="space-y-3">
      <dl className="text-sm grid grid-cols-[280px_1fr] gap-y-3 gap-x-4">
        {answers.length === 0 && !adding && (
          <div className="col-span-2 text-ink-400 italic text-xs">
            No intake answers yet. Add a Q+A as you learn about her.
          </div>
        )}
        {answers.map((a) => (
          <AnswerRow key={a.id} answer={a} />
        ))}
      </dl>

      {adding ? (
        <AddAnswerForm
          soulId={soulId}
          suggestions={suggestions}
          onDone={() => setAdding(false)}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-flame-700 hover:underline"
        >
          + add intake question
        </button>
      )}
    </div>
  );
}

function AnswerRow({ answer }: { answer: IntakeAnswer }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(answer.answer ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="contents group">
      <dt className="text-ink-500 text-xs">{answer.question}</dt>
      <dd className="text-ink-800 flex items-start gap-2">
        {editing ? (
          <form
            action={async (fd) => {
              setSubmitting(true);
              try {
                await upsertIntakeAnswer(fd);
                setEditing(false);
              } finally {
                setSubmitting(false);
              }
            }}
            className="flex-1 flex gap-2"
          >
            <input type="hidden" name="soulId" value={answer.soulId} />
            <input type="hidden" name="id" value={answer.id} />
            <input type="hidden" name="question" value={answer.question} />
            <textarea
              name="answer"
              autoFocus
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 px-2 py-1 border border-ink-200 rounded text-sm outline-none focus:border-flame-600"
            />
            <div className="flex flex-col gap-1">
              <button
                type="submit"
                disabled={submitting}
                className="text-[10px] text-flame-700 font-medium"
              >
                save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-[10px] text-ink-400"
              >
                cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <button
              onClick={() => {
                setDraft(answer.answer ?? "");
                setEditing(true);
              }}
              className={`flex-1 text-left hover:bg-ink-50 rounded px-1 -mx-1 ${
                !answer.answer ? "text-ink-400 italic" : ""
              }`}
            >
              {answer.answer || "(no answer yet — click to add)"}
            </button>
            <button
              onClick={() => start(() => deleteIntakeAnswer(answer.id))}
              disabled={pending}
              className="text-[10px] text-ink-400 hover:text-red-700 opacity-0 group-hover:opacity-100"
            >
              remove
            </button>
          </>
        )}
      </dd>
    </div>
  );
}

function AddAnswerForm({
  soulId,
  suggestions,
  onDone,
}: {
  soulId: string;
  suggestions: string[];
  onDone: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [question, setQuestion] = useState(suggestions[0] ?? "");
  const [custom, setCustom] = useState(false);

  return (
    <form
      action={async (fd) => {
        setSubmitting(true);
        try {
          await upsertIntakeAnswer(fd);
          onDone();
        } finally {
          setSubmitting(false);
        }
      }}
      className="border border-ink-200 rounded p-3 space-y-2 bg-white"
    >
      <input type="hidden" name="soulId" value={soulId} />
      <div>
        <label className="text-[10px] text-ink-500 block mb-1">Question</label>
        {custom ? (
          <input
            name="question"
            required
            autoFocus
            placeholder="Custom intake question"
            className="w-full px-2 py-1 border border-ink-200 rounded text-sm outline-none focus:border-flame-600"
          />
        ) : (
          <>
            <select
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full px-2 py-1 border border-ink-200 rounded text-sm outline-none focus:border-flame-600"
            >
              {suggestions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input type="hidden" name="question" value={question} />
            <button
              type="button"
              onClick={() => setCustom(true)}
              className="text-[10px] text-flame-700 mt-1"
            >
              or write a custom question
            </button>
          </>
        )}
      </div>
      <div>
        <label className="text-[10px] text-ink-500 block mb-1">Answer</label>
        <textarea
          name="answer"
          rows={3}
          placeholder="Her answer in her own words"
          className="w-full px-2 py-1 border border-ink-200 rounded text-sm outline-none focus:border-flame-600"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-ink-500"
        >
          cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="text-xs bg-ink-900 text-white px-2 py-1 rounded font-medium disabled:opacity-60"
        >
          {submitting ? "…" : "add"}
        </button>
      </div>
    </form>
  );
}
