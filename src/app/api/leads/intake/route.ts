// POST /api/leads/intake
//
// The public lead-capture endpoint. Lead-magnet forms, embed widgets,
// Make.com scenarios, and curl scripts all POST here with a per-form
// Bearer token. Soul Service stores the submission for triage on
// /network/inbox and (if configured) fires an outbound webhook so Brian
// can wire downstream nurture via Make.com without us being in the email
// business.
//
// Authentication:
//   Authorization: Bearer lf_<token>   (or "Token <...>" or just "<...>")
//
// Request body (JSON):
//   {
//     "email": "person@example.com",     // strongly recommended; drives dedup
//     "name": "Maria Pérez",              // optional
//     "phone": "+1234567890",             // optional
//     "fields": { ... }                    // arbitrary key/value JSON
//   }
// The whole top-level payload (minus name/email/phone) is ALSO captured
// into `fields` if `fields` isn't explicitly provided — so flat-shape
// HTML form submissions ("happiest hours-old-style") work without
// requiring nesting.
//
// Spam mitigation (all best-effort, none of them bulletproof):
//   - Per-token in-memory rate limit (30/min). Defense in depth; Vercel
//     handles real edge-case DDoS at the platform layer.
//   - Honeypot: any non-empty `_hp` field → silently 204 the request
//     ("accepted") without storing.
//   - Email-based dedup within 24 hours per form: prevents a stuck form
//     re-firing endlessly.
//
// CORS: `*` is fine because the bearer token IS the auth; cookies are
// never involved. OPTIONS preflight handled.

import { NextResponse } from "next/server";
import { db } from "@/db";
import { leadForms, leadSubmissions, clients } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { extractBearerToken, hashLeadFormToken } from "@/lib/lead-tokens";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // outbound webhook fire-and-forget; 30s is plenty

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// In-memory rate limiter, scoped to one serverless instance. Sufficient
// for accidental loops; real abuse is mitigated by token rotation +
// Vercel's platform-layer protection.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map<string, { count: number; windowStart: number }>();

