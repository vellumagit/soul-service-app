"use client";

import { useState, useEffect } from "react";
import { Modal } from "./Modal";
import { Field, inputCls } from "./Form";
import { logCommunication, sendClientEmail } from "@/lib/actions";
import type { Client, EmailTemplate, Session } from "@/db/schema";

// Simple variable substitution. Supports:
//   {{firstName}}, {{fullName}}, {{email}}, {{nextSessionWhen}}, {{nextSessionDuration}},
//   {{lastSessionDate}}, {{amount}}, {{paymentInstructions}}, {{meetUrl}}
function render(
  template: string,
  ctx: {
    client: Pick<Client, "fullName" | "email">;
    nextSession?: Session | null;
    lastSession?: Session | null;
    paymentInstructions?: string | null;
  }
) {
  const firstName = ctx.client.fullName.split(" ")[0] ?? "";
  const fullName = ctx.client.fullName;
  const email = ctx.client.email ?? "";
  const nextSessionWhen = ctx.nextSession
    ? new Date(ctx.nextSession.scheduledAt).toLocaleString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  const nextSessionDuration = ctx.nextSession
    ? `${ctx.nextSession.durationMinutes} minutes`
    : "";
  const lastSessionDate = ctx.lastSession
    ? new Date(ctx.lastSession.scheduledAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
      })
    : "";
  const amount =
    ctx.lastSession?.paymentAmountCents != null
      ? `$${(ctx.lastSession.paymentAmountCents / 100).toFixed(2)}`
      : "";
  const meetUrl = ctx.nextSession?.meetUrl ?? "";

  const map: Record<string, string> = {
    firstName,
    fullName,
    email,
    nextSessionWhen,
    nextSessionDuration,
    lastSessionDate,
    amount,
    paymentInstructions: ctx.paymentInstructions ?? "",
    meetUrl,
  };

  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => map[key] ?? "");
}

export function EmailComposer({
  client,
  templates,
  nextSession,
  lastSession,
  paymentInstructions,
  resendConfigured = false,
  trigger,
}: {
  client: Client;
  templates: EmailTemplate[];
  nextSession?: Session | null;
  lastSession?: Session | null;
  paymentInstructions?: string | null;
  /** When true, the "Send" button calls Resend. When false, falls back to mailto. */
  resendConfigured?: boolean;
  trigger?: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId) return;
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    const ctx = { client, nextSession, lastSession, paymentInstructions };
    setSubject(render(t.subject, ctx));
    setBody(render(t.body, ctx));
  }, [templateId, templates, client, nextSession, lastSession, paymentInstructions]);

  const noEmail = !client.email;

  function buildMailto() {
    const params = new URLSearchParams();
    if (subject) params.set("subject", subject);
    if (body) params.set("body", body);
    return `mailto:${client.email ?? ""}?${params.toString()}`;
  }

  async function handleSend() {
    if (!client.email) return;
    setSubmitting(true);
    setError(null);
    try {
      if (resendConfigured) {
        // Real send via Resend (also logs the comm internally).
        const fd = new FormData();
        fd.append("clientId", client.id);
        fd.append("to", client.email);
        fd.append("subject", subject);
        fd.append("body", body);
        if (templateId) fd.append("templateId", templateId);
        const result = await sendClientEmail(fd);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setOpen(false);
      } else {
        // Mailto fallback — log first, then open the user's mail app.
        const fd = new FormData();
        fd.append("clientId", client.id);
        fd.append("kind", "email_sent");
        fd.append("subject", subject);
        fd.append("body", body);
        if (templateId) fd.append("templateId", templateId);
        await logCommunication(fd);
        window.location.href = buildMailto();
        setOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send.");
    } finally {
      setSubmitting(false);
    }
  }

  const sendLabel = submitting
    ? resendConfigured
      ? "Sending…"
      : "Opening…"
    : resendConfigured
    ? "Send email"
    : "Open in mail app";

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-flame-700 hover:underline font-medium inline-flex items-center gap-1"
          disabled={noEmail}
          title={noEmail ? "Add an email address first" : "Compose email"}
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          Email
        </button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Email ${client.fullName}`}
        size="lg"
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
              type="button"
              onClick={handleSend}
              disabled={submitting || !client.email}
              className="px-4 py-2 text-sm bg-ink-900 hover:bg-ink-800 text-white rounded-md font-medium disabled:opacity-60"
            >
              {sendLabel}
            </button>
          </>
        }
      >
        {noEmail ? (
          <div className="text-sm text-ink-600">
            This client doesn&apos;t have an email saved. Add one to their
            profile first.
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded p-2">
                {error}
              </div>
            )}

            <Field label="To">
              <input
                disabled
                value={client.email ?? ""}
                className={inputCls + " bg-ink-50"}
              />
            </Field>

            <Field label="Template">
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className={inputCls}
              >
                <option value="">— start blank —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Subject">
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field label="Body">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className={inputCls}
              />
            </Field>

            <div className="text-[11px] text-ink-500 leading-relaxed">
              Variables you can use:{" "}
              <code className="font-mono text-ink-700">{`{{firstName}}`}</code>{" "}
              <code className="font-mono text-ink-700">{`{{fullName}}`}</code>{" "}
              <code className="font-mono text-ink-700">{`{{nextSessionWhen}}`}</code>{" "}
              <code className="font-mono text-ink-700">{`{{lastSessionDate}}`}</code>{" "}
              <code className="font-mono text-ink-700">{`{{amount}}`}</code>{" "}
              <code className="font-mono text-ink-700">{`{{paymentInstructions}}`}</code>{" "}
              <code className="font-mono text-ink-700">{`{{meetUrl}}`}</code>
              <br />
              {resendConfigured ? (
                <>
                  Clicking <strong>Send email</strong> sends this directly via
                  Resend and logs it on the client&apos;s profile.
                </>
              ) : (
                <>
                  Clicking <strong>Open in mail app</strong> logs this on the
                  client&apos;s profile and opens your default mail program with
                  the draft pre-filled. To send directly from this app, set{" "}
                  <code className="font-mono">RESEND_API_KEY</code>.
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
