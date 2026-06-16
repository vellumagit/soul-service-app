// In-memory rolling-window rate limiter. Single instance per Vercel
// function — good enough for the practitioner-tool threat model
// (one practitioner, modest traffic, abuse usually comes from a single
// IP). NOT distributed across regions; for a multi-region rollout, swap
// for Upstash/Redis.
//
// API:
//   const result = checkRateLimit("help", accountId, { limit: 30, windowMs: 60_000 });
//   if (!result.ok) return 429 with Retry-After: result.retryAfterSeconds;
//
// Each (bucket, key) pair gets its own rolling window.

type Entry = { hits: number[] }; // unix ms timestamps within the window
const store = new Map<string, Entry>();

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

export function checkRateLimit(
  bucket: string,
  key: string,
  opts: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  const fullKey = `${bucket}:${key}`;
  const entry = store.get(fullKey) ?? { hits: [] };
  // Drop hits outside the window.
  entry.hits = entry.hits.filter((t) => now - t < opts.windowMs);
  if (entry.hits.length >= opts.limit) {
    const oldest = entry.hits[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((opts.windowMs - (now - oldest)) / 1000)
    );
    store.set(fullKey, entry);
    return { ok: false, retryAfterSeconds };
  }
  entry.hits.push(now);
  store.set(fullKey, entry);
  return { ok: true, remaining: opts.limit - entry.hits.length };
}

/** Lazy GC — purge fully-empty entries every ~1k inserts so the Map
 *  doesn't grow forever on a long-running instance. */
let inserts = 0;
export function recordInsertAndMaybeGC(): void {
  inserts++;
  if (inserts % 1024 !== 0) return;
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of store) {
    if (v.hits.length === 0 || v.hits[v.hits.length - 1] < cutoff) {
      store.delete(k);
    }
  }
}
