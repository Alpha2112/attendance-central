import crypto from 'node:crypto';

export interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  algorithm?: string;
  opaque?: string;
}

export interface DigestAuthParams {
  username: string;
  password: string;
  method: string;
  uri: string;
  nc?: number;
  cnonce?: string;
}

/**
 * Parses HTTP WWW-Authenticate header challenge parameters.
 */
export function parseDigestChallenge(header: string): DigestChallenge | null {
  if (!header || !header.toLowerCase().startsWith('digest')) {
    return null;
  }

  const params: Record<string, string> = {};
  const rawParams = header.substring(6).trim();

  // Match key="value" or key=value
  const regex = /(\w+)=(?:"([^"]+)"|([^,]+))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawParams)) !== null) {
    const key = match[1]?.toLowerCase();
    const value = match[2] ?? match[3]?.trim();
    if (key && value !== undefined) {
      params[key] = value;
    }
  }

  if (!params['realm'] || !params['nonce']) {
    return null;
  }

  return {
    realm: params['realm'],
    nonce: params['nonce'],
    qop: params['qop'],
    algorithm: params['algorithm']?.toUpperCase() || 'MD5',
    opaque: params['opaque'],
  };
}

/**
 * Computes MD5/SHA256 Digest Authorization header value according to RFC 7616.
 */
export function generateDigestHeader(challenge: DigestChallenge, auth: DigestAuthParams): string {
  const nc = (auth.nc ?? 1).toString(16).padStart(8, '0');
  const cnonce = auth.cnonce || crypto.randomBytes(8).toString('hex');
  const algorithm = challenge.algorithm || 'MD5';

  const hash = (data: string): string => {
    if (algorithm === 'SHA-256') {
      return crypto.createHash('sha256').update(data).digest('hex');
    }
    return crypto.createHash('md5').update(data).digest('hex');
  };

  // HA1 = H(username : realm : password)
  const ha1 = hash(`${auth.username}:${challenge.realm}:${auth.password}`);

  // HA2 = H(method : digestURI)
  const ha2 = hash(`${auth.method.toUpperCase()}:${auth.uri}`);

  let response: string;

  if (challenge.qop && challenge.qop.toLowerCase().includes('auth')) {
    // response = H(HA1 : nonce : nc : cnonce : qop : HA2)
    response = hash(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`);
  } else {
    // legacy response = H(HA1 : nonce : HA2)
    response = hash(`${ha1}:${challenge.nonce}:${ha2}`);
  }

  const parts = [
    `username="${auth.username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${auth.uri}"`,
    `response="${response}"`,
    `algorithm="${algorithm}"`,
  ];

  if (challenge.qop) {
    parts.push(`qop=auth`);
    parts.push(`nc=${nc}`);
    parts.push(`cnonce="${cnonce}"`);
  }

  if (challenge.opaque) {
    parts.push(`opaque="${challenge.opaque}"`);
  }

  return `Digest ${parts.join(', ')}`;
}

/**
 * Builds standard Basic Authentication header.
 */
export function generateBasicHeader(username: string, password: string): string {
  const creds = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${creds}`;
}
