import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Minimal, dependency-free HS256 JWT sign/verify using Node's crypto.
 * Enough for first-party auth; no external jsonwebtoken dependency.
 */

export interface JwtPayload {
  sub: number; // user id
  email: string;
  iat: number;
  exp: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlJson(obj: unknown): string {
  return base64url(JSON.stringify(obj));
}

function sign(input: string, secret: string): string {
  return base64url(createHmac('sha256', secret).update(input).digest());
}

export function signJwt(
  payload: { sub: number; email: string },
  secret: string,
  expiresInSeconds: number,
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: JwtPayload = {
    sub: payload.sub,
    email: payload.email,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const header = base64urlJson({ alg: 'HS256', typ: 'JWT' });
  const body = base64urlJson(full);
  const signingInput = `${header}.${body}`;
  return `${signingInput}.${sign(signingInput, secret)}`;
}

/**
 * Verifies a token's signature and expiry. Returns the payload or null.
 */
export function verifyJwt(token: string, secret: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts as [string, string, string];
    const expected = sign(`${header}.${body}`, secret);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64').toString('utf8')) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}
