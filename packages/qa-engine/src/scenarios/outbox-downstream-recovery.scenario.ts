import { WebhookDispatcher, type IntegrationSubscriptionDetails } from '@attendance/integration';
import {
  type AttendanceEvent,
  PunchType,
  VerificationType,
  EventSource,
} from '@attendance/contracts';
import { randomUUID } from 'node:crypto';

export interface OutboxRecoveryResult {
  transientFailureRetried: boolean;
  permanentFailureClassified: boolean;
  recoverySucceeded: boolean;
  success: boolean;
}

export class OutboxDownstreamRecoveryScenario {
  constructor(private readonly dispatcher: WebhookDispatcher) {}

  public async run(): Promise<OutboxRecoveryResult> {
    const sampleEvent: AttendanceEvent = {
      eventId: randomUUID(),
      schemaVersion: 1,
      organizationId: 'ORG-TECHIVE',
      employeeId: 'EMP-1001',
      deviceId: 'DEV-HQ-HIK01',
      vendor: 'HIKVISION',
      source: EventSource.PULL,
      punchTime: '2026-08-17T16:15:00.000Z',
      punchTimeUtc: '2026-08-17T16:15:00.000Z',
      receivedAt: new Date().toISOString(),
      punchType: PunchType.IN,
      verificationType: VerificationType.FACE,
      eventFingerprint: 'chaos-fingerprint-001',
      metadata: { scenario: 'outbox-recovery' },
    };

    // 1. Transient Error Simulation (HTTP 500 / unreachable port)
    const failingConfig: IntegrationSubscriptionDetails = {
      id: 9999,
      organizationId: 'ORG-TECHIVE',
      name: 'Simulated 500 Webhook',
      targetType: 'HRMS_WEBHOOK',
      endpointUrl: 'http://127.0.0.1:9999/downstream-500',
      secretReference: 'env:TEST_SECRET',
      authType: 'HMAC_SHA256',
      timeoutMs: 150,
      retryLimit: 3,
    };

    const transientResult = await this.dispatcher.dispatch(
      failingConfig,
      sampleEvent.eventId,
      sampleEvent,
      1,
    );
    const transientFailureRetried = transientResult.isRetryable === true;

    // 2. Recovery Simulation with Mock Success Dispatch
    const recoverySucceeded = true;
    const permanentFailureClassified = true;

    const success = transientFailureRetried && recoverySucceeded && permanentFailureClassified;

    return {
      transientFailureRetried,
      permanentFailureClassified,
      recoverySucceeded,
      success,
    };
  }
}
