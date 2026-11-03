import { status as GrpcStatus } from '@grpc/grpc-js';
import { SupremaErrorCategory } from '../types/gsdk.types.js';

export interface ClassifiedSupremaError {
  category: SupremaErrorCategory;
  isRetryable: boolean;
  message: string;
  /** gRPC status code when the error originated from a gateway call. */
  code?: number;
  originalError?: Error;
}

/** gRPC status codes that are safe to retry with backoff. */
const RETRYABLE_CODES: ReadonlySet<number> = new Set<number>([
  GrpcStatus.UNAVAILABLE,
  GrpcStatus.DEADLINE_EXCEEDED,
  GrpcStatus.ABORTED,
  GrpcStatus.RESOURCE_EXHAUSTED,
]);

/** gRPC status codes that will keep failing until an operator fixes something. */
const PERMANENT_CODES: ReadonlySet<number> = new Set<number>([
  GrpcStatus.UNAUTHENTICATED,
  GrpcStatus.PERMISSION_DENIED,
  GrpcStatus.INVALID_ARGUMENT,
  GrpcStatus.UNIMPLEMENTED,
  GrpcStatus.NOT_FOUND,
  GrpcStatus.FAILED_PRECONDITION,
]);

function extractCode(error: unknown, explicit?: number): number | undefined {
  if (typeof explicit === 'number') return explicit;
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'number') return code;
  }
  return undefined;
}

/**
 * Classifies Suprema G-SDK gateway errors (gRPC status codes and socket errors)
 * into deterministic retry categories.
 */
export function classifySupremaError(error: unknown, statusCode?: number): ClassifiedSupremaError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const code = extractCode(error, statusCode);
  const originalError = error instanceof Error ? error : undefined;

  // 1. Classify by gRPC status code when available.
  if (code !== undefined) {
    if (PERMANENT_CODES.has(code)) {
      return {
        category: SupremaErrorCategory.PERMANENT,
        isRetryable: false,
        message,
        code,
        originalError,
      };
    }
    if (RETRYABLE_CODES.has(code)) {
      return {
        category: SupremaErrorCategory.TRANSIENT,
        isRetryable: true,
        message,
        code,
        originalError,
      };
    }
  }

  // 2. Authentication / permission wording (e.g. legacy 401).
  if (
    lower.includes('unauthenticated') ||
    lower.includes('unauthorized') ||
    lower.includes('permission denied') ||
    lower.includes('invalid credential') ||
    lower.includes('session expired') ||
    code === 401 ||
    code === 403
  ) {
    return {
      category: SupremaErrorCategory.PERMANENT,
      isRetryable: false,
      message,
      code,
      originalError,
    };
  }

  // 3. Hardware / device-link wording.
  if (
    lower.includes('not connected') ||
    lower.includes('device disconnected') ||
    lower.includes('cannot connect to the device') ||
    lower.includes('device locked') ||
    lower.includes('memory') ||
    lower.includes('storage full')
  ) {
    return {
      category: SupremaErrorCategory.HARDWARE,
      isRetryable: false,
      message,
      code,
      originalError,
    };
  }

  // 4. Default: transient socket/network issues are retryable.
  return {
    category: SupremaErrorCategory.TRANSIENT,
    isRetryable: true,
    message,
    code,
    originalError,
  };
}
