"use client";

// "Find your compass" — the interactive quiz on /quiz. One question at a time,
// scores into a result (mirror + one door), then offers the workbook by email.
// Styled with the storefront (landing.css) palette; rendered inside
// <main className="landing-root">.
//
// Bilingual: the page resolves the visitor's language (cookie) and hands down
// `lang` (for the questions/results, via getQuizContent) and `copy` (the UI
// chrome, from the landing-copy `quiz` section). No visible string is authored
// here — they all come from those two sources so EN and УКР stay in step.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  getQuizContent,
  scoreQuiz,
  type QuizDoorKind,
  type QuizResult,
  type QuizResultKey,
} from "@/lib/quiz-content";
import type { LandingCopy, LandingLang } from "@/lib/landing-copy";
import { submitQuizLead } from "@/lib/quiz-actions";

type QuizCopy = LandingCopy["quiz"];

function doorHref(kind: QuizDoorKind, circleHref: string): string {
  if (kind === "circle") return circleHref;
  if (kind === "contact") return "/#contact";
  return "/";
}

const clay = "var(--land-clay, #b05c36)";
const clayDeep = "var(--land-clay-deep, #7c3f26)";
const inkSoft = "var(--land-ink-soft, #786b60)";
const serif = "var(--font-serif, Georgia, serif)";

