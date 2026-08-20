import http from 'node:http';
import https from 'node:https';
import {
  type BioStarConnectionOptions,
  type BioStarDevice,
  type BioStarEventSearchResponse,
} from '../types/biostar.types.js';
import { BioStarSessionManager } from '../auth/biostar-session.manager.js';
import { type AppLogger } from '@attendance/logging';

export interface BioStarResponse<T = unknown> {
  statusCode: number;
  data: T;
  rawText: string;
  headers: Record<string, string>;
}

export class BioStarClient {
  private readonly baseUrl: string;
  private readonly useHttps: boolean;
  private readonly timeoutMs: number;
  private readonly sessionManager: BioStarSessionManager;

  constructor(
    private readonly options: BioStarConnectionOptions,
    private readonly logger?: AppLogger,
  ) {
    this.useHttps = options.useHttps ?? false;
    const defaultPort = this.useHttps ? 443 : 80;
    const port = options.port ?? defaultPort;
    const protocol = this.useHttps ? 'https' : 'http';
    this.baseUrl = `${protocol}://${options.host}:${port}`;
    this.timeoutMs = options.timeoutMs ?? 6000;

    this.sessionManager = new BioStarSessionManager(
      options,
      (opts) => this.executeLogin(opts),
      logger,
    );
  }

  /**
   * Logs into BioStar 2 server and returns session ID (bs-session-id).
   */
  public async login(): Promise<string> {
    return this.sessionManager.getSessionId(true);
  }

  /**
   * Executes a BioStar 2 API request with session auto-renewal on 401 Unauthorized.
   */
  public async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    requiresAuth = true,
  ): Promise<BioStarResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const jsonBody = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined;

    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (requiresAuth) {
      const sessionId = await this.sessionManager.getSessionId();
      headers['bs-session-id'] = sessionId;
    }

    this.logger?.debug({ method, path }, 'Executing BioStar 2 API request');
    let response = await this.executeRaw(method, url, jsonBody, headers);

    // If 401 Unauthorized received, renew session and retry once
    if (response.statusCode === 401 && requiresAuth) {
      this.logger?.warn(
        'BioStar 2 session expired or rejected (401). Retrying with fresh session...',
      );
      const newSessionId = await this.sessionManager.getSessionId(true);
      headers['bs-session-id'] = newSessionId;
      response = await this.executeRaw(method, url, jsonBody, headers);
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`BioStar 2 API request failed [${response.statusCode}]: ${response.rawText}`);
    }

    return this.parseResponseBody<T>(response);
  }

  /**
   * Retrieves single device details (/api/v2/devices/:id).
   */
  public async getDevice(deviceId: string | number): Promise<BioStarDevice> {
    const res = await this.request<{ Device?: BioStarDevice } | BioStarDevice>(
      'GET',
      `/api/v2/devices/${deviceId}`,
    );
    if ('Device' in res.data && res.data.Device) {
      return res.data.Device;
    }
    return res.data as BioStarDevice;
  }

  /**
   * Retrieves all devices (/api/v2/devices).
   */
  public async getDevices(): Promise<BioStarDevice[]> {
    const res = await this.request<{ DeviceCollection?: { rows: BioStarDevice[] } }>(
      'GET',
      '/api/v2/devices',
    );
    return res.data?.DeviceCollection?.rows ?? [];
  }

  /**
   * Searches historical event logs (/api/v2/monitoring/event_log/search or /api/v2/events).
   */
  public async searchEvents(params: {
    limit?: number;
    offset?: number;
    deviceId?: string | number;
    startTime?: string;
    endTime?: string;
  }): Promise<BioStarEventSearchResponse> {
    const searchBody = {
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
      ...(params.deviceId ? { device_id: params.deviceId } : {}),
      ...(params.startTime || params.endTime
        ? {
            datetime: [
              params.startTime || new Date(0).toISOString(),
              params.endTime || new Date().toISOString(),
            ],
          }
        : {}),
    };

    const res = await this.request<BioStarEventSearchResponse>(
      'POST',
      '/api/v2/monitoring/event_log/search',
      searchBody,
    );

    return res.data;
  }

  /**
   * Queries device clock (/api/v2/devices/:id/time).
   */
  public async getTime(deviceId: string | number): Promise<{ device_time: string }> {
    const res = await this.request<{ device_time: string }>(
      'GET',
      `/api/v2/devices/${deviceId}/time`,
    );
    return res.data;
  }

  /**
   * Synchronizes device clock (/api/v2/devices/:id/time).
   */
  public async setTime(deviceId: string | number, timeIso: string): Promise<void> {
    await this.request('PUT', `/api/v2/devices/${deviceId}/time`, { device_time: timeIso });
  }

  /**
   * Direct login execution returning bs-session-id.
   */
  private async executeLogin(options: BioStarConnectionOptions): Promise<string> {
    const url = `${this.baseUrl}/api/v2/login`;
    const payload = JSON.stringify({
      User: {
        login_id: options.username || 'admin',
        password: options.password || 'Admin12345',
      },
    });

    const response = await this.executeRaw('POST', url, payload, {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`BioStar login failed [${response.statusCode}]: ${response.rawText}`);
    }

    const sessionId =
      response.headers['bs-session-id'] || response.headers['set-cookie']?.split(';')[0];
    if (!sessionId) {
      // Check response body for session token
      try {
        const bodyObj = JSON.parse(response.rawText) as {
          session_id?: string;
          Response?: { session_id?: string };
        };
        const bodySession = bodyObj.session_id || bodyObj.Response?.session_id;
        if (bodySession) return bodySession;
      } catch {
        // ignore
      }
      throw new Error('BioStar login response missing bs-session-id header');
    }

    return sessionId;
  }

  /**
   * Low-level HTTP / HTTPS request execution.
   */
  private async executeRaw(
    method: string,
    urlStr: string,
    body?: string,
    customHeaders: Record<string, string> = {},
  ): Promise<{ statusCode: number; rawText: string; headers: Record<string, string> }> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? https : http;

      const headers: Record<string, string> = {
        ...customHeaders,
      };

      if (body) {
        headers['Content-Length'] = Buffer.byteLength(body).toString();
      }

      const reqOptions: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port ? parseInt(url.port, 10) : isHttps ? 443 : 80,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        timeout: this.timeoutMs,
      };

      if (isHttps && this.options.rejectUnauthorized !== undefined) {
        (reqOptions as https.RequestOptions).rejectUnauthorized = this.options.rejectUnauthorized;
      } else if (isHttps) {
        (reqOptions as https.RequestOptions).rejectUnauthorized = false;
      }

      const req = transport.request(reqOptions, (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });

        res.on('end', () => {
          const resHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v) resHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
          }

          resolve({
            statusCode: res.statusCode ?? 500,
            rawText: rawData,
            headers: resHeaders,
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`BioStar 2 API request timeout after ${this.timeoutMs}ms to ${urlStr}`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  private parseResponseBody<T>(res: {
    statusCode: number;
    rawText: string;
    headers: Record<string, string>;
  }): BioStarResponse<T> {
    try {
      const data = JSON.parse(res.rawText) as T;
      return {
        statusCode: res.statusCode,
        data,
        rawText: res.rawText,
        headers: res.headers,
      };
    } catch {
      return {
        statusCode: res.statusCode,
        data: res.rawText as unknown as T,
        rawText: res.rawText,
        headers: res.headers,
      };
    }
  }
}
