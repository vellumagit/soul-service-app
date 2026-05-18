// AES-256-GCM encryption for OAuth tokens at rest.
//
// Ciphertext wire format: v1:<iv b64>:<auth tag b64>:<ciphertext b64>
// The v1: prefix gates the format so we can rotate algorithms later AND
// detect legacy plaintext rows during the migration window. If a stored
// value doesn't carry the v1: prefix it's read back as-is — that lets us
// roll this out without breaking existing connections; the next token
// refresh / reconnect upgrades the row to ciphertext.
//
// Key: TOKEN_ENCRYPTION_KEY env var, base64-encoded 32 bytes.
// Generate with:
//   node -e "console.log('base64:' + require('crypto').randomBytes(32).toString('base64'))"
//
// If the key is missing, encryption is a no-op (returns the plaintext).
// This keeps the build green for setups that haven't generated the key yet —
// but in production WITHOUT the key the tokens stay readable to anyone with
// DB access. The Status page surfaces this so it's obvious.
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;

let cachedKey: Buffer | null | undefined;

/** Returns the decoded encryption key, or null if not configured. */
function getKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    cachedKey = null;
    return null;
  }
  const b64 = raw.startsWith("base64:") ? raw.slice("base64:".length) : raw;
  let key: Buffer;
  try {
    key = Buffer.from(b64, "base64");
  } catch {
    throw new Error("TOKEN_ENCRYPTION_KEY is not valid base64");
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes, got ${key.length}`
    );
  }
  cachedKey = key;
  return key;
}

/** True if a stored value is in our encrypted wire format. */
function isCiphertext(value: string): boolean {
  return value.startsWith(`${VERSION}:`) && value.split(":").length === 4;
}

/** Encrypt a token for DB storage. Passes through unchanged if no key is set
 *  (Brian hasn't generated TOKEN_ENCRYPTION_KEY yet) — the value is still in
 *  the same column shape, just plaintext, and `decryptToken` handles that. */
export function encryptToken(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === "") return null;
  const key = getKey();
  if (!key) return plaintext;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/** Decrypt a stored token. Plaintext (legacy) values pass through unchanged,
 *  so this is safe to call on rows from before encryption was rolled out. */
export function decryptToken(stored: string | null | undefined): string | null {
  if (stored == null || stored === "") return null;
  if (!isCiphertext(stored)) {
    // Legacy plaintext row from before encryption was enabled. Return as-is;
    // the next write path will upgrade it to ciphertext.
    return stored;
  }
  const key = getKey();
  if (!key) {
    // We have ciphertext but no key — something's misconfigured. Throw rather
    // than return garbage. The caller's catch will surface this clearly.
    throw new Error(
      "Stored value is encrypted but TOKEN_ENCRYPTION_KEY is not set. " +
        "Add the key that was used when these tokens were saved."
    );
  }
  const [, ivB64, tagB64, dataB64] = stored.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

/** True iff TOKEN_ENCRYPTION_KEY is configured. The Status page surfaces this
 *  so the practitioner can tell at a glance whether tokens are encrypted. */
export function isTokenEncryptionConfigured(): boolean {
  return getKey() !== null;
}
