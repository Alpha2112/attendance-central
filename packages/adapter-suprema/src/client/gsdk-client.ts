import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { type AppLogger } from '@attendance/logging';
import {
  type GatewayClient,
  type GatewayConnectionOptions,
  type DeviceTarget,
  type GsdkDeviceInfo,
  type GsdkEventLog,
  type GsdkFactoryInfo,
  type GsdkStatusChange,
  type RealtimeLogStream,
  type StatusChangeStream,
} from '../types/gsdk.types.js';

/** Top-level G-SDK proto files the adapter needs (others are resolved via includeDirs). */
const PROTO_FILES = ['connect.proto', 'event.proto', 'device.proto', 'time.proto'] as const;

type AnyRecord = Record<string, unknown>;
type UnaryCallback = (err: grpc.ServiceError | null, res?: AnyRecord) => void;

interface GsdkPackage {
  gsdk: {
    connect: { Connect: grpc.ServiceClientConstructor };
    event: { Event: grpc.ServiceClientConstructor };
    device: { Device: grpc.ServiceClientConstructor };
    time: { Time: grpc.ServiceClientConstructor };
  };
}

/** Cache package definitions per proto directory (loading is comparatively expensive). */
const packageCache = new Map<string, GsdkPackage>();

/**
 * Writes sanitized copies of the licensed `.proto` files into a per-process temp
 * directory and returns its path. This leaves the licensed SDK files untouched
 * while working around a known upstream typo (`deviceIDs = 1;;` in connect.proto)
 * that protobuf.js — the parser behind @grpc/proto-loader — rejects. Only the
 * stray double-semicolon is normalized; the content is otherwise byte-identical.
 */
function prepareProtoDir(protoDir: string): string {
  const cacheDir = path.join(os.tmpdir(), 'attendance-gsdk-proto');
  fs.mkdirSync(cacheDir, { recursive: true });

  for (const file of fs.readdirSync(protoDir)) {
    if (!file.endsWith('.proto')) continue;
    const source = fs.readFileSync(path.join(protoDir, file), 'utf-8');
    const sanitized = source.replace(/;{2,}/g, ';');
    fs.writeFileSync(path.join(cacheDir, file), sanitized);
  }
  return cacheDir;
}

function loadPackage(protoDir: string): GsdkPackage {
  const cached = packageCache.get(protoDir);
  if (cached) return cached;

  for (const f of PROTO_FILES.map((f) => path.join(protoDir, f))) {
    if (!fs.existsSync(f)) {
      throw new Error(
        `G-SDK proto file not found: ${f}. Set SUPREMA_GSDK_PROTO_DIR to the directory ` +
          `containing the G-SDK .proto files (from the licensed Client SDK).`,
      );
    }
  }

  const loadDir = prepareProtoDir(protoDir);
  const files = PROTO_FILES.map((f) => path.join(loadDir, f));

  const definition = protoLoader.loadSync(files, {
    keepCase: true,
    longs: String,
    enums: Number,
    defaults: true,
    oneofs: true,
    includeDirs: [loadDir],
  });

  const pkg = grpc.loadPackageDefinition(definition) as unknown as GsdkPackage;
  packageCache.set(protoDir, pkg);
  return pkg;
}

function buildCredentials(options: GatewayConnectionOptions): grpc.ChannelCredentials {
  if (!options.caCertPath) {
    return grpc.credentials.createInsecure();
  }
  if (!fs.existsSync(options.caCertPath)) {
    throw new Error(
      `Gateway CA certificate not found: ${options.caCertPath}. The Device Gateway generates ` +
        `cert/ca.crt on first start; point SUPREMA_GATEWAY_CA_CERT at it.`,
    );
  }
  const rootCa = fs.readFileSync(options.caCertPath);
  return grpc.credentials.createSsl(rootCa);
}

/**
 * Resolves a gRPC method function regardless of whether proto-loader exposed it
 * under its original PascalCase name or the camelCase alias.
 */
function resolveMethod(client: grpc.Client, name: string): (...args: unknown[]) => unknown {
  const bag = client as unknown as Record<string, unknown>;
  const camel = name.charAt(0).toLowerCase() + name.slice(1);
  const fn = bag[name] ?? bag[camel];
  if (typeof fn !== 'function') {
    throw new Error(`gRPC method not found on client: ${name}`);
  }
  return fn as (...args: unknown[]) => unknown;
}

/**
 * Real gRPC implementation of {@link GatewayClient}. Talks to a Suprema Device Gateway.
 */
export class GsdkGatewayClient implements GatewayClient {
  private readonly connectClient: grpc.Client;
  private readonly eventClient: grpc.Client;
  private readonly deviceClient: grpc.Client;
  private readonly timeClient: grpc.Client;
  private readonly timeoutMs: number;

