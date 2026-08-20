export class DomainError extends Error {
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    code: string = 'DOMAIN_ERROR',
    isOperational: boolean = true,
    details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NormalizationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'NORMALIZATION_ERROR', true, details);
  }
}

export class MappingNotFoundError extends DomainError {
  constructor(deviceId: string | number, vendorUserId: string) {
    super(
      `No HRMS employee mapping found for device '${deviceId}' and vendor user '${vendorUserId}'`,
      'MAPPING_NOT_FOUND',
      true,
      { deviceId, vendorUserId },
    );
  }
}

export class InvalidContractPayloadError extends DomainError {
  constructor(contractName: string, validationErrors: unknown) {
    super(
      `Validation failed for event contract '${contractName}'`,
      'INVALID_CONTRACT_PAYLOAD',
      true,
      validationErrors,
    );
  }
}

export class DuplicateEventError extends DomainError {
  constructor(eventFingerprint: string) {
    super(
      `Duplicate attendance event rejected with fingerprint '${eventFingerprint}'`,
      'DUPLICATE_EVENT',
      true,
      { eventFingerprint },
    );
  }
}

export class DeviceUnreachableError extends DomainError {
  constructor(deviceId: string | number, host?: string, port?: number) {
    super(
      `Device '${deviceId}' unreachable at ${host || 'unknown'}:${port || 'unknown'}`,
      'DEVICE_UNREACHABLE',
      true,
      { deviceId, host, port },
    );
  }
}

export class DeviceAuthenticationError extends DomainError {
  constructor(deviceId: string | number, reason: string = 'Invalid credentials') {
    super(
      `Authentication failed for device '${deviceId}': ${reason}`,
      'DEVICE_AUTH_ERROR',
      false, // Permanent error: do not retry blindly
      { deviceId, reason },
    );
  }
}

export class IntegrationDeliveryError extends DomainError {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number, details?: unknown) {
    super(message, 'INTEGRATION_DELIVERY_ERROR', true, details);
    this.statusCode = statusCode;
  }
}
