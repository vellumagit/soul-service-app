// POST /api/webhooks/recall
//
// Receives Recall.ai webhook events:
//   - bot.status_change      → mirror the latest status onto session row
//   - transcript.done        → fetch + structure + insert notes
//   - recording.done         → currently noop (we don't archive recordings)
//
// Auth: HMAC-SHA256 signature over `${msgId}.${msgTimestamp}.${rawBody}`.
// Headers: Webhook-Id, Webhook-Timestamp, Webhook-Signature (format
// `v1,<base64-sig>`). Secret is base64-decoded from `whsec_...`.
//
// We attached `{ sessionId, accountId }` as metadata on bot creation, so
// every webhook payload contains the routing info we need without a
// lookup-by-bot-id round trip. We do verify the IDs against the DB before
// trusting them — webhook signatures prove the request came from Recall,
// not that the metadata wasn't somehow tampered with upstream.

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/db";
import { sessions, clients } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { fetchTranscriptText } from "@/lib/recall";
import { generateNotesFromTranscript } from "@/lib/ai-notes";

export const dynamic = "force-dynamic";
// Transcripts can take a while to process — give Vercel room.
export const maxDuration = 60;

type WebhookEvent =
  | "bot.status_change"
  | "transcript.done"
  | "recording.done"
  | string;

type WebhookPayload = {
  event: WebhookEvent;
  data: {
    data?: {
      code?: string;
      sub_code?: string | null;
      updated_at?: string;
    };
    bot?: {
      id?: string;
      metadata?: Record<string, unknown>;
    };
    transcript?: {
      id?: string;
      metadata?: Record<string, unknown>;
    };
    recording?: {
      id?: string;
      metadata?: Record<string, unknown>;
    };
  };
};

