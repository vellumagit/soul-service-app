import "server-only";

// Password hashing for practitioner sign-in. Uses Node's built-in scrypt (a
// proper slow KDF) — no dependency, serverless-safe, and never stores or logs
// the plaintext. Stored format: `scrypt$N$r$p$saltB64$hashB64` so the params
// travel with the hash and can be upgraded later without a migration.

import {
  scrypt as scryptCb,
  randomBytes,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

// promisify infers the no-options overload; cast to the full signature so we
// can pass scrypt cost params (N/r/p/maxmem).
const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: ScryptOptions
) => Promise<Buffer>;

const N = 16384; // CPU/memory cost (2^14)
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024; // headroom above scrypt's default 32MB

/** Minimum acceptable password length. */
export const MIN_PASSWORD_LENGTH = 10;

/** Hash a plaintext password for storage. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(plain, salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  })) as Buffer;
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString(
    "base64"
  )}`;
}

/** Constant-time verify a plaintext against a stored hash. */
export async function verifyPassword(
  plain: string,
  stored: string | null | undefined
): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64");
    expected = Buffer.from(parts[5], "base64");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;
  let derived: Buffer;
  try {
    derived = (await scrypt(plain, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAXMEM,
    })) as Buffer;
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
