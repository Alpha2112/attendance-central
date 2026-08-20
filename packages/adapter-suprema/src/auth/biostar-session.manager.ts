import { type BioStarConnectionOptions, type BioStarSession } from '../types/biostar.types.js';
import { type AppLogger } from '@attendance/logging';

export class BioStarSessionManager {
  private currentSession: BioStarSession | null = null;
  private renewPromise: Promise<string> | null = null;
  private readonly sessionTtlMs: number;

  constructor(
    private readonly options: BioStarConnectionOptions,
    private readonly loginFn: (options: BioStarConnectionOptions) => Promise<string>,
    private readonly logger?: AppLogger,
  ) {
    this.sessionTtlMs = options.sessionTtlMs ?? 30 * 60 * 1000; // 30 mins default TTL
  }

  /**
   * Returns a valid session ID, transparently renewing if missing or expired.
   */
  public async getSessionId(forceRenew = false): Promise<string> {
    const now = Date.now();

    if (!forceRenew && this.currentSession && this.currentSession.expiresAt > now + 30000) {
      return this.currentSession.sessionId;
    }

    // Mutex locking for concurrent calls
    if (this.renewPromise) {
      return this.renewPromise;
    }

    this.renewPromise = (async () => {
      try {
        this.logger?.info(
          { host: this.options.host, user: this.options.username },
          'Renewing BioStar 2 authentication session',
        );

        const sessionId = await this.loginFn(this.options);
        this.currentSession = {
          sessionId,
          username: this.options.username || 'admin',
          createdAt: Date.now(),
          expiresAt: Date.now() + this.sessionTtlMs,
        };

        this.logger?.info('BioStar 2 session successfully established');
        return sessionId;
      } finally {
        this.renewPromise = null;
      }
    })();

    return this.renewPromise;
  }

  /**
   * Explicitly invalidates current session.
   */
  public invalidate(): void {
    this.currentSession = null;
  }

  /**
   * Returns whether a session is currently active and unexpired.
   */
  public get hasActiveSession(): boolean {
    return !!this.currentSession && this.currentSession.expiresAt > Date.now();
  }
}
