// Recall.ai API client for the auto-notes meeting-bot integration.
//
// Recall is the infrastructure layer: we tell their API to send a bot into
// a Google Meet at a specific time; the bot records the call; when the
// meeting ends, Recall webhooks the transcript back to /api/webhooks/recall.
// From there our existing Claude flow structures it into session notes.
//
// Auth: `Authorization: Token <RECALL_API_KEY>` header.
// Region-specific base URL, e.g. `us-east-1.recall.ai`. Set RECALL_REGION.
// Webhook signature verification lives in the route handler (uses
// RECALL_WEBHOOK_SECRET).
//
// We attach metadata { sessionId, accountId } when creating a bot — Recall
// echoes it back in every webhook event, so the route handler doesn't have
// to query the DB to find the matching session row.

const REGIONS = [
  "us-west-2",
  "us-east-1",
  "eu-central-1",
  "ap-northeast-1",
] as const;
type Region = (typeof REGIONS)[number];

export function recallConfigured(): boolean {
  return (
    typeof process.env.RECALL_API_KEY === "string" &&
    process.env.RECALL_API_KEY.length > 0 &&
    typeof process.env.RECALL_REGION === "string" &&
    process.env.RECALL_REGION.length > 0
  );
}

function getApiBase(): string {
  const region = (process.env.RECALL_REGION ?? "us-east-1") as Region;
  if (!REGIONS.includes(region)) {
    throw new Error(
      `RECALL_REGION="${region}" is invalid. Must be one of: ${REGIONS.join(", ")}.`
    );
  }
  return `https://${region}.recall.ai/api/v1`;
}

