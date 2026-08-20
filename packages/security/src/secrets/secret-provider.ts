import fs from 'node:fs';

export interface SecretProvider {
  resolveSecret(secretReference: string): Promise<string | null>;
  isSecretReference(value: string): boolean;
  maskSecret(secret: string): string;
}

export class DefaultSecretProvider implements SecretProvider {
  /**
   * Resolves a secret reference string dynamically.
   * Format:
   *  - env:VARIABLE_NAME
   *  - file:/path/to/secret
   *  - literal:RAW_VALUE (discouraged, for test only)
   */
  public async resolveSecret(secretReference: string): Promise<string | null> {
    if (!secretReference) return null;

    const trimmed = secretReference.trim();

    if (trimmed.startsWith('env:')) {
      const envKey = trimmed.substring(4);
      return process.env[envKey] ?? null;
    }

    if (trimmed.startsWith('file:')) {
      const filePath = trimmed.substring(5);
      try {
        if (fs.existsSync(filePath)) {
          return fs.readFileSync(filePath, 'utf8').trim();
        }
      } catch {
        return null;
      }
      return null;
    }

    if (trimmed.startsWith('literal:')) {
      return trimmed.substring(8);
    }

    // Default fallback if no prefix provided
    return process.env[trimmed] ?? trimmed;
  }

  /**
   * Determines if a string is a secure secret reference rather than plaintext.
   */
  public isSecretReference(value: string): boolean {
    if (!value || typeof value !== 'string') return false;
    return (
      value.startsWith('env:') ||
      value.startsWith('file:') ||
      value.startsWith('vault:') ||
      value.startsWith('aws-secrets:')
    );
  }

  /**
   * Masks sensitive credentials for audit/log display.
   * e.g., 'super-secret-key-123' -> 'su***23'
   */
  public maskSecret(secret: string): string {
    if (!secret) return '***';
    if (secret.length <= 4) return '****';
    const start = secret.slice(0, 2);
    const end = secret.slice(-2);
    return `${start}${'*'.repeat(Math.max(4, secret.length - 4))}${end}`;
  }
}
