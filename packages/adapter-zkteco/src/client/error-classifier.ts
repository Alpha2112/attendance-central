import { ZKErrorCategory } from '../types/zkteco.types.js';

export interface ClassifiedZKError {
  category: ZKErrorCategory;
  isRetryable: boolean;
  message: string;
  originalError?: Error;
}

/**
 * Classifies low-level network and ZKTeco protocol errors into deterministic operational categories.
 */
export function classifyZKError(error: unknown): ClassifiedZKError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  // 1. Permanent / Authentication / Protocol format errors
  if (
    lower.includes('unauthorized') ||
    lower.includes('unauth') ||
    lower.includes('invalid commkey') ||
    lower.includes('authentication failed') ||
    lower.includes('unsupported protocol')
  ) {
    return {
      category: ZKErrorCategory.PERMANENT,
      isRetryable: false,
      message,
      originalError: error instanceof Error ? error : undefined,
    };
  }

  // 2. Hardware / Memory errors
  if (
    lower.includes('buffer overflow') ||
    lower.includes('memory full') ||
    lower.includes('storage full') ||
    lower.includes('device locked')
  ) {
    return {
      category: ZKErrorCategory.HARDWARE,
      isRetryable: false,
      message,
      originalError: error instanceof Error ? error : undefined,
    };
  }

  // 3. Transient network / socket errors (default for timeouts and drops)
  return {
    category: ZKErrorCategory.TRANSIENT,
    isRetryable: true,
    message,
    originalError: error instanceof Error ? error : undefined,
  };
}
