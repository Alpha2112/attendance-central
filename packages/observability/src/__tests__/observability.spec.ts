import { describe, it, expect } from 'vitest';
import { timeExecution, ObservabilityContext } from '../index.js';

describe('Observability Package', () => {
  it('should measure execution time accurately', async () => {
    const { result, durationMs } = await timeExecution(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 42;
    });

    expect(result).toBe(42);
    expect(durationMs).toBeGreaterThanOrEqual(40);
  });

  it('should manage async request context', () => {
    const correlationId = 'corr-abc-xyz';
    ObservabilityContext.run({ correlationId, tenantId: 'tenant-1' }, () => {
      const current = ObservabilityContext.get();
      expect(current?.correlationId).toBe(correlationId);
      expect(current?.tenantId).toBe('tenant-1');
      expect(ObservabilityContext.getCorrelationId()).toBe(correlationId);
    });

    expect(ObservabilityContext.get()).toBeUndefined();
  });
});
