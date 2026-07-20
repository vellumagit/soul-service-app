"use client";

// "Find your compass" — the interactive quiz on /quiz. One question at a time,
// scores into a result (mirror + one door), then offers the workbook by email.
// Styled with the storefront (landing.css) palette; rendered inside
// <main className="landing-root">.

import { useState } from "react";
import Link from "next/link";
import {
  QUIZ_QUESTIONS,
  QUIZ_RESULTS,
  scoreQuiz,
  type QuizDoorKind,
  type QuizResultKey,
} from "@/lib/quiz-content";
import { submitQuizLead } from "@/lib/quiz-actions";

function doorHref(kind: QuizDoorKind, circleHref: string): string {
  if (kind === "circle") return circleHref;
  if (kind === "contact") return "/#contact";
  return "/";
}

const clay = "var(--land-clay, #b05c36)";
const clayDeep = "var(--land-clay-deep, #7c3f26)";
const inkSoft = "var(--land-ink-soft, #786b60)";
const serif = "var(--font-serif, Georgia, serif)";

export function Quiz({ circleHref }: { circleHref: string }) {
  const total = QUIZ_QUESTIONS.length;
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
        resultKey={result}
        circleHref={circleHref}
        onRestart={restart}
      />
    );
  }

  const q = QUIZ_QUESTIONS[step];
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
            ← back
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
  resultKey,
  circleHref,
  onRestart,
}: {
  resultKey: QuizResultKey;
  circleHref: string;
  onRestart: () => void;
}) {
  const r = QUIZ_RESULTS[resultKey];

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
          In Canada, you can call or text{" "}
          <strong>988</strong> any time — the Suicide Crisis Helpline. If
          you&apos;re in immediate danger, call <strong>911</strong>.
          You&apos;re not a burden, and you don&apos;t have to hold this alone.
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
      {r.showWorkbook && <WorkbookForm resultKey={resultKey} />}

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
        Take it again
      </button>
    </div>
  );
}

function WorkbookForm({ resultKey }: { resultKey: QuizResultKey }) {
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
      setError("Something went off. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
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
          On its way. 🤍
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          I&apos;ll send your reflection and a gentle workbook to <strong>{email}</strong>.
          Check your inbox soon.
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
        Want to sit with this a little longer?
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
        I&apos;ll send your reflection plus a gentle workbook to go deeper — no
        pressure, no spam.
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
      <label style={labelStyle}>Your name</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        disabled={saving}
        style={inputStyle}
      />
      <label style={labelStyle}>Email</label>
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
        {saving ? "Sending…" : "Send me the workbook →"}
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
