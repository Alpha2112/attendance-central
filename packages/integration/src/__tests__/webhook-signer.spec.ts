import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { WebhookSigner } from '../webhook/webhook-signer.js';

describe('WebhookSigner', () => {
  const signer = new WebhookSigner('test-master-key');
  const timestamp = '1723800000000';
  const body = JSON.stringify({ eventId: 'evt-1', employeeId: 'EMP-7', punchType: 'IN' });

  describe('HMAC-SHA256', () => {
    it('produces an sha256= header that a receiver can recompute from the shown key', () => {
      const { header, algorithm } = signer.sign(42, 'HMAC_SHA256', body, timestamp);
      expect(algorithm).toBe('HMAC_SHA256');
      expect(header.startsWith('sha256=')).toBe(true);

      // A receiver configured with the key from the detail view must get the same value.
      const key = signer.hmacSecret(42);
      const expected =
        'sha256=' + crypto.createHmac('sha256', key).update(`${timestamp}.${body}`).digest('hex');
      expect(header).toBe(expected);
    });

    it('defaults to HMAC when the auth type is unknown or omitted', () => {
      expect(signer.sign(1, undefined, body, timestamp).algorithm).toBe('HMAC_SHA256');
      expect(signer.sign(1, 'SOMETHING', body, timestamp).algorithm).toBe('HMAC_SHA256');
    });

    it('derives a distinct key per integration id, deterministically', () => {
      expect(signer.hmacSecret(1)).toBe(signer.hmacSecret(1));
      expect(signer.hmacSecret(1)).not.toBe(signer.hmacSecret(2));
    });
  });

  describe('Ed25519', () => {
    it('produces an ed25519= signature that verifies against the derived public key', () => {
      const { header, algorithm } = signer.sign(99, 'ED25519', body, timestamp);
      expect(algorithm).toBe('ED25519');
      expect(header.startsWith('ed25519=')).toBe(true);

      const sig = Buffer.from(header.replace('ed25519=', ''), 'base64');
      const { pem } = signer.ed25519PublicKey(99);
      const ok = crypto.verify(null, Buffer.from(`${timestamp}.${body}`), pem, sig);
      expect(ok).toBe(true);
    });

    it('rejects a signature from a different integration (key separation)', () => {
      const { header } = signer.sign(99, 'ED25519', body, timestamp);
      const sig = Buffer.from(header.replace('ed25519=', ''), 'base64');
      const { pem: otherPem } = signer.ed25519PublicKey(100);
      const ok = crypto.verify(null, Buffer.from(`${timestamp}.${body}`), otherPem, sig);
      expect(ok).toBe(false);
    });

    it('derives the keypair deterministically and never requires storage', () => {
      expect(signer.ed25519PublicKey(99).base64).toBe(signer.ed25519PublicKey(99).base64);
      expect(signer.ed25519PublicKey(99).base64).not.toBe(signer.ed25519PublicKey(100).base64);
    });
  });
});
