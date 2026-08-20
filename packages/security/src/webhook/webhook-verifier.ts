import crypto from 'node:crypto';

export interface WebhookVerificationOptions {
  maxDriftSeconds?: number;
}

export class WebhookVerifier {
  /**
   * Verifies incoming webhook HMAC SHA-256 signature and validates timestamp against replay attacks.
   */
  public static verify(
    payload: string,
    signature: string,
    timestamp: string,
    secret: string,
    options: WebhookVerificationOptions = {},
  ): { valid: boolean; error?: string } {
    if (!signature || !timestamp || !secret) {
      return { valid: false, error: 'Missing required signature, timestamp, or secret' };
    }

    // 1. Replay attack check: validate timestamp drift
    const maxDriftMs = (options.maxDriftSeconds ?? 300) * 1000;
    const requestTime = parseInt(timestamp, 10);

    if (isNaN(requestTime)) {
      return { valid: false, error: 'Malformed timestamp header' };
    }

    const drift = Math.abs(Date.now() - requestTime);
    if (drift > maxDriftMs) {
      return {
        valid: false,
        error: `Replay attack protection: Timestamp skew ${Math.round(drift / 1000)}s exceeds allowable limit of ${maxDriftMs / 1000}s`,
      };
    }

    // 2. Compute expected HMAC SHA-256 signature
    const signedData = `${timestamp}.${payload}`;
    const expectedHash = crypto.createHmac('sha256', secret).update(signedData).digest('hex');
    const expectedSignature = `sha256=${expectedHash}`;

    // 3. Timing-safe comparison
    const sigBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');

    if (sigBuf.length !== expectedBuf.length) {
      return { valid: false, error: 'Invalid signature length or format' };
    }

    const isMatch = crypto.timingSafeEqual(sigBuf, expectedBuf);
    if (!isMatch) {
      return { valid: false, error: 'Cryptographic signature mismatch' };
    }

    return { valid: true };
  }
}
