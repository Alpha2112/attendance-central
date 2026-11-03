import crypto from 'node:crypto';

export type WebhookSigningAlgorithm = 'HMAC_SHA256' | 'ED25519';

export interface WebhookSignature {
  /** Value for the `X-Attendance-Signature` header, e.g. `sha256=...` or `ed25519=...`. */
  header: string;
  algorithm: WebhookSigningAlgorithm;
}

export interface Ed25519PublicKeyMaterial {
  /** PEM-encoded SPKI public key the receiver uses to verify Ed25519 signatures. */
  pem: string;
  /** Base64 of the raw 32-byte Ed25519 public key. */
  base64: string;
}

const DEFAULT_MASTER_KEY = 'techive-dev-webhook-master-key-change-me';

// PKCS#8 prefix for a raw 32-byte Ed25519 private seed (RFC 8410).
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/**
 * Derives per-integration webhook signing material from a single master key and
 * signs outbound payloads. Nothing is ever persisted: every key is recomputable
 * on demand from `WEBHOOK_SIGNING_MASTER_KEY`, so the key shown to operators is
 * exactly the key used to sign real deliveries (honors ADR-007 / AGENTS.md §7).
 *
 * The signed content is always `${timestamp}.${rawBody}`.
 */
export class WebhookSigner {
  private readonly masterKey: string;

  constructor(masterKey?: string) {
    this.masterKey = masterKey || process.env['WEBHOOK_SIGNING_MASTER_KEY'] || DEFAULT_MASTER_KEY;
  }

  /** Hex HMAC-SHA256 secret for an integration (shared secret the receiver also holds). */
  public hmacSecret(integrationId: number): string {
    return crypto
      .createHmac('sha256', this.masterKey)
      .update(`webhook:integration:${integrationId}`)
      .digest('hex');
  }

  /** Deterministic Ed25519 private key for an integration, derived from a seed. */
  public ed25519PrivateKey(integrationId: number): crypto.KeyObject {
    const seed = crypto
      .createHmac('sha256', this.masterKey)
      .update(`webhook:ed25519:${integrationId}`)
      .digest(); // 32 bytes
    const der = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
    return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  }

  /** Public key material for an integration's Ed25519 keypair (safe to share). */
  public ed25519PublicKey(integrationId: number): Ed25519PublicKeyMaterial {
    const pub = crypto.createPublicKey(this.ed25519PrivateKey(integrationId));
    const pem = pub.export({ format: 'pem', type: 'spki' }).toString();
    const der = pub.export({ format: 'der', type: 'spki' });
    // The raw 32-byte key is the trailing bytes of the SPKI DER encoding.
    const base64 = der.subarray(der.length - 32).toString('base64');
    return { pem, base64 };
  }

  private normalizeAlgorithm(authType: string | undefined): WebhookSigningAlgorithm {
    return (authType || '').toUpperCase() === 'ED25519' ? 'ED25519' : 'HMAC_SHA256';
  }

  /** Signs `${timestamp}.${payload}` for the integration using the requested algorithm. */
  public sign(
    integrationId: number,
    authType: string | undefined,
    payload: string,
    timestamp: string,
  ): WebhookSignature {
    const algorithm = this.normalizeAlgorithm(authType);
    const signedContent = `${timestamp}.${payload}`;

    if (algorithm === 'ED25519') {
      const signature = crypto
        .sign(null, Buffer.from(signedContent), this.ed25519PrivateKey(integrationId))
        .toString('base64');
      return { header: `ed25519=${signature}`, algorithm };
    }

    const hmac = crypto
      .createHmac('sha256', this.hmacSecret(integrationId))
      .update(signedContent)
      .digest('hex');
    return { header: `sha256=${hmac}`, algorithm };
  }
}
