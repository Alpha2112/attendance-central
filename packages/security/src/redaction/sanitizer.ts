const SENSITIVE_KEYS = new Set([
  'password',
  'pass',
  'secret',
  'token',
  'commkey',
  'authorization',
  'cookie',
  'bs-session-id',
  'privatekey',
  'apikey',
  'clientsecret',
  'client_secret',
  'secret_reference',
]);

export class CredentialSanitizer {
  /**
   * Recursively sanitizes sensitive credential fields from any object or array.
   */
  public static sanitize<T>(input: T): T {
    if (input === null || input === undefined) {
      return input;
    }

    if (typeof input === 'string') {
      return input as T;
    }

    if (Array.isArray(input)) {
      return input.map((item) => this.sanitize(item)) as unknown as T;
    }

    if (typeof input === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase();
        if (SENSITIVE_KEYS.has(lowerKey)) {
          result[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          result[key] = this.sanitize(value);
        } else {
          result[key] = value;
        }
      }
      return result as T;
    }

    return input;
  }
}