function getAuthHeader(): string {
  const key = process.env.RECALL_API_KEY;
  if (!key) {
    throw new Error(
      "RECALL_API_KEY is not set. Add it to .env.local (and Vercel env vars for production). Get one at https://recall.ai → dashboard."
    );
  }
  return `Token ${key}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// createBot — schedule a meeting bot.
//
// Recall requires `join_at` to be >10 minutes in the future for SCHEDULED
// bots. To make a bot join immediately, OMIT `join_at` entirely (the bot
// tries to join right away).
// ─────────────────────────────────────────────────────────────────────────────

export type CreateBotOptions = {
  meetingUrl: string;
  botName: string;
  /** ISO 8601 timestamp >10min in the future. Omit to join immediately. */
  joinAt?: string | null;
  /** Echoed back in every webhook payload. We pack sessionId + accountId
   *  so the webhook handler can route directly to the right row. */
  metadata?: Record<string, string>;
  /** Whisper for transcription. Recall's `recallai_streaming` provider
   *  uses Whisper under the hood with their streaming infrastructure. */
  transcriptionProvider?: "recallai_streaming" | "recallai_async";
};

export type CreateBotResult = {
  id: string;
  meetingUrl: string;
  botName: string;
  joinAt: string | null;
  metadata: Record<string, unknown>;
  /** Recall's `status_changes` array — last item is the current status. */
  rawStatus: string | null;
};

export async function createBot(
  options: CreateBotOptions
): Promise<CreateBotResult> {
  const {
    meetingUrl,
    botName,
    joinAt,
    metadata,
    transcriptionProvider = "recallai_streaming",
  } = options;

  // Recall enforces "join_at must be >10min in the future" — surface a clear
  // error before the round-trip if we can detect it client-side.
  if (joinAt) {
    const join = new Date(joinAt);
    if (Number.isNaN(join.getTime())) {
      throw new Error(`joinAt is not a valid ISO 8601 timestamp: ${joinAt}`);
    }
    const minutesFromNow = (join.getTime() - Date.now()) / (60 * 1000);
    if (minutesFromNow < 10) {
      throw new Error(
        `joinAt must be more than 10 minutes in the future. Got ${minutesFromNow.toFixed(1)} minutes.`
      );
    }
  }

  const body: Record<string, unknown> = {
    meeting_url: meetingUrl,
    bot_name: botName,
    recording_config: {
      transcript: {
        provider: {
          [transcriptionProvider]: {},
        },
      },
    },
  };
  if (joinAt) body.join_at = joinAt;
  if (metadata) body.metadata = metadata;

  const res = await fetch(`${getApiBase()}/bot`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Recall create bot failed (${res.status}): ${text.slice(0, 500)}`
    );
  }

  const json = (await res.json()) as {
    id: string;
    meeting_url: string;
    bot_name: string;
    join_at: string | null;
    metadata: Record<string, unknown>;
    status_changes?: Array<{ code: string; created_at: string }>;
  };

  const lastStatus =
    Array.isArray(json.status_changes) && json.status_changes.length > 0
      ? json.status_changes[json.status_changes.length - 1].code
      : null;

  return {
    id: json.id,
    meetingUrl: json.meeting_url,
    botName: json.bot_name,
    joinAt: json.join_at,
    metadata: json.metadata,
    rawStatus: lastStatus,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// cancelBot — try to delete a scheduled bot. If the bot has already passed
// the 10-min threshold (or is already in the call), fall back to having it
// leave the call. Recall's docs split these into two endpoints; the caller
// shouldn't have to care which to use.
// ─────────────────────────────────────────────────────────────────────────────

export async function cancelBot(botId: string): Promise<void> {
  // Two Recall endpoints handle bot cancellation:
  //   DELETE /bot/{id}/         — kills a scheduled bot before it joins
  //   POST   /bot/{id}/leave_call — pulls a bot OUT of an in-progress call
  // The docs say DELETE only works >10 min before join_at; after that,
  // you have to use leave_call instead.
  //
  // Mapping HTTP responses to outcomes:
  //   2xx          — success
  //   404          — bot already gone (cancelled earlier, never created
  //                  on Recall's side, etc.) → success, no leave_call needed
  //   any other 4xx — the bot is past the delete-able stage: it's already
  //                  joining or in the call. Recall returns 400 ("too late"),
  //                  405 (cannot_delete_bot: "Only scheduled bots which have
  //                  not yet joined a call can be deleted"), or 409 depending
  //                  on the exact state. In ALL of these the right move is to
  //                  pull the bot OUT with leave_call — so we don't enumerate
  //                  codes, we just fall through to leave_call for any 4xx.
  //   5xx          — Recall is down → throw so the caller can retry.
  //
  // Same shape for leave_call, except 4xx is treated as success there
  // (bot was probably already gone for one reason or another, and there's
  // nothing left to do).
  const deleteRes = await fetch(`${getApiBase()}/bot/${botId}/`, {
    method: "DELETE",
    headers: { Authorization: getAuthHeader() },
  });
  if (deleteRes.ok) return;
  if (deleteRes.status === 404) return; // bot already gone — done

  // Only a server error should surface as a failure; every 4xx means "can't
  // delete, it's live" → fall through to leave_call.
  if (deleteRes.status >= 500) {
    const text = await deleteRes.text().catch(() => "");
    throw new Error(
      `Recall cancel bot failed (${deleteRes.status}): ${text.slice(0, 300)}`
    );
  }

  // Fallback: too late to delete a scheduled bot, pull it out of the call
  // instead (works whether it's joining, waiting, or recording).
  const leaveRes = await fetch(`${getApiBase()}/bot/${botId}/leave_call`, {
    method: "POST",
    headers: { Authorization: getAuthHeader() },
  });
  if (leaveRes.ok) return;
  // 4xx on leave_call — bot already left, was never in the call, etc. Treat
  // as success: there's nothing more we can do, and the outcome (bot is
  // not in the call) matches what we wanted.
  if (leaveRes.status < 500) return;
  const text = await leaveRes.text().catch(() => "");
  throw new Error(
    `Recall leave_call failed (${leaveRes.status}): ${text.slice(0, 300)}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// fetchTranscriptText — given a transcript_id from the `transcript.done`
// webhook, fetch the structured transcript and convert it to plain text
// suitable for Claude's note-generation flow.
//
// Recall's transcript format is an array of speaker-attributed word blocks:
//   [{ participant: { name, ... }, language_code, words: [{ text, start_timestamp, end_timestamp }, ...] }]
//
// We collapse it into a readable conversation:
//   <Speaker Name>: <words joined with spaces>
//   <Speaker Name>: ...
// Punctuation depends on Recall's words — usually fine; we don't try to
// re-punctuate.
// ─────────────────────────────────────────────────────────────────────────────

type RecallWord = {
  text: string;
  start_timestamp?: { absolute?: string | null; relative?: number };
  end_timestamp?: { absolute?: string | null; relative?: number };
};
type RecallSpeakerBlock = {
  participant?: {
    id?: number;
    name?: string | null;
    is_host?: boolean | null;
    platform?: string | null;
    email?: string | null;
  };
  language_code?: string;
  words?: RecallWord[];
};

export type FetchedTranscript = {
  text: string;
  languageCodes: string[];
  /** Number of distinct speakers detected. Useful for sanity-checking
   *  "did this bot pick up only one side of the call". */
  speakerCount: number;
};

export async function fetchTranscriptText(
  transcriptId: string
): Promise<FetchedTranscript> {
  // Step 1: get the transcript object, which contains a download_url.
  const meta = await fetch(`${getApiBase()}/transcript/${transcriptId}/`, {
    method: "GET",
    headers: { Authorization: getAuthHeader() },
  });
  if (!meta.ok) {
    const text = await meta.text().catch(() => "");
    throw new Error(
      `Recall transcript metadata fetch failed (${meta.status}): ${text.slice(0, 300)}`
    );
  }
  const metaJson = (await meta.json()) as {
    data?: { download_url?: string };
    download_url?: string;
  };
  const downloadUrl = metaJson.data?.download_url ?? metaJson.download_url;
  if (!downloadUrl) {
    throw new Error(
      "Recall transcript metadata didn't include a download_url. " +
        "Has the transcript actually finished processing?"
    );
  }

  // Step 2: download the actual transcript JSON.
  const contentRes = await fetch(downloadUrl, { method: "GET" });
  if (!contentRes.ok) {
    throw new Error(
      `Recall transcript download failed (${contentRes.status})`
    );
  }
  const blocks = (await contentRes.json()) as RecallSpeakerBlock[];
  if (!Array.isArray(blocks)) {
    throw new Error(
      "Recall transcript download returned a shape we didn't expect (not an array)."
    );
  }

  const lines: string[] = [];
  const langs = new Set<string>();
  const speakers = new Set<string>();
  for (const b of blocks) {
    const name =
      (b.participant?.name ?? "").trim() ||
      (b.participant?.is_host ? "Host" : "Speaker");
    const text = (b.words ?? [])
      .map((w) => w.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length === 0) continue;
    lines.push(`${name}: ${text}`);
    if (b.language_code) langs.add(b.language_code);
    speakers.add(name);
  }

  return {
    text: lines.join("\n"),
    languageCodes: Array.from(langs),
    speakerCount: speakers.size,
  };
}
