import { describe, it, expect } from 'vitest';
import {
  createLogger,
  createChildLogger,
  NestPinoLoggerAdapter,
  DEFAULT_REDACT_PATHS,
} from '../index.js';

describe('Logging Package', () => {
  it('should instantiate a structured logger with defaults', () => {
    const logger = createLogger({
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      level: 'debug',
      isDevelopment: false,
    });
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('should create child loggers with context', () => {
    const parent = createLogger({
      serviceName: 'test-service',
      isDevelopment: false,
    });
    const child = createChildLogger(parent, {
      correlationId: 'corr-12345',
      deviceId: 'DEV-001',
    });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });

  it('should include sensitive fields in redaction configuration', () => {
    expect(DEFAULT_REDACT_PATHS).toContain('password');
    expect(DEFAULT_REDACT_PATHS).toContain('token');
    expect(DEFAULT_REDACT_PATHS).toContain('authorization');
    expect(DEFAULT_REDACT_PATHS).toContain('communicationKey');
  });

  it('should adapt to NestJS LoggerService interface', () => {
    const logger = createLogger({
      serviceName: 'test-nest',
      isDevelopment: false,
    });
    const adapter = new NestPinoLoggerAdapter(logger);
    expect(typeof adapter.log).toBe('function');
    expect(typeof adapter.error).toBe('function');
    expect(typeof adapter.warn).toBe('function');
    expect(typeof adapter.debug).toBe('function');
  });
});
