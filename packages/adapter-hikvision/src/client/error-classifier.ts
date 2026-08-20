import { HikvisionErrorCategory } from '../types/isapi.types.js';

export interface ClassifiedHikvisionError {
  category: HikvisionErrorCategory;
  isRetryable: boolean;
  message: string;
  statusCode?: number;
  originalError?: Error;
}

/**
 * Classifies HTTP status codes and low-level ISAPI socket errors into deterministic categories.
 */
export function classifyHikvisionError(
  error: unknown,
  statusCode?: number,
): ClassifiedHikvisionError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  // 1. HTTP 401 / 403 Authentication / Authorization failure
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    lower.includes('401') ||
    lower.includes('unauthorized')
  ) {
    return {
      category: HikvisionErrorCategory.PERMANENT,
      isRetryable: false,
      statusCode: statusCode ?? 401,
      message: `Hikvision ISAPI Authentication failed: Invalid username or password (${message})`,
      originalError: error instanceof Error ? error : undefined,
    };
  }

  // 2. Hardware / Memory errors
  if (
    lower.includes('storage full') ||
    lower.includes('device locked') ||
    lower.includes('memory error') ||
    lower.includes('device is busy')
  ) {
    return {
      category: HikvisionErrorCategory.HARDWARE,
      isRetryable: false,
      statusCode,
      message,
      originalError: error instanceof Error ? error : undefined,
    };
  }

  // 3. Transient network / timeout / server 5xx errors
  return {
    category: HikvisionErrorCategory.TRANSIENT,
    isRetryable: true,
    statusCode,
    message,
    originalError: error instanceof Error ? error : undefined,
  };
}