function rateLimitOk(tokenHash: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(tokenHash);
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(tokenHash, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count += 1;
  return true;
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  const respond = (
    status: number,
    body: Record<string, unknown>
  ): Response =>
    NextResponse.json(body, {
      status,
      headers: CORS_HEADERS,
    });

  // 1. Bearer token.
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) {
    return respond(401, { error: "Missing Authorization bearer token" });
  }
  const tokenHash = hashLeadFormToken(token);

  // Rate limit BEFORE the DB lookup so a flood of bad tokens still gets
  // bounced cheaply. (Bad tokens still hit the limit table; that's fine.)
  if (!rateLimitOk(tokenHash)) {
    return respond(429, { error: "Too many requests" });
  }

  // 2. Match the token to a form. Use the hashed lookup index.
  const [form] = await db
    .select()
    .from(leadForms)
    .where(eq(leadForms.tokenHash, tokenHash))
    .limit(1);
  if (!form) {
    return respond(401, { error: "Invalid token" });
  }
  if (form.archivedAt) {
    return respond(410, { error: "This form has been archived" });
  }

  // 3. Parse payload.
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return respond(400, { error: "Invalid JSON body" });
  }
  if (!body || typeof body !== "object") {
    return respond(400, { error: "Body must be a JSON object" });
  }

  // 4. Honeypot check: any non-empty value in `_hp` → silent 204.
  const honeypot = body._hp ?? body.hp ?? null;
  if (typeof honeypot === "string" && honeypot.trim().length > 0) {
    // Return 204 so a naive bot logs "success" and moves on, while we
    // store nothing.
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // 5. Normalize canonical fields. Accept several common alias spellings
  // so the endpoint is friendly to whatever the form sends. Email gets
  // lowercased (in addition to the trim already done by pickString) so
  // dedup logic — both here and in the manual accept path — treats
  // `Brian@x.com` and `brian@x.com` as the same person. Email addresses
  // are case-insensitive per RFC 5321 §2.3.11; without the .toLowerCase()
  // a single person submitting from two different devices/autofills would
  // silently become two duplicate clients.
  const name = pickString(body, ["name", "full_name", "fullName"]);
  const emailRaw = pickString(body, ["email", "email_address", "emailAddress"]);
  const email = emailRaw ? emailRaw.toLowerCase() : null;
  const phone = pickString(body, ["phone", "phone_number", "phoneNumber"]);

  // `fields` is the freeform sidecar. Accept it nested OR (if absent)
  // flatten the rest of the top-level body into it minus the canonical
  // fields + auth + honeypot.
  const explicitFields = body.fields;
  let fields: Record<string, unknown>;
  if (
    explicitFields &&
    typeof explicitFields === "object" &&
    !Array.isArray(explicitFields)
  ) {
    fields = explicitFields as Record<string, unknown>;
  } else {
    const RESERVED = new Set([
      "name",
      "full_name",
      "fullName",
      "email",
      "email_address",
      "emailAddress",
      "phone",
      "phone_number",
      "phoneNumber",
      "_hp",
      "hp",
      "fields",
    ]);
    fields = Object.fromEntries(
      Object.entries(body).filter(([k]) => !RESERVED.has(k))
    );
  }

  // 6. Source metadata for triage.
  const sourceIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;
  const referer = req.headers.get("referer") ?? null;

  // 7. Insert FIRST, then dedup.
  //
  // The original pattern was: check for a prior submission in the last
  // 24h, then insert as "pending" or "duplicate" based on the result.
  // That has a race: two simultaneous submits with the same email both
  // pass the pre-check before either insert lands, and both end up
  // pending — defeating dedup under "double-click submit" and any
  // form-retry-on-network-blip scenario.
  //
  // The fix is to flip the order. Insert as pending first (always),
  // then post-check for OLDER submissions with the same form+email
  // within the 24h window. If we find any with an EARLIER createdAt
  // than ours, downgrade our own status to "duplicate". This way the
  // first submission wins on race; everyone after gets correctly
  // labelled. The DB's row-level createdAt timestamps give us a
  // natural ordering even across concurrent inserts.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [submission] = await db
    .insert(leadSubmissions)
    .values({
      accountId: form.accountId,
      formId: form.id,
      name,
      email,
      phone,
      fields,
      sourceIp,
      userAgent,
      referer,
      status: "pending",
    })
    .returning({ id: leadSubmissions.id, createdAt: leadSubmissions.createdAt });

  let isDuplicate = false;
  if (email) {
    // Tie-break on UUID when createdAt is identical (Postgres timestamps
    // have microsecond resolution — under heavy concurrent load two
    // inserts CAN land at the exact same microsecond). Without the
    // tie-break, both rows would see `lt(createdAt, mine)` as false and
    // both would be marked pending, defeating dedup. With it, the row
    // with the lexicographically smaller UUID wins consistently across
    // both handlers: this row is "earlier" iff its UUID sorts before
    // mine, OR its createdAt is strictly older.
    const [earlier] = await db
      .select({ id: leadSubmissions.id })
      .from(leadSubmissions)
      .where(
        and(
          eq(leadSubmissions.formId, form.id),
          // Case-insensitive match against the stored email. `email` is
          // already lowercased above; the LOWER() on the column protects
          // against legacy rows submitted BEFORE the normalization fix
          // (which would still be stored at whatever casing the form
          // sent). Same backward-compat treatment that acceptLeadSubmission
          // gives clients.email — keep them consistent.
          sql`LOWER(${leadSubmissions.email}) = ${email}`,
          gte(leadSubmissions.createdAt, dayAgo),
          sql`(
            ${leadSubmissions.createdAt} < ${submission.createdAt}
            OR (
              ${leadSubmissions.createdAt} = ${submission.createdAt}
              AND ${leadSubmissions.id} < ${submission.id}
            )
          )`
        )
      )
      .limit(1);
    if (earlier) {
      isDuplicate = true;
      await db
        .update(leadSubmissions)
        .set({
          status: "duplicate",
          reviewedAt: new Date(),
          reviewedAction: "auto-duplicate",
        })
        .where(eq(leadSubmissions.id, submission.id));
    }
  }

  // 9. Auto-accept path. Only runs for non-duplicates on auto_accept forms.
  // Same dedup discipline as the manual acceptLeadSubmission flow: if a
  // client with this email already exists, reuse it instead of creating
  // a duplicate row. Especially important on auto-accept paths because
  // the submission came in unattended — without dedup, a stuck form or
  // a spam loop could fill /clients with duplicates while she sleeps.
  let promotedClientId: string | null = null;
  if (form.autoAccept && !isDuplicate) {
    try {
      let clientId: string;
      if (email) {
        // Match case-insensitively against existing clients.email so a
        // legacy mixed-case email in `clients` table doesn't slip through
        // dedup. New rows are stored lowercased; older rows may not be.
        const [existing] = await db
          .select({ id: clients.id })
          .from(clients)
          .where(
            and(
              eq(clients.accountId, form.accountId),
              sql`LOWER(${clients.email}) = ${email}`
            )
          )
          .limit(1);
        if (existing) {
          clientId = existing.id;
        } else {
          const [client] = await db
            .insert(clients)
            .values({
              accountId: form.accountId,
              fullName: (name ?? email ?? "Unnamed lead").trim(),
              email,
              phone,
              isLead: true,
              howTheyFoundMe: form.defaultIntent ?? `Form: ${form.name}`,
              status: "new",
            })
            .returning({ id: clients.id });
          clientId = client.id;
        }
      } else {
        const [client] = await db
          .insert(clients)
          .values({
            accountId: form.accountId,
            fullName: (name ?? "Unnamed lead").trim(),
            email,
            phone,
            isLead: true,
            howTheyFoundMe: form.defaultIntent ?? `Form: ${form.name}`,
            status: "new",
          })
          .returning({ id: clients.id });
        clientId = client.id;
      }
      promotedClientId = clientId;
      await db
        .update(leadSubmissions)
        .set({
          status: "accepted",
          promotedClientId,
          reviewedAt: new Date(),
          reviewedAction: "auto-accepted",
        })
        .where(eq(leadSubmissions.id, submission.id));
    } catch (err) {
      console.error("[lead intake] auto-accept failed:", err);
      // Submission stays pending — she'll triage manually.
    }
  }

  // 10. Bump the form's counters.
  await db
    .update(leadForms)
    .set({
      submissionCount: (form.submissionCount ?? 0) + 1,
      lastSubmissionAt: new Date(),
    })
    .where(eq(leadForms.id, form.id));

  // 11. Fire-and-forget the outbound webhook (Make.com etc.) if configured.
  // Don't await — the form on the other side shouldn't have to wait for
  // a downstream scenario to finish.
  if (form.webhookUrl) {
    void fireWebhook(form.webhookUrl, {
      event: isDuplicate ? "lead.duplicate" : "lead.received",
      form: {
        id: form.id,
        name: form.name,
        slug: form.slug,
      },
      submission: {
        id: submission.id,
        name,
        email,
        phone,
        fields,
        receivedAt: new Date().toISOString(),
      },
      promotedClientId,
    });
  }

  return respond(200, {
    ok: true,
    submissionId: submission.id,
    status: isDuplicate ? "duplicate" : form.autoAccept ? "accepted" : "pending",
  });
}

