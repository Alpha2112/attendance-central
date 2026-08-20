import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  RbacGuard,
  UserRole,
  Permission,
  type SecurityContext,
  DefaultSecretProvider,
  CredentialSanitizer,
  WebhookVerifier,
  MachineAuthService,
  RateLimiter,
} from '../index.js';

describe('Platform Security, Hardening & Compliance Suite', () => {
  describe('1. Multi-Tenant Isolation & Cross-Organization Access Denial', () => {
    const orgAContext: SecurityContext = {
      actorId: 'usr-org-a-101',
      actorType: 'USER',
      organizationId: 'ORG-ACME',
      roles: [UserRole.ORG_ADMIN],
    };

    const platformAdminContext: SecurityContext = {
      actorId: 'sys-super-admin',
      actorType: 'USER',
      organizationId: 'PLATFORM-HQ',
      roles: [UserRole.PLATFORM_ADMIN],
    };

    it('should allow access when actor belongs to target organization', () => {
      expect(() => {
        RbacGuard.assertTenantAccess(orgAContext, 'ORG-ACME');
      }).not.toThrow();
    });

    it('should strictly DENY cross-organization data access with error', () => {
      expect(() => {
        RbacGuard.assertTenantAccess(orgAContext, 'ORG-RIVAL');
      }).toThrow(/Cross-Organization Access Denied/);
    });

    it('should permit platform administrators cross-organization access', () => {
      expect(() => {
        RbacGuard.assertTenantAccess(platformAdminContext, 'ORG-RIVAL');
      }).not.toThrow();
    });
  });

  describe('2. Role-Based Access Control (RBAC) Permission Matrix', () => {
    it('should grant full permissions to PLATFORM_ADMIN', () => {
      const adminCtx: SecurityContext = {
        actorId: 'admin-1',
        actorType: 'USER',
        organizationId: 'ORG-1',
        roles: [UserRole.PLATFORM_ADMIN],
      };

      expect(RbacGuard.hasPermission(adminCtx, Permission.SYSTEM_ADMIN)).toBe(true);
      expect(RbacGuard.hasPermission(adminCtx, Permission.DEVICES_WRITE)).toBe(true);
      expect(RbacGuard.hasPermission(adminCtx, Permission.INTEGRATIONS_WRITE)).toBe(true);
    });

    it('should restrict OPERATOR from administrative system changes', () => {
      const operatorCtx: SecurityContext = {
        actorId: 'op-1',
        actorType: 'USER',
        organizationId: 'ORG-1',
        roles: [UserRole.OPERATOR],
      };

      expect(RbacGuard.hasPermission(operatorCtx, Permission.DEVICES_READ)).toBe(true);
      expect(RbacGuard.hasPermission(operatorCtx, Permission.DEVICES_SYNC)).toBe(true);
      expect(RbacGuard.hasPermission(operatorCtx, Permission.SYSTEM_ADMIN)).toBe(false);
      expect(RbacGuard.hasPermission(operatorCtx, Permission.INTEGRATIONS_WRITE)).toBe(false);
    });

    it('should restrict INTEGRATION_RO to read-only attendance access', () => {
      const roCtx: SecurityContext = {
        actorId: 'api-feeder',
        actorType: 'API_CLIENT',
        organizationId: 'ORG-1',
        roles: [UserRole.INTEGRATION_RO],
      };

      expect(RbacGuard.hasPermission(roCtx, Permission.ATTENDANCE_READ)).toBe(true);
      expect(RbacGuard.hasPermission(roCtx, Permission.DEVICES_WRITE)).toBe(false);
    });
  });

  describe('3. Zero-Plaintext Secret Provider & Masking', () => {
    const provider = new DefaultSecretProvider();

    it('should resolve environment secret references dynamically', async () => {
      process.env['TEST_WEBHOOK_KEY'] = 'live-webhook-signature-secret-9988';
      const resolved = await provider.resolveSecret('env:TEST_WEBHOOK_KEY');
      expect(resolved).toBe('live-webhook-signature-secret-9988');
    });

    it('should identify secret references vs raw plaintext', () => {
      expect(provider.isSecretReference('env:MY_SECRET')).toBe(true);
      expect(provider.isSecretReference('vault:secret/data/hikvision#password')).toBe(true);
      expect(provider.isSecretReference('plaintextPassword123')).toBe(false);
    });

    it('should mask sensitive credential strings', () => {
      const masked = provider.maskSecret('super-secret-hik-password');
      expect(masked.startsWith('su')).toBe(true);
      expect(masked.endsWith('rd')).toBe(true);
      expect(masked).toContain('****');
      expect(masked).not.toContain('hik-password');
    });
  });

  describe('4. Deep Log & Credential Redaction', () => {
    it('should redact sensitive keys across nested objects and arrays', () => {
      const input = {
        deviceId: 'DEV-HQ-01',
        auth: {
          username: 'admin',
          password: 'SecretPassword123',
          commKey: '12345',
        },
        tokens: ['public-token', { token: 'jwt-secret-xyz' }],
      };

      const sanitized = CredentialSanitizer.sanitize(input);

      expect(sanitized.deviceId).toBe('DEV-HQ-01');
      expect(sanitized.auth.username).toBe('admin');
      expect(sanitized.auth.password).toBe('[REDACTED]');
      expect(sanitized.auth.commKey).toBe('[REDACTED]');
      expect(sanitized.tokens[1].token).toBe('[REDACTED]');
    });
  });

  describe('5. Webhook HMAC SHA-256 Signatures & Replay Protection', () => {
    const secret = 'enterprise-webhook-signing-secret-key';
    const payload = JSON.stringify({ eventId: 'evt-991', employeeId: 'EMP-1001', status: 'IN' });

    it('should verify valid HMAC SHA-256 signature with current timestamp', () => {
      const timestamp = Date.now().toString();
      const signedData = `${timestamp}.${payload}`;
      const signature = `sha256=${crypto.createHmac('sha256', secret).update(signedData).digest('hex')}`;

      const result = WebhookVerifier.verify(payload, signature, timestamp, secret);
      expect(result.valid).toBe(true);
    });

    it('should reject tampered payload', () => {
      const timestamp = Date.now().toString();
      const signedData = `${timestamp}.${payload}`;
      const signature = `sha256=${crypto.createHmac('sha256', secret).update(signedData).digest('hex')}`;

      const tamperedPayload = JSON.stringify({
        eventId: 'evt-991',
        employeeId: 'EMP-666',
        status: 'IN',
      });
      const result = WebhookVerifier.verify(tamperedPayload, signature, timestamp, secret);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('signature mismatch');
    });

    it('should reject replay attacks with stale timestamps (> 5 minutes)', () => {
      const staleTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes ago
      const signedData = `${staleTimestamp}.${payload}`;
      const signature = `sha256=${crypto.createHmac('sha256', secret).update(signedData).digest('hex')}`;

      const result = WebhookVerifier.verify(payload, signature, staleTimestamp, secret);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Replay attack protection');
    });
  });

  describe('6. Machine-to-Machine Authentication', () => {
    const authService = new MachineAuthService();

    it('should verify matching machine client credentials', async () => {
      const context = await authService.authenticateClient('client-test', 'secret-test-123');
      expect(context).not.toBeNull();
      expect(context?.actorType).toBe('API_CLIENT');
      expect(context?.roles).toContain(UserRole.INTEGRATION_RO);
    });

    it('should reject unknown client credentials', async () => {
      const context = await authService.authenticateClient('unknown-client', 'wrong-pass');
      expect(context).toBeNull();
    });
  });

  describe('7. Sliding-Window Rate Limiter', () => {
    const limiter = new RateLimiter();

    it('should consume tokens within threshold', async () => {
      const result = await limiter.consume('ip:192.168.1.5', 50, 60);
      expect(result.allowed).toBe(true);
      expect(result.totalTokens).toBe(50);
    });
  });
});
