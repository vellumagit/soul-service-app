// Cloudflare Stream client. Three env vars drive everything:
//
//   CLOUDFLARE_ACCOUNT_ID         — your CF account UUID
//   CLOUDFLARE_STREAM_API_TOKEN   — API token with Stream:Edit permission
//   CLOUDFLARE_STREAM_CUSTOMER_CODE — the "customer-XXXX" subdomain prefix
//
// When any of these are missing, isConfigured() returns false and the
// app degrades gracefully — UI shows a quiet "video hosting not set up"
// state instead of crashing.
//
// Auth & flow:
//   1. createDirectUpload() → POST returns { uploadURL, uid }. The uid is
//      the permanent Cloudflare ID we store on the DB row. The uploadURL
//      is a one-time URL the browser POSTs the file to directly (skips
//      the Vercel 4.5MB function payload limit).
//   2. After upload, the video transcodes for a minute or two. Poll via
//      getVideoDetails() to check `readyToStream`.
//   3. For playback, getSignedPlaybackUrl() mints a 24h-expiry signed
//      URL via Cloudflare's token endpoint. The iframe src is that URL,
//      so even if a client copies the iframe HTML, the link dies overnight.
//
// requireSignedURLs is set TRUE on every video — without a signed token
// the player returns 401. This is the security model for both recaps
// (private to one client) and product replays (private to confirmed
// purchasers).

const API_BASE = "https://api.cloudflare.com/client/v4";

function getConfig(): {
  accountId: string;
  apiToken: string;
  customerCode: string;
} | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  const customerCode = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE;
  if (!accountId || !apiToken || !customerCode) return null;
  return { accountId, apiToken, customerCode };
}

export function isConfigured(): boolean {
  return getConfig() !== null;
}

export class CloudflareStreamError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "CloudflareStreamError";
  }
}

function requireConfig() {
  const cfg = getConfig();
  if (!cfg) {
    throw new CloudflareStreamError(
      "Cloudflare Stream is not configured. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN, and CLOUDFLARE_STREAM_CUSTOMER_CODE in your environment."
    );
  }
  return cfg;
}

// ─────────────────────────────────────────────────────────────────────
// Direct upload — returns a one-time URL the browser POSTs the file to
// ─────────────────────────────────────────────────────────────────────

export type DirectUploadResult = {
  uploadURL: string;
  uid: string;
};

