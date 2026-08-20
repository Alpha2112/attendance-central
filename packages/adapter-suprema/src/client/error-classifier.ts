import { SupremaErrorCategory } from '../types/biostar.types.js';

export interface ClassifiedSupremaError {
  category: SupremaErrorCategory;
  isRetryable: boolean;
  message: string;
  statusCode?: number;
  originalError?: Error;
}

/**
 * Classifies BioStar HTTP status codes and low-level socket errors into deterministic categories.
 */
export function classifySupremaError(error: unknown, statusCode?: number): ClassifiedSupremaError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  // 1. Authentication / Permission errors
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    lower.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('session expired')
  ) {
    return {
      category: SupremaErrorCategory.PERMANENT,
      isRetryable: false,
      statusCode: statusCode ?? 401,
      message: `BioStar 2 Authentication failed: Invalid credentials or expired session (${message})`,
      originalError: error instanceof Error ? error : undefined,
    };
  }

  // 2. Hardware / Memory errors
  if (
    lower.includes('storage full') ||
    lower.includes('memory error') ||
    lower.includes('device disconnected') ||
    lower.includes('device locked')
  ) {
    return {
      category: SupremaErrorCategory.HARDWARE,
      isRetryable: false,
      statusCode,
      message,
      originalError: error instanceof Error ? error : undefined,
    };
  }

  // 3. Transient network / server errors
  return {
    category: SupremaErrorCategory.TRANSIENT,
    isRetryable: true,
    statusCode,
    message,
    originalError: error instanceof Error ? error : undefined,
  };
}