  constructor(
    options: GatewayConnectionOptions,
    private readonly logger?: AppLogger,
  ) {
    const pkg = loadPackage(options.protoDir);
    const creds = buildCredentials(options);
    this.timeoutMs = options.timeoutMs;

    const channelOptions: grpc.ClientOptions = {};
    if (options.tlsServerName) {
      // Verify the gateway cert against this name while dialing by IP (CA still pinned).
      channelOptions['grpc.ssl_target_name_override'] = options.tlsServerName;
    }

    this.connectClient = new pkg.gsdk.connect.Connect(options.address, creds, channelOptions);
    this.eventClient = new pkg.gsdk.event.Event(options.address, creds, channelOptions);
    this.deviceClient = new pkg.gsdk.device.Device(options.address, creds, channelOptions);
    this.timeClient = new pkg.gsdk.time.Time(options.address, creds, channelOptions);
  }

  private unary(client: grpc.Client, method: string, request: AnyRecord): Promise<AnyRecord> {
    const fn = resolveMethod(client, method);
    const deadline = new Date(Date.now() + this.timeoutMs);
    return new Promise<AnyRecord>((resolve, reject) => {
      const callback: UnaryCallback = (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(res ?? {});
      };
      fn.call(client, request, { deadline }, callback);
    });
  }

  public async connectDevice(target: DeviceTarget): Promise<number> {
    const res = await this.unary(this.connectClient, 'Connect', {
      connectInfo: { IPAddr: target.ipAddr, port: target.port, useSSL: target.useSSL },
    });
    return Number(res['deviceID'] ?? 0);
  }

  public async addAsyncConnection(deviceId: number, target: DeviceTarget): Promise<void> {
    await this.unary(this.connectClient, 'AddAsyncConnection', {
      connectInfos: [
        { deviceID: deviceId, IPAddr: target.ipAddr, port: target.port, useSSL: target.useSSL },
      ],
    });
  }

  public async disconnectDevice(deviceId: number): Promise<void> {
    await this.unary(this.connectClient, 'Disconnect', { deviceIDs: [deviceId] });
  }

  public async getDeviceList(): Promise<GsdkDeviceInfo[]> {
    const res = await this.unary(this.connectClient, 'GetDeviceList', {});
    return (res['deviceInfos'] as GsdkDeviceInfo[] | undefined) ?? [];
  }

  public async getDeviceInfo(deviceId: number): Promise<GsdkFactoryInfo> {
    const res = await this.unary(this.deviceClient, 'GetInfo', { deviceID: deviceId });
    return (res['info'] as GsdkFactoryInfo | undefined) ?? {};
  }

  public async getLog(
    deviceId: number,
    startEventId: number,
    maxNumOfLog: number,
  ): Promise<GsdkEventLog[]> {
    const res = await this.unary(this.eventClient, 'GetLog', {
      deviceID: deviceId,
      startEventID: startEventId,
      maxNumOfLog,
    });
    return (res['events'] as GsdkEventLog[] | undefined) ?? [];
  }

  public async enableMonitoring(deviceId: number): Promise<void> {
    await this.unary(this.eventClient, 'EnableMonitoring', { deviceID: deviceId });
  }

  public async disableMonitoring(deviceId: number): Promise<void> {
    await this.unary(this.eventClient, 'DisableMonitoring', { deviceID: deviceId });
  }

  public subscribeRealtimeLog(deviceIds: number[], queueSize: number): RealtimeLogStream {
    const fn = resolveMethod(this.eventClient, 'SubscribeRealtimeLog');
    const stream = fn.call(this.eventClient, {
      queueSize,
      deviceIDs: deviceIds,
      eventCodes: [],
    }) as grpc.ClientReadableStream<GsdkEventLog>;

    return {
      on: (event: 'data' | 'error' | 'end', listener: (...args: never[]) => void): void => {
        stream.on(event, listener as (...args: unknown[]) => void);
      },
      cancel: () => stream.cancel(),
    } as RealtimeLogStream;
  }

  public subscribeStatus(queueSize: number): StatusChangeStream {
    const fn = resolveMethod(this.connectClient, 'SubscribeStatus');
    const stream = fn.call(this.connectClient, {
      queueSize,
    }) as grpc.ClientReadableStream<GsdkStatusChange>;

    return {
      on: (event: 'data' | 'error' | 'end', listener: (...args: never[]) => void): void => {
        stream.on(event, listener as (...args: unknown[]) => void);
      },
      cancel: () => stream.cancel(),
    } as StatusChangeStream;
  }

  public async getTime(deviceId: number): Promise<number> {
    const res = await this.unary(this.timeClient, 'Get', { deviceID: deviceId });
    return Number(res['GMTTime'] ?? 0);
  }

  public async setTime(deviceId: number, gmtUnixSeconds: number): Promise<void> {
    await this.unary(this.timeClient, 'Set', {
      deviceID: deviceId,
      GMTTime: String(gmtUnixSeconds),
    });
  }

  public close(): void {
    try {
      this.connectClient.close();
      this.eventClient.close();
      this.deviceClient.close();
      this.timeClient.close();
    } catch (err: unknown) {
      this.logger?.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'Error while closing G-SDK gateway clients',
      );
    }
  }
}

/**
 * Default factory used by the adapter in production.
 */
export function createGsdkGatewayClient(
  options: GatewayConnectionOptions,
  logger?: AppLogger,
): GatewayClient {
  return new GsdkGatewayClient(options, logger);
}
