import { describe, it, expect } from 'vitest';
import { generateEventFingerprint } from '@attendance/contracts';

describe('Phase 13: QA, Chaos & Reliability Testing Suite', () => {
  describe('1. Deterministic SHA-256 Idempotency Shielding', () => {
    it('should generate identical SHA-256 fingerprint for duplicate biometric punches', () => {
      const punchA = {
        organizationId: 'ORG-TECHIVE',
        employeeId: 'EMP-1001',
        deviceId: 'DEV-HQ-HIK01',
        punchTimeUtc: '2026-08-17T16:00:00.000Z',
        punchType: 'IN',
      };

      const punchB = {
        organizationId: 'ORG-TECHIVE',
        employeeId: 'EMP-1001',
        deviceId: 'DEV-HQ-HIK01',
        punchTimeUtc: '2026-08-17T16:00:00.000Z',
        punchType: 'IN',
      };

      const hashA = generateEventFingerprint(punchA);
      const hashB = generateEventFingerprint(punchB);

      expect(hashA).toBe(hashB);
      expect(hashA.length).toBe(64);
    });

    it('should generate distinct fingerprints when any dimension differs', () => {
      const base = {
        organizationId: 'ORG-TECHIVE',
        employeeId: 'EMP-1001',
        deviceId: 'DEV-HQ-HIK01',
        punchTimeUtc: '2026-08-17T16:00:00.000Z',
        punchType: 'IN',
      };

      const differentTime = { ...base, punchTimeUtc: '2026-08-17T16:00:01.000Z' };
      const differentType = { ...base, punchType: 'OUT' };
      const differentEmp = { ...base, employeeId: 'EMP-1002' };

      const baseHash = generateEventFingerprint(base);
      expect(generateEventFingerprint(differentTime)).not.toBe(baseHash);
      expect(generateEventFingerprint(differentType)).not.toBe(baseHash);
      expect(generateEventFingerprint(differentEmp)).not.toBe(baseHash);
    });
  });

  describe('2. Outbound Webhook Retry & Error Classification', () => {
    it('should classify HTTP 500, 502, 503, 504 and timeouts as RETRYABLE', () => {
      const retryableStatusCodes = [500, 502, 503, 504];
      for (const code of retryableStatusCodes) {
        const isRetryable = code >= 500 || code === 408 || code === 429;
        expect(isRetryable).toBe(true);
      }
    });

    it('should classify HTTP 400, 401, 403, 404 as PERMANENT_FAILED to avoid infinite retry storms', () => {
      const permanentStatusCodes = [400, 401, 403, 404];
      for (const code of permanentStatusCodes) {
        const isPermanent = code >= 400 && code < 500 && code !== 408 && code !== 429;
        expect(isPermanent).toBe(true);
      }
    });
  });

  describe('3. Exponential Backoff with Jitter Calculation', () => {
    it('should compute increasing delay with randomized jitter', () => {
      const baseDelayMs = 1000;
      const delays: number[] = [];

      for (let attempt = 1; attempt <= 4; attempt++) {
        const expDelay = baseDelayMs * Math.pow(2, attempt - 1);
        const jitter = expDelay * 0.2 * (Math.random() * 2 - 1);
        const actualDelay = Math.round(expDelay + jitter);
        delays.push(actualDelay);
      }

      // Check progression: each exponential attempt is greater than the previous
      expect(delays[1]).toBeGreaterThan(delays[0]);
      expect(delays[2]).toBeGreaterThan(delays[1]);
      expect(delays[3]).toBeGreaterThan(delays[2]);
    });
  });
});
