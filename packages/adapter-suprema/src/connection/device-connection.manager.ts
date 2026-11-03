import { type DeviceModel } from '@attendance/contracts';
import { type AppLogger } from '@attendance/logging';
import {
  type GatewayClient,
  type DeviceTarget,
  GsdkConnectionStatus,
} from '../types/gsdk.types.js';

const DEFAULT_PORT_PLAIN = 51211;
const DEFAULT_PORT_SSL = 51213;

function isConnected(status: number | undefined): boolean {
  return (
    status === GsdkConnectionStatus.TCP_CONNECTED || status === GsdkConnectionStatus.TLS_CONNECTED
  );
}

/**
 * Resolves and maintains the gateway-side connection (and numeric deviceID) for a
 * platform {@link DeviceModel}. The gateway dials the terminal (server-to-device)
 * and assigns a deviceID equal to the terminal's serial number.
 */
export class DeviceConnectionManager {
  private readonly deviceIds = new Map<string, number>();

  constructor(
    private readonly client: GatewayClient,
    private readonly options: { useSSL: boolean; defaultDevicePort?: number },
    private readonly logger?: AppLogger,
  ) {}

  /** Builds the terminal connection target (IP/port/SSL) from the device record. */
  public resolveTarget(device: DeviceModel): DeviceTarget {
    const metadata = device.metadata ?? {};
    const metaSsl = metadata['useSSL'];
    const useSSL = typeof metaSsl === 'boolean' ? metaSsl : this.options.useSSL;

    const metaPort = metadata['devicePort'];
    const explicitPort =
      (typeof metaPort === 'number' ? metaPort : undefined) ??
      (typeof metaPort === 'string' && /^\d+$/.test(metaPort)
        ? parseInt(metaPort, 10)
        : undefined) ??
      device.port;

    const port =
      explicitPort && explicitPort !== 4000
        ? explicitPort
        : (this.options.defaultDevicePort ?? (useSSL ? DEFAULT_PORT_SSL : DEFAULT_PORT_PLAIN));

    return {
      ipAddr: device.host ?? '127.0.0.1',
      port,
      useSSL,
    };
  }

  /**
   * Ensures the gateway has an active connection to the terminal and returns its
   * numeric deviceID, reusing an existing gateway connection when present.
   */
  public async ensureConnected(device: DeviceModel): Promise<number> {
    const cached = this.deviceIds.get(device.id);
    if (cached) return cached;

    const target = this.resolveTarget(device);

    // Reuse an existing gateway connection to the same terminal, if any.
    try {
      const list = await this.client.getDeviceList();
      const existing = list.find((d) => d.IPAddr === target.ipAddr && isConnected(d.status));
      if (existing?.deviceID) {
        this.deviceIds.set(device.id, existing.deviceID);
        return existing.deviceID;
      }
    } catch (err: unknown) {
      this.logger?.debug(
        { deviceId: device.id, error: err instanceof Error ? err.message : String(err) },
        'GetDeviceList failed while resolving Suprema device; will connect directly',
      );
    }

    // Synchronous Connect establishes the session AND returns the gateway deviceID
    // (equal to the terminal serial). We do NOT also call AddAsyncConnection for the
    // same device: mixing the two resets the session and yields "Cannot get connection".
    // The gateway keeps the Connect session alive and reconnects per its config; if a
    // call later fails we invalidate the cache and re-Connect.
    const deviceId = await this.client.connectDevice(target);

    this.deviceIds.set(device.id, deviceId);
    this.logger?.info(
      { deviceId: device.id, gatewayDeviceId: deviceId, target },
      'Connected Suprema terminal through G-SDK gateway',
    );
    return deviceId;
  }

  /** Forgets the cached deviceID so the next call re-resolves/reconnects. */
  public invalidate(deviceId: string): void {
    this.deviceIds.delete(deviceId);
  }
}