export function Quiz({
  circleHref,
  lang,
  copy,
}: {
  circleHref: string;
  lang: LandingLang;
  copy: QuizCopy;
}) {
  const { questions, results } = useMemo(() => getQuizContent(lang), [lang]);
  const total = questions.length;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(total).fill(null)
  );
  const [result, setResult] = useState<QuizResultKey | null>(null);

  function choose(optionIndex: number) {
    const next = answers.slice();
    next[step] = optionIndex;
    setAnswers(next);
    if (step < total - 1) {
      setStep(step + 1);
    } else {
      setResult(scoreQuiz(next));
    }
  }

  function restart() {
    setAnswers(Array(total).fill(null));
    setStep(0);
    setResult(null);
  }

  if (result) {
    return (
      <ResultView
        result={results[result]}
        resultKey={result}
        circleHref={circleHref}
        copy={copy}
        onRestart={restart}
      />
    );
  }

  const q = questions[step];
  const pct = Math.round((step / total) * 100);

  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      {/* progress */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 12,
          letterSpacing: "0.06em",
          color: inkSoft,
          marginBottom: 10,
        }}
      >
        <span>
          {step + 1} / {total}
        </span>
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            style={{
              background: "none",
              border: "none",
              color: inkSoft,
              cursor: "pointer",
              fontSize: 12,
              letterSpacing: "0.04em",
            }}
          >
            {copy.back}
          </button>
        )}
      </div>
      <div
        style={{
          height: 3,
          borderRadius: 3,
          background: "rgba(176,92,54,0.15)",
          marginBottom: 30,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: clay,
            transition: "width 0.3s ease",
          }}
        />
      </div>

      <h2
        style={{
          fontFamily: serif,
          fontSize: 26,
          lineHeight: 1.3,
          color: clayDeep,
          fontWeight: 500,
          margin: "0 0 26px 0",
        }}
      >
        {q.prompt}
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {q.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => choose(i)}
            style={{
              textAlign: "left",
              padding: "16px 18px",
              borderRadius: 12,
              border:
                answers[step] === i
                  ? `1.5px solid ${clay}`
                  : "1px solid rgba(176,92,54,0.22)",
              background:
                answers[step] === i
                  ? "rgba(176,92,54,0.07)"
                  : "rgba(255,251,245,0.6)",
              color: "var(--land-ink, #3d342e)",
              fontSize: 16,
              lineHeight: 1.45,
              cursor: "pointer",
              transition: "border-color 0.15s ease, background 0.15s ease",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultView({
  result,
  resultKey,
  circleHref,
  copy,
  onRestart,
}: {
  result: QuizResult;
  resultKey: QuizResultKey;
  circleHref: string;
  copy: QuizCopy;
  onRestart: () => void;
}) {
  const r = result;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
      <span
        className="tag"
        style={{ display: "block", marginBottom: 10 }}
      >
        {r.kicker}
      </span>
      <h2
        style={{
          fontFamily: serif,
          fontSize: 30,
          lineHeight: 1.25,
          color: clayDeep,
          fontWeight: 500,
          margin: "0 0 22px 0",
        }}
      >
        {r.title}
      </h2>
      {r.mirror.map((para, i) => (
        <p
          key={i}
          style={{
            fontSize: 16.5,
            lineHeight: 1.65,
            color: "var(--land-ink, #3d342e)",
            margin: "0 auto 16px auto",
            maxWidth: 520,
          }}
        >
          {para}
        </p>
      ))}

      {/* Safety branch — real support, no sales. */}
      {resultKey === "safety" && (
        <div
          style={{
            margin: "26px auto 0",
            maxWidth: 500,
            padding: 22,
            borderRadius: 12,
            background: "rgba(255,251,245,0.7)",
            border: "1px solid rgba(176,92,54,0.2)",
            fontSize: 14.5,
            lineHeight: 1.7,
            color: "var(--land-ink, #3d342e)",
          }}
        >
          {copy.safetyNote}
        </div>
      )}

      {/* The one door. */}
      {r.door && (
        <div
          className="form-shell"
          style={{ margin: "34px auto 0", maxWidth: 460, padding: 26 }}
        >
          <p
            style={{
              fontSize: 14.5,
              lineHeight: 1.6,
              color: inkSoft,
              margin: "0 0 16px 0",
            }}
          >
            {r.door.note}
          </p>
          <Link
            href={doorHref(r.door.kind, circleHref)}
            className="cta"
            style={{ display: "inline-block" }}
          >
            {r.door.label} →
          </Link>
        </div>
      )}

      {/* Workbook opt-in (result is already shown for free). */}
      {r.showWorkbook && (
        <WorkbookForm resultKey={resultKey} copy={copy.workbook} />
      )}

      <button
        type="button"
        onClick={onRestart}
        style={{
          marginTop: 30,
          background: "none",
          border: "none",
          color: inkSoft,
          cursor: "pointer",
          fontSize: 13,
          textDecoration: "underline",
        }}
      >
        {copy.takeAgain}
      </button>
    </div>
  );
}

function WorkbookForm({
  resultKey,
  copy,
}: {
  resultKey: QuizResultKey;
  copy: QuizCopy["workbook"];
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await submitQuizLead({ resultKey, name, email, _hp: hp });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
    } catch {
      setError(copy.errorGeneric);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    // The confirmation line embeds the visitor's own email; split on the
    // placeholder so the translation can put it anywhere and still emphasize it.
    const [donePre, donePost] = copy.doneBody.split("{email}");
    return (
      <div
        style={{
          margin: "30px auto 0",
          maxWidth: 460,
          padding: 24,
          borderRadius: 12,
          background: "var(--color-honey-50, #fbf3e4)",
          border: "1px solid rgba(176,92,54,0.25)",
        }}
      >
        <p
          style={{
            fontFamily: serif,
            fontStyle: "italic",
            fontSize: 20,
            color: clayDeep,
            margin: "0 0 8px 0",
          }}
        >
          {copy.doneTitle}
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          {donePre}
          <strong>{email}</strong>
          {donePost}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="form-shell"
      style={{ margin: "30px auto 0", maxWidth: 460, padding: 26, textAlign: "left" }}
    >
      <p
        style={{
          fontFamily: serif,
          fontSize: 17,
          lineHeight: 1.5,
          color: clayDeep,
          margin: "0 0 4px 0",
          textAlign: "center",
        }}
      >
        {copy.heading}
      </p>
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: inkSoft,
          margin: "0 0 18px 0",
          textAlign: "center",
        }}
      >
        {copy.sub}
      </p>
      {/* honeypot */}
      <input
        type="text"
        value={hp}
        onChange={(e) => setHp(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }}
      />
      <label style={labelStyle}>{copy.nameLabel}</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        disabled={saving}
        style={inputStyle}
      />
      <label style={labelStyle}>{copy.emailLabel}</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        disabled={saving}
        style={inputStyle}
      />
      {error && (
        <p style={{ color: "#a3402a", fontSize: 13, margin: "10px 0 0 0" }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="cta"
        style={{
          display: "block",
          width: "100%",
          marginTop: 18,
          textAlign: "center",
          border: "none",
          cursor: saving ? "default" : "pointer",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? copy.sending : copy.submit}
      </button>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono, monospace)",
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: inkSoft,
  margin: "12px 0 6px 0",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  borderRadius: 8,
  border: "1px solid rgba(176,92,54,0.25)",
  background: "rgba(255,255,255,0.7)",
  fontSize: 15,
  color: "var(--land-ink, #3d342e)",
};
