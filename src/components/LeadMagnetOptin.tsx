"use client";

// Public opt-in form for a lead magnet (/free/<slug>). Collects name + email,
// calls submitLeadMagnetOptin, and on success reveals the asset immediately
// (a "soft gate" — they get it right away AND it's emailed). Bilingual: the
// visitor-facing chrome follows `lang`; magnet-specific strings arrive as props.

import { useState } from "react";

const clay = "var(--land-clay, #b05c36)";
const clayDeep = "var(--land-clay-deep, #7c3f26)";
const inkSoft = "var(--land-ink-soft, #786b60)";
const serif = "var(--font-serif, Georgia, serif)";

import { submitLeadMagnetOptin } from "@/lib/lead-magnet-actions";

export function LeadMagnetOptin({
  slug,
  lang,
  submitLabel,
  ctaLabel,
  ctaHref,
}: {
  slug: string;
  lang: "en" | "uk";
  submitLabel: string;
  ctaLabel?: string | null;
  ctaHref?: string | null;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ url: string; label: string } | null>(null);

  const t =
    lang === "uk"
      ? {
          nameLabel: "Ваше ім'я",
          emailLabel: "Електронна пошта",
          sending: "Надсилаю…",
          errGeneric: "Щось пішло не так. Спробуйте ще раз.",
          doneTitle: "Готово — воно ваше.",
          donePre: "Ми також надіслали копію на ",
          donePost: ".",
          or: "Відкрити зараз:",
        }
      : {
          nameLabel: "Your name",
          emailLabel: "Email",
          sending: "Sending…",
          errGeneric: "Something went off — please try again.",
          doneTitle: "Done — it's yours.",
          donePre: "We've also sent a copy to ",
          donePost: ".",
          or: "Open it now:",
        };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await submitLeadMagnetOptin({
        slug,
        name,
        email,
        lang,
        _hp: hp,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone({ url: res.assetUrl, label: res.assetLabel });
    } catch {
      setError(t.errGeneric);
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
          padding: 26,
          borderRadius: 12,
          background: "var(--color-honey-50, #fbf3e4)",
          border: "1px solid rgba(176,92,54,0.25)",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: serif,
            fontStyle: "italic",
            fontSize: 21,
            color: clayDeep,
            margin: "0 0 10px 0",
          }}
        >
          {t.doneTitle}
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 20px 0" }}>
          {t.donePre}
          <strong>{email}</strong>
          {t.donePost}
        </p>
        <a
          href={done.url}
          target="_blank"
          rel="noopener noreferrer"
          className="cta"
          style={{
            display: "inline-block",
            textAlign: "center",
            border: "none",
            textDecoration: "none",
          }}
        >
          {done.label}
        </a>
        {ctaLabel && ctaHref && (
          <div style={{ marginTop: 22 }}>
            <a
              href={ctaHref}
              style={{
                color: clay,
                textDecoration: "underline",
                fontSize: 14,
              }}
            >
              {ctaLabel}
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="form-shell"
      style={{
        margin: "30px auto 0",
        maxWidth: 460,
        padding: 26,
        textAlign: "left",
      }}
    >
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
      <label style={labelStyle}>{t.nameLabel}</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        disabled={saving}
        style={inputStyle}
      />
      <label style={labelStyle}>{t.emailLabel}</label>
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
        {saving ? t.sending : submitLabel}
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