export async function createDirectUpload(opts: {
  /** Max minutes the upload URL stays valid. Default 30. */
  maxDurationSeconds?: number;
  /** Internal label for searching the CF dashboard later. */
  meta?: Record<string, string>;
  /** If true, video requires a signed URL to play. We always want this. */
  requireSignedURLs?: boolean;
}): Promise<DirectUploadResult> {
  const cfg = requireConfig();
  const body = {
    maxDurationSeconds: opts.maxDurationSeconds ?? 21600, // 6h cap
    meta: opts.meta ?? {},
    requireSignedURLs: opts.requireSignedURLs ?? true,
  };
  const r = await fetch(
    `${API_BASE}/accounts/${cfg.accountId}/stream/direct_upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  const json: unknown = await r.json().catch(() => ({}));
  if (!r.ok || !isResult(json)) {
    throw new CloudflareStreamError(
      `Cloudflare direct_upload failed: ${r.status} ${describe(json)}`,
      r.status
    );
  }
  const result = json.result as { uploadURL?: string; uid?: string };
  if (!result.uploadURL || !result.uid) {
    throw new CloudflareStreamError(
      `Cloudflare direct_upload returned no uploadURL/uid: ${JSON.stringify(json)}`
    );
  }
  return { uploadURL: result.uploadURL, uid: result.uid };
}

// ─────────────────────────────────────────────────────────────────────
// Video details — used for readiness polling + duration backfill
// ─────────────────────────────────────────────────────────────────────

export type VideoDetails = {
  uid: string;
  readyToStream: boolean;
  durationSeconds: number | null;
  thumbnailUrl: string;
  /** Cloudflare's status: pendingupload | inprogress | ready | error */
  state: string;
  /** Error message if state === "error". */
  errorReason: string | null;
};

export async function getVideoDetails(
  uid: string
): Promise<VideoDetails | null> {
  const cfg = requireConfig();
  const r = await fetch(`${API_BASE}/accounts/${cfg.accountId}/stream/${uid}`, {
    headers: { Authorization: `Bearer ${cfg.apiToken}` },
  });
  if (r.status === 404) return null;
  const json: unknown = await r.json().catch(() => ({}));
  if (!r.ok || !isResult(json)) {
    throw new CloudflareStreamError(
      `Cloudflare getVideoDetails failed: ${r.status} ${describe(json)}`,
      r.status
    );
  }
  const result = json.result as {
    uid: string;
    readyToStream?: boolean;
    duration?: number;
    thumbnail?: string;
    status?: { state?: string; errorReasonText?: string };
  };
  return {
    uid: result.uid,
    readyToStream: !!result.readyToStream,
    durationSeconds:
      typeof result.duration === "number" ? Math.round(result.duration) : null,
    thumbnailUrl:
      result.thumbnail ??
      `https://customer-${cfg.customerCode}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`,
    state: result.status?.state ?? "unknown",
    errorReason: result.status?.errorReasonText ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Signed playback URL — 24h expiry
// ─────────────────────────────────────────────────────────────────────

export async function getSignedPlaybackToken(opts: {
  uid: string;
  /** Lifetime in seconds. Default 24h. */
  ttlSeconds?: number;
}): Promise<string> {
  const cfg = requireConfig();
  const ttl = opts.ttlSeconds ?? 24 * 60 * 60;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const r = await fetch(
    `${API_BASE}/accounts/${cfg.accountId}/stream/${opts.uid}/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ exp }),
    }
  );
  const json: unknown = await r.json().catch(() => ({}));
  if (!r.ok || !isResult(json)) {
    throw new CloudflareStreamError(
      `Cloudflare signed-token mint failed: ${r.status} ${describe(json)}`,
      r.status
    );
  }
  const result = json.result as { token?: string };
  if (!result.token) {
    throw new CloudflareStreamError(
      `Cloudflare signed-token mint returned no token: ${JSON.stringify(json)}`
    );
  }
  return result.token;
}

/**
 * URL pointing at Cloudflare's iframe player for the given token. Use as
 * the `src` of a sandboxed iframe.
 */
export function signedPlaybackIframeUrl(token: string): string {
  const cfg = requireConfig();
  return `https://customer-${cfg.customerCode}.cloudflarestream.com/${token}/iframe`;
}

/**
 * One-shot helper: mints a token AND returns the iframe URL ready to embed.
 * Most callers want this.
 */
export async function getSignedPlaybackIframeUrl(
  uid: string,
  ttlSeconds?: number
): Promise<string> {
  const token = await getSignedPlaybackToken({ uid, ttlSeconds });
  return signedPlaybackIframeUrl(token);
}

// ─────────────────────────────────────────────────────────────────────
// Delete — used when she removes a recap or archives a product
// ─────────────────────────────────────────────────────────────────────

export async function deleteVideo(uid: string): Promise<void> {
  const cfg = requireConfig();
  const r = await fetch(`${API_BASE}/accounts/${cfg.accountId}/stream/${uid}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${cfg.apiToken}` },
  });
  // 404 means already gone — treat as success.
  if (r.status === 404) return;
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new CloudflareStreamError(
      `Cloudflare deleteVideo failed: ${r.status} ${body.slice(0, 200)}`,
      r.status
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Thumbnail — derived from customer code + uid, no API call
// ─────────────────────────────────────────────────────────────────────

export function thumbnailUrl(
  uid: string,
  opts: { width?: number; time?: number } = {}
): string {
  const cfg = requireConfig();
  const params = new URLSearchParams();
  if (opts.time !== undefined) params.set("time", `${opts.time}s`);
  if (opts.width !== undefined) params.set("width", String(opts.width));
  const qs = params.toString() ? `?${params}` : "";
  return `https://customer-${cfg.customerCode}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg${qs}`;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function isResult(j: unknown): j is { result: unknown } {
  return (
    typeof j === "object" && j !== null && "result" in j && (j as { success?: boolean }).success !== false
  );
}

function describe(j: unknown): string {
  if (typeof j !== "object" || j === null) return String(j);
  const o = j as { errors?: Array<{ message?: string }>; messages?: unknown[] };
  if (Array.isArray(o.errors) && o.errors.length > 0) {
    return o.errors.map((e) => e.message ?? "").join("; ").slice(0, 300);
  }
  return JSON.stringify(j).slice(0, 300);
}
