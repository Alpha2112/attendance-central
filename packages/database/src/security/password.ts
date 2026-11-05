import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const KEYLEN = 64;
const COST = 16384; // scrypt N
const BLOCK = 8; // scrypt r
const PARALLEL = 1; // scrypt p
// scrypt needs maxmem >= 128 * N * r; raise it so non-default N/r never throw.
const MAXMEM = 64 * 1024 * 1024;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Hashes a plaintext password with scrypt (Node built-in — no native deps).
 * Format: scrypt$N$r$p$saltHex$hashHex — self-describing so params can evolve.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(plain, salt, KEYLEN, {
    N: COST,
    r: BLOCK,
    p: PARALLEL,
    maxmem: MAXMEM,
  });
  return `scrypt$${COST}$${BLOCK}$${PARALLEL}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored scrypt hash. Constant-time.
 * Returns false (never throws) on any malformed/unknown hash.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4]!, 'hex');
    const expected = Buffer.from(parts[5]!, 'hex');
    const derived = await scryptAsync(plain, salt, expected.length, { N, r, p, maxmem: MAXMEM });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
