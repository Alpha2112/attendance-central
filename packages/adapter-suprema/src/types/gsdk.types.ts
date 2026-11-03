/**
 * Type definitions for the Suprema G-SDK (gRPC Device Gateway) integration.
 *
 * The collector talks to a Suprema **Device Gateway** over gRPC (default :4000).
 * The gateway, in turn, connects to the physical terminal over TCP
 * (51211/51212 non-SSL, 51213 SSL) using Suprema's binary protocol.
 *
 * These types mirror the fields returned by `@grpc/proto-loader` when the
 * official G-SDK `.proto` files are loaded with `keepCase: true`.
 */

/**
 * Suprema error classification categories (kept stable for downstream consumers
 * and tests that existed for the previous BioStar 2 adapter).
 */
export enum SupremaErrorCategory {
  TRANSIENT = 'TRANSIENT',
  PERMANENT = 'PERMANENT',
  HARDWARE = 'HARDWARE',
}

/**
 * Connection status reported by the gateway for a device
 * (mirrors `gsdk.connect.Status`).
 */
export enum GsdkConnectionStatus {
  DISCONNECTED = 0x00,
  TCP_CONNECTED = 0x01,
  TLS_CONNECTED = 0x02,
  TRY_TO_CONNECT = 0x04,
  TCP_CANNOT_CONNECT = 0x100,
  TCP_NOT_ALLOWED = 0x101,
  TLS_CANNOT_CONNECT = 0x200,
  TLS_NOT_ALLOWED = 0x201,
}

/**
 * Options describing how to reach the Device Gateway and the terminal behind it.
 */
export interface GatewayConnectionOptions {
  /** Gateway gRPC address, e.g. "127.0.0.1:4000". */
  address: string;
  /** Absolute path to the gateway's CA certificate (ca.crt). Omit for an insecure channel. */
  caCertPath?: string;
  /** Directory containing the G-SDK `.proto` files. */
  protoDir: string;
  /** Per-call deadline in milliseconds. */
  timeoutMs: number;
  /**
   * TLS server name to verify the gateway certificate against (maps to the gRPC
   * `grpc.ssl_target_name_override` channel option). Use this when connecting by IP
   * (e.g. 127.0.0.1) to a self-signed gateway whose certificate CN/SAN is a name.
   * The CA is still pinned and verified; only the authority name is overridden.
   */
  tlsServerName?: string;
}

/**
 * Parameters for connecting the gateway to a physical terminal.
 */
export interface DeviceTarget {
  /** Terminal IP address. */
  ipAddr: string;
  /** Terminal device port (default 51211; 51213 when SSL is enabled). */
  port: number;
  /** Whether the device-to-gateway link uses SSL (port 51213). */
  useSSL: boolean;
}

/**
 * A single event log entry as returned by the Event service
 * (`gsdk.event.EventLog`, loaded with keepCase).
 */
export interface GsdkEventLog {
  ID: number;
  timestamp: number; // Unix seconds (GMT)
  deviceID: number;
  userID: string;
  entityID: number;
  eventCode: number;
  subCode: number;
  TNAKey: number;
  hasImage?: boolean;
  changedOnDevice?: boolean;
  temperature?: number;
  cardData?: Buffer | Uint8Array;
}

/**
 * Device connection descriptor returned by `Connect.GetDeviceList`
 * (`gsdk.connect.DeviceInfo`).
 */
export interface GsdkDeviceInfo {
  deviceID: number;
  connectionMode?: number;
  IPAddr?: string;
  port?: number;
  status?: number;
  autoReconnect?: boolean;
  useSSL?: boolean;
}

/**
 * Factory/hardware information returned by `Device.GetInfo` (`gsdk.device.FactoryInfo`).
 */
export interface GsdkFactoryInfo {
  MACAddr?: string;
  modelName?: string;
  firmwareVersion?: string;
  kernelVersion?: string;
  boardVersion?: string;
}

/**
 * Status change event streamed by `Connect.SubscribeStatus` (`gsdk.connect.StatusChange`).
 */
export interface GsdkStatusChange {
  deviceID: number;
  status: number;
  timestamp: number;
}

/**
 * Construction options for the Suprema adapter.
 */
export interface SupremaAdapterOptions {
  /** Gateway gRPC address (default from SUPREMA_GATEWAY_ADDR or 127.0.0.1:4000). */
  gatewayAddress?: string;
  /** Path to the gateway CA cert (default from SUPREMA_GATEWAY_CA_CERT). */
  caCertPath?: string;
  /** TLS server name override (default from SUPREMA_GATEWAY_TLS_SERVER_NAME). */
  tlsServerName?: string;
  /** Directory holding the G-SDK proto files (default from SUPREMA_GSDK_PROTO_DIR). */
  protoDir?: string;
  /** Default terminal device port when the device record does not specify one. */
  defaultDevicePort?: number;
  /** Whether the device link uses SSL by default. */
  useSSL?: boolean;
  /** Per-call gRPC deadline in milliseconds. */
  timeoutMs?: number;
  /** When true, localhost/mock hosts fall back to the in-process simulator. */
  mockFallback?: boolean;
  /** Injectable gateway-client factory (used by unit tests to avoid a live gateway). */
  clientFactory?: GatewayClientFactory;
}

/**
 * Minimal surface of the gateway client the adapter depends on. A real
 * implementation wraps gRPC; tests provide a fake.
 */
export interface GatewayClient {
  connectDevice(target: DeviceTarget): Promise<number>;
  addAsyncConnection(deviceId: number, target: DeviceTarget): Promise<void>;
  disconnectDevice(deviceId: number): Promise<void>;
  getDeviceList(): Promise<GsdkDeviceInfo[]>;
  getDeviceInfo(deviceId: number): Promise<GsdkFactoryInfo>;
  getLog(deviceId: number, startEventId: number, maxNumOfLog: number): Promise<GsdkEventLog[]>;
  enableMonitoring(deviceId: number): Promise<void>;
  disableMonitoring(deviceId: number): Promise<void>;
  subscribeRealtimeLog(deviceIds: number[], queueSize: number): RealtimeLogStream;
  subscribeStatus(queueSize: number): StatusChangeStream;
  getTime(deviceId: number): Promise<number>;
  setTime(deviceId: number, gmtUnixSeconds: number): Promise<void>;
  close(): void;
}

/**
 * A server-streaming subscription of realtime event logs.
 */
export interface RealtimeLogStream {
  on(event: 'data', listener: (log: GsdkEventLog) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
  on(event: 'end', listener: () => void): void;
  cancel(): void;
}

/**
 * A server-streaming subscription of device connection-status changes.
 */
export interface StatusChangeStream {
  on(event: 'data', listener: (change: GsdkStatusChange) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
  on(event: 'end', listener: () => void): void;
  cancel(): void;
}

export type GatewayClientFactory = (options: GatewayConnectionOptions) => GatewayClient;
