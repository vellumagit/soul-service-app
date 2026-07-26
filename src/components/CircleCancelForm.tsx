"use client";

// The one button on /circles/cancel/[token]. Calls requestCircleRefund with the
// signed token (the server re-verifies it), then shows the outcome. For a paid
// seat this files a refund request the practitioner approves in one tap; for an
// unpaid spot it just releases the seat.

import { useState } from "react";
import Link from "next/link";
import { requestCircleRefund } from "@/lib/group-actions";

export function CircleCancelForm({
  token,
  paid,
  lang = "en",
}: {
  token: string;
  paid: boolean;
  lang?: "en" | "uk";
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<
    null | "requested" | "cancelled" | "already"
  >(null);

  const t =
    lang === "uk"
      ? {
          saving: "Хвилинку…",
          cancelPaid: "Так — скасувати місце й запросити повернення",
          cancelFree: "Так — скасувати моє місце",
          keep: "Передумали — залишити місце",
          back: "Повернутися на сайт",
          errGeneric: "Щось пішло не так. Напишіть мені на пошту, будь ласка.",
          requested:
            "Ваш запит прийнято. Світлана незабаром підтвердить повернення — щойно все буде готово, вам прийде лист.",
          cancelled: "Ваше місце звільнено. Дякую, що попередили.",
          already: "Усе гаразд — про це вже подбали.",
        }
      : {
          saving: "One moment…",
          cancelPaid: "Yes — cancel my seat & request a refund",
          cancelFree: "Yes — cancel my spot",
          keep: "Never mind — keep my seat",
          back: "Back to the site",
          errGeneric: "Something went off. Please email me instead.",
          requested:
            "Your request is in. Svitlana will confirm your refund shortly — you'll get an email the moment it's done.",
          cancelled: "Your spot has been released. Thank you for letting me know.",
          already: "You're all set — this was already taken care of.",
        };

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await requestCircleRefund(token);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(res.state);
    } catch {
      setError(t.errGeneric);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    const msg =
      done === "requested"
        ? t.requested
        : done === "cancelled"
          ? t.cancelled
          : t.already;
    return (
      <div
        className="rounded-md"
        style={{
          maxWidth: 460,
          margin: "0 auto",
          padding: 26,
          textAlign: "center",
          background: "var(--color-honey-50, #fbf3e4)",
          border: "1px solid rgba(176,92,54,0.25)",
        }}
      >
        <p
          className="serif-italic"
          style={{
            fontSize: 20,
            color: "var(--land-clay-deep)",
            marginBottom: 8,
          }}
        >
          🤍
        </p>
        <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0 }}>{msg}</p>
        <p style={{ marginTop: 18 }}>
          <Link
            href="/"
            style={{ fontSize: 13, color: "var(--land-clay)", textDecoration: "underline" }}
          >
            {t.back}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", maxWidth: 460, margin: "0 auto" }}>
      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="cta"
        style={{
          display: "inline-block",
          border: "none",
          cursor: saving ? "default" : "pointer",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? t.saving : paid ? t.cancelPaid : t.cancelFree}
      </button>
      {error && (
        <p style={{ color: "#a3402a", fontSize: 13, marginTop: 12 }}>{error}</p>
      )}
      <p style={{ marginTop: 16 }}>
        <Link
          href="/"
          style={{
            fontSize: 13,
            color: "var(--land-ink-soft, #786b60)",
            textDecoration: "underline",
          }}
        >
          {t.keep}
        </Link>
      </p>
    </div>
  );
}