export async function POST(req: Request) {
  const rawBody = await req.text();

  // 1. Signature verification.
  const secret = process.env.RECALL_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[recall webhook] RECALL_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }
  // Validate the secret format up front. If someone copies the key without
  // the `whsec_` prefix (easy mistake), the silent base64-decode-then-fail
  // path below masks the real problem — every webhook gets rejected with
  // 401 and we have no clear signal that the secret is wrong vs an attack.
  if (!secret.startsWith("whsec_")) {
    console.error(
      "[recall webhook] RECALL_WEBHOOK_SECRET does not start with whsec_ — copy the full value from Recall's dashboard, including the prefix."
    );
    return NextResponse.json(
      { error: "Webhook secret malformed" },
      { status: 500 }
    );
  }

  const headers = Object.fromEntries(
    Array.from(req.headers.entries()).map(([k, v]) => [k.toLowerCase(), v])
  );
  const msgId = headers["webhook-id"];
  const msgTimestamp = headers["webhook-timestamp"];
  const msgSignature = headers["webhook-signature"];
  if (!msgId || !msgTimestamp || !msgSignature) {
    return NextResponse.json(
      { error: "Missing webhook headers" },
      { status: 400 }
    );
  }

  // Replay protection: reject anything older than 5 minutes. The timestamp
  // is part of the signed payload, so an attacker who captures a valid
  // webhook can't bump it without breaking the signature — but without
  // this check, a captured payload could be replayed forever. 5 minutes
  // is the standard window for Svix-style webhook auth (which is what
  // Recall's verification scheme matches).
  const tsSeconds = parseInt(msgTimestamp, 10);
  if (!Number.isFinite(tsSeconds)) {
    return NextResponse.json(
      { error: "Invalid webhook timestamp" },
      { status: 400 }
    );
  }
  const ageMs = Math.abs(Date.now() - tsSeconds * 1000);
  if (ageMs > 5 * 60 * 1000) {
    console.warn(
      `[recall webhook] timestamp too old/skewed: ${(ageMs / 1000).toFixed(0)}s drift`
    );
    return NextResponse.json(
      { error: "Webhook timestamp outside 5-minute window" },
      { status: 401 }
    );
  }

  if (!verifySignature(secret, msgId, msgTimestamp, rawBody, msgSignature)) {
    console.warn("[recall webhook] signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Parse the payload.
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = payload.event;
  const botId = payload.data?.bot?.id;
  const metadata = (payload.data?.bot?.metadata ?? {}) as Record<
    string,
    unknown
  >;
  const sessionId =
    typeof metadata.sessionId === "string" ? metadata.sessionId : null;
  const accountId =
    typeof metadata.accountId === "string" ? metadata.accountId : null;

  // For events that need session routing, both metadata fields are required.
  // Without them we can't safely write to anyone's data.
  if (!sessionId || !accountId) {
    console.warn(
      `[recall webhook] event="${event}" botId="${botId ?? "?"}" — no sessionId/accountId metadata; ignoring`
    );
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Always verify the (sessionId, accountId, botId) triple matches a row
  // we actually created. This is the safety net against a webhook payload
  // with valid signature but spoofed metadata (extremely unlikely; this
  // is belt-and-suspenders).
  const [row] = await db
    .select({
      id: sessions.id,
      clientId: sessions.clientId,
      currentStatus: sessions.recallBotStatus,
      transcriptReceivedAt: sessions.recallTranscriptReceivedAt,
      notes: sessions.notes,
      type: sessions.type,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.accountId, accountId),
        eq(sessions.id, sessionId),
        botId ? eq(sessions.recallBotId, botId) : eq(sessions.id, sessionId)
      )
    )
    .limit(1);
  if (!row) {
    console.warn(
      `[recall webhook] event="${event}" sessionId="${sessionId}" — no matching session for this account/bot; ignoring`
    );
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    switch (event) {
      case "bot.status_change": {
        const code = payload.data?.data?.code ?? null;
        if (code) {
          await db
            .update(sessions)
            .set({
              recallBotStatus: code,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(sessions.accountId, accountId),
                eq(sessions.id, sessionId)
              )
            );
        }
        break;
      }
      case "transcript.done": {
        // Idempotency: if we already attached notes for this transcript
        // (could happen if Recall retries on a network blip), don't run
        // the pipeline again.
        if (row.transcriptReceivedAt) {
          console.log(
            `[recall webhook] transcript.done sessionId="${sessionId}" — already processed; skipping`
          );
          break;
        }

        const transcriptId = payload.data?.transcript?.id;
        if (!transcriptId) {
          console.warn(
            `[recall webhook] transcript.done with no transcript.id; ignoring`
          );
          break;
        }

        // Fetch transcript text from Recall.
        const fetched = await fetchTranscriptText(transcriptId);
        if (fetched.text.trim().length < 50) {
          console.warn(
            `[recall webhook] transcript too short (${fetched.text.length} chars) for sessionId="${sessionId}"`
          );
          break;
        }

        // Look up client context for the Claude prompt.
        const [client] = await db
          .select()
          .from(clients)
          .where(
            and(
              eq(clients.accountId, accountId),
              eq(clients.id, row.clientId)
            )
          )
          .limit(1);

        const generated = await generateNotesFromTranscript({
          transcript: fetched.text,
          clientFirstName:
            client?.fullName.split(" ")[0] ?? client?.fullName ?? null,
          clientWorkingOn: client?.workingOn ?? null,
          sessionType: row.type,
        });

        // Append (don't replace) any notes she may have already typed
        // by hand. Replacement here would be hostile.
        const existing = (row.notes ?? "").trim();
        const finalNotes =
          existing.length === 0
            ? generated.notes
            : `${existing}\n\n---\n\n_Auto-generated from the meeting transcript:_\n\n${generated.notes}`;

        await db
          .update(sessions)
          .set({
            notes: finalNotes,
            recallTranscriptReceivedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(sessions.accountId, accountId),
              eq(sessions.id, sessionId)
            )
          );
        break;
      }
      case "recording.done":
        // We don't currently archive Recall's recordings; the bot's audio
        // stays in Recall's storage if she ever needs it via their dashboard.
        // Could fetch + save to Blob in the future if useful.
        break;
      default:
        // Unknown event types are fine — Recall may add more over time.
        console.log(`[recall webhook] unhandled event: ${event}`);
    }
  } catch (err) {
    // If anything inside the switch threw, we surface a 500 so Recall
    // retries. The signature was valid, the routing was valid; the issue
    // is on our side.
    console.error(
      `[recall webhook] processing event="${event}" failed:`,
      err
    );
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Processing failed",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

// HMAC-SHA256 over `${msgId}.${msgTimestamp}.${rawBody}` — secret is base64
// after stripping the `whsec_` prefix. Signature header is `v1,<base64-sig>`.
function verifySignature(
  secret: string,
  msgId: string,
  msgTimestamp: string,
  rawBody: string,
  msgSignature: string
): boolean {
  try {
    const base64Part = secret.replace(/^whsec_/, "");
    const key = Buffer.from(base64Part, "base64");
    const toSign = `${msgId}.${msgTimestamp}.${rawBody}`;
    const expected = crypto
      .createHmac("sha256", key)
      .update(toSign)
      .digest("base64");

    // Recall's signature header is "v1,<sig>" — handle multiple
    // comma-separated values defensively.
    const provided = msgSignature
      .split(/\s+/)
      .map((s) => s.trim())
      .find((s) => s.startsWith("v1,"));
    if (!provided) return false;
    const providedSig = provided.slice(3);

    const expectedBuf = Buffer.from(expected, "base64");
    const providedBuf = Buffer.from(providedSig, "base64");
    if (expectedBuf.length !== providedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  } catch (err) {
    console.error("[recall webhook] verifySignature threw:", err);
    return false;
  }
}