function pickString(
  body: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const k of keys) {
    const v = body[k];
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

async function fireWebhook(
  url: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Re-validate the URL immediately before fetch, not just at form-save
  // time. The validator at save time catches obvious misconfiguration,
  // but a DNS rebind between save and fire could swap the resolved IP
  // to a private address (the classic SSRF defense bypass). Re-checking
  // the hostname here closes that window for IPv4/IPv6 literals AND
  // catches any legacy webhook URLs that were saved before the validator
  // existed.
  //
  // Note: this doesn't defeat true DNS rebinding where the attacker
  // controls a public-hostname → private-IP DNS record. Full defense
  // would require resolving the hostname here and connecting by IP.
  // For Soul Service's threat model (practitioner misconfiguring her
  // own webhook URL), the literal-form checks are the meaningful gate.
  const { validatePublicWebhookUrl } = await import("@/lib/url-safety");
  const v = validatePublicWebhookUrl(url);
  if (!v.ok) {
    console.warn(
      `[lead intake] refusing to fire webhook — URL failed validation: ${v.error}`
    );
    return;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Short timeout — the form's user is waiting for our response, and
      // downstream nurture should never block it.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(
        `[lead intake] webhook ${url} returned ${res.status}`
      );
    }
  } catch (err) {
    console.warn(`[lead intake] webhook ${url} threw:`, err);
  }
}
