import http from 'node:http';
import https from 'node:https';
import {
  type HikvisionConnectionOptions,
  type HikvisionDeviceInfo,
  type HikvisionDeviceTime,
  type HikvisionAcsEventSearchResult,
  type HikvisionAcsEventRecord,
} from '../types/isapi.types.js';
import {
  parseDigestChallenge,
  generateDigestHeader,
  type DigestChallenge,
} from '../auth/digest-auth.js';
import { type AppLogger } from '@attendance/logging';

export interface ISAPIResponse<T = unknown> {
  statusCode: number;
  data: T;
  rawText: string;
}

function extractXmlTag(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml);
  return match ? match[1]?.trim() : undefined;
}

export class ISAPIClient {
  private readonly baseUrl: string;
  private readonly useHttps: boolean;
  private readonly timeoutMs: number;
  private cachedChallenge: DigestChallenge | null = null;
  private ncCounter = 0;

  constructor(
    private readonly options: HikvisionConnectionOptions,
    private readonly logger?: AppLogger,
  ) {
    this.useHttps = options.useHttps ?? false;
    const defaultPort = this.useHttps ? 443 : 80;
    const port = options.port ?? defaultPort;
    const protocol = this.useHttps ? 'https' : 'http';
    this.baseUrl = `${protocol}://${options.host}:${port}`;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  /**
   * Executes an ISAPI request with automatic Digest Authentication challenge handling.
   */
  public async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<ISAPIResponse<T>> {
    this.logger?.debug(
      { method, path, baseUrl: this.baseUrl },
      'Executing Hikvision ISAPI request',
    );
    const url = `${this.baseUrl}${path}`;
    const jsonBody = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined;

    // 1. Attempt request with cached credentials/challenge if available
    let authHeader: string | undefined;
    if (this.options.username && this.options.password && this.cachedChallenge) {
      this.ncCounter++;
      authHeader = generateDigestHeader(this.cachedChallenge, {
        username: this.options.username,
        password: this.options.password,
        method,
        uri: path,
        nc: this.ncCounter,
      });
    }

    const firstAttempt = await this.executeRaw(method, url, jsonBody, authHeader);

    // 2. If 401 Unauthorized received, parse challenge and retry with Digest
    if (firstAttempt.statusCode === 401 && this.options.username && this.options.password) {
      const challengeHeader =
        firstAttempt.headers['www-authenticate'] ||
        firstAttempt.headers['wWW-Authenticate'] ||
        Object.entries(firstAttempt.headers).find(
          ([k]) => k.toLowerCase() === 'www-authenticate',
        )?.[1];

      if (challengeHeader) {
        const challenge = parseDigestChallenge(challengeHeader);
        if (challenge) {
          this.cachedChallenge = challenge;
          this.ncCounter = 1;
          const digestHeader = generateDigestHeader(challenge, {
            username: this.options.username,
            password: this.options.password,
            method,
            uri: path,
            nc: this.ncCounter,
          });

          const retryAttempt = await this.executeRaw(method, url, jsonBody, digestHeader);
          if (retryAttempt.statusCode >= 200 && retryAttempt.statusCode < 300) {
            return this.parseResponseBody<T>(retryAttempt);
          }
          throw new Error(
            `ISAPI authentication rejected with status ${retryAttempt.statusCode}: ${retryAttempt.rawText}`,
          );
        }
      }
      throw new Error(`ISAPI 401 Unauthorized: Invalid credentials or missing challenge header`);
    }

    if (firstAttempt.statusCode < 200 || firstAttempt.statusCode >= 300) {
      throw new Error(`ISAPI request failed [${firstAttempt.statusCode}]: ${firstAttempt.rawText}`);
    }

    return this.parseResponseBody<T>(firstAttempt);
  }

  /**
   * Retrieves device information (/ISAPI/System/deviceInfo?format=json).
   */
  public async getDeviceInfo(): Promise<HikvisionDeviceInfo> {
    const res = await this.request<{ DeviceInfo?: HikvisionDeviceInfo }>(
      'GET',
      '/ISAPI/System/deviceInfo?format=json',
    );

    if (
      res.data &&
      typeof res.data === 'object' &&
      'DeviceInfo' in res.data &&
      res.data.DeviceInfo
    ) {
      return res.data.DeviceInfo;
    }

    // XML fallback parsing
    if (typeof res.rawText === 'string' && res.rawText.includes('<DeviceInfo')) {
      return {
        deviceName: extractXmlTag(res.rawText, 'deviceName'),
        deviceID: extractXmlTag(res.rawText, 'deviceID'),
        model: extractXmlTag(res.rawText, 'model') || 'Hikvision Terminal',
        serialNumber: extractXmlTag(res.rawText, 'serialNumber') || 'UNKNOWN_SN',
        macAddress: extractXmlTag(res.rawText, 'macAddress'),
        firmwareVersion: extractXmlTag(res.rawText, 'firmwareVersion') || 'Unknown',
        firmwareReleasedDate: extractXmlTag(res.rawText, 'firmwareReleasedDate'),
        encoderVersion: extractXmlTag(res.rawText, 'encoderVersion'),
        deviceType: extractXmlTag(res.rawText, 'deviceType'),
      };
    }

    return res.data as unknown as HikvisionDeviceInfo;
  }

  /**
   * Retrieves device clock configuration (/ISAPI/System/time?format=json).
   */
  public async getTime(): Promise<HikvisionDeviceTime> {
    const res = await this.request<{ Time?: HikvisionDeviceTime }>(
      'GET',
      '/ISAPI/System/time?format=json',
    );

    if (res.data && typeof res.data === 'object' && 'Time' in res.data && res.data.Time) {
      return res.data.Time;
    }

    // XML fallback parsing
    if (typeof res.rawText === 'string' && res.rawText.includes('<Time')) {
      return {
        timeMode: (extractXmlTag(res.rawText, 'timeMode') as 'manual' | 'NTP') || 'manual',
        localTime: extractXmlTag(res.rawText, 'localTime') || new Date().toISOString(),
        timeZone: extractXmlTag(res.rawText, 'timeZone') || 'CST-8:00:00',
      };
    }

    return res.data as unknown as HikvisionDeviceTime;
  }

  /**
   * Synchronizes device clock (/ISAPI/System/time?format=json).
   */
  public async setTime(localTimeIso: string, timeZone = 'CST-8:00:00'): Promise<void> {
    await this.request('PUT', '/ISAPI/System/time?format=json', {
      Time: {
        timeMode: 'manual',
        localTime: localTimeIso,
        timeZone,
      },
    });
  }

  /**
   * Queries access control event logs (/ISAPI/AccessControl/AcsEvent?format=json).
   */
  public async searchAcsEvents(params: {
    searchID: string;
    searchResultPosition: number;
    maxResults: number;
    major?: number;
    minor?: number;
    startTime?: string;
    endTime?: string;
  }): Promise<HikvisionAcsEventSearchResult> {
    const searchBody = {
      AcsEventCond: {
        searchID: params.searchID,
        searchResultPosition: params.searchResultPosition,
        maxResults: params.maxResults,
        major: params.major ?? 5,
        minor: params.minor ?? 0,
        ...(params.startTime ? { startTime: params.startTime } : {}),
        ...(params.endTime ? { endTime: params.endTime } : {}),
      },
    };

    const res = await this.request<HikvisionAcsEventSearchResult>(
      'POST',
      '/ISAPI/AccessControl/AcsEvent?format=json',
      searchBody,
    );

    if (res.data && typeof res.data === 'object' && 'AcsEvent' in res.data) {
      return res.data;
    }

    // XML fallback parsing
    if (typeof res.rawText === 'string' && res.rawText.includes('<AcsEvent')) {
      const records: HikvisionAcsEventRecord[] = [];
      const infoListMatches = res.rawText.match(/<InfoList[\s\S]*?<\/InfoList>/gi) || [];

      for (const infoXml of infoListMatches) {
        records.push({
          major: parseInt(extractXmlTag(infoXml, 'major') || '5', 10),
          minor: parseInt(extractXmlTag(infoXml, 'minor') || '0', 10),
          time: extractXmlTag(infoXml, 'time') || new Date().toISOString(),
          cardNo: extractXmlTag(infoXml, 'cardNo'),
          employeeNoString: extractXmlTag(infoXml, 'employeeNoString'),
          name: extractXmlTag(infoXml, 'name'),
          serialNo: parseInt(extractXmlTag(infoXml, 'serialNo') || '0', 10),
          currentVerifyMode: extractXmlTag(infoXml, 'currentVerifyMode'),
        });
      }

      const totalMatches = parseInt(
        extractXmlTag(res.rawText, 'totalMatches') || `${records.length}`,
        10,
      );
      const responseStatusStrg =
        (extractXmlTag(res.rawText, 'responseStatusStrg') as 'OK' | 'MORE' | 'NO MATCH') || 'OK';

      return {
        AcsEvent: {
          totalMatches,
          responseStatusStrg,
          numOfMatches: records.length,
          InfoList: records,
        },
      };
    }

    return res.data;
  }

  /**
   * Low-level HTTP / HTTPS request execution.
   */
  private async executeRaw(
    method: string,
    urlStr: string,
    body?: string,
    authHeader?: string,
  ): Promise<{ statusCode: number; rawText: string; headers: Record<string, string> }> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? https : http;

      const headers: Record<string, string> = {
        'Content-Type': body?.startsWith('<?xml') ? 'application/xml' : 'application/json',
        Accept: 'application/json, application/xml, text/xml, */*',
      };

      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

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
        reject(new Error(`ISAPI HTTP request timeout after ${this.timeoutMs}ms to ${urlStr}`));
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

  private parseResponseBody<T>(res: { statusCode: number; rawText: string }): ISAPIResponse<T> {
    try {
      const data = JSON.parse(res.rawText) as T;
      return {
        statusCode: res.statusCode,
        data,
        rawText: res.rawText,
      };
    } catch {
      return {
        statusCode: res.statusCode,
        data: res.rawText as unknown as T,
        rawText: res.rawText,
      };
    }
  }
}
