// Token utilities for lead-capture forms.
//
// Each form has a per-form Bearer token used to authenticate the
// `/api/leads/intake` endpoint. We store SHA-256 of the cleartext in the
// DB so a DB read doesn't expose the token. The cleartext is shown to the
// practitioner exactly once at creation (or after rotate); after that the
// UI displays the prefix only.
//
// Token format: `lf_<32 hex chars>`. The `lf_` prefix lets future code
// recognize Soul Service form tokens at a glance.

import crypto from "node:crypto";

const TOKEN_PREFIX = "lf_";
const TOKEN_RANDOM_BYTES = 16; // 32 hex chars
const TOKEN_DISPLAY_PREFIX_LEN = 11; // "lf_" + 8 hex chars

/** Generate a fresh cleartext token. Show this to the user ONCE. */
export function generateLeadFormToken(): string {
  const rand = crypto.randomBytes(TOKEN_RANDOM_BYTES).toString("hex");
  return `${TOKEN_PREFIX}${rand}`;
}

/** Hash the cleartext for DB storage. SHA-256 hex — deterministic so we
 *  can look up by hash on the auth check. (We don't use bcrypt here
 *  because we need O(1) lookup on the intake endpoint, and the token
 *  itself has 128 bits of entropy.) */
export function hashLeadFormToken(cleartext: string): string {
  return crypto.createHash("sha256").update(cleartext).digest("hex");
}

/** Short display string the UI uses after the cleartext is no longer
 *  available — e.g. "lf_aBcD1234…". */
export function leadFormTokenPrefix(cleartext: string): string {
  return cleartext.slice(0, TOKEN_DISPLAY_PREFIX_LEN);
}

/** Tolerant Bearer-token extractor. Accepts either:
 *    Authorization: Bearer lf_xxx
 *    Authorization: Token lf_xxx
 *    Authorization: lf_xxx     (just the token)
 *  This is so the API is easy to use from Make.com modules, hand-rolled
 *  HTML forms, and curl, none of which agree on Bearer conventions. */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const trimmed = authHeader.trim();
  if (trimmed.startsWith("Bearer ") || trimmed.startsWith("bearer ")) {
    return trimmed.slice(7).trim() || null;
  }
  if (trimmed.startsWith("Token ") || trimmed.startsWith("token ")) {
    return trimmed.slice(6).trim() || null;
  }
  if (trimmed.startsWith(TOKEN_PREFIX)) return trimmed;
  return null;
}

/** Slugify a form name into url-safe identifier. */
export function slugifyFormName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "form"
  );
}
