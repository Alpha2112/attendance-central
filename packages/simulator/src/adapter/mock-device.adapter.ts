import {
  type RawAttendanceEvent,
  type DeviceStatusEvent,
  DeviceStatus,
  type CommandType,
  CommandStatus,
  type DeviceCommandResultEvent,
} from '@attendance/contracts';
import {
  type SimulatorConfig,
  FailureMode,
  type MockDeviceState,
} from '../types/simulator.types.js';
import crypto from 'node:crypto';

export class MockDeviceAdapter {
  private readonly config: SimulatorConfig;
  private state: MockDeviceState;
  private realtimeSubscribers: Array<(event: RawAttendanceEvent) => void> = [];

  constructor(config: SimulatorConfig) {
    this.config = {
      defaultLatencyMs: 10,
      failureMode: FailureMode.NONE,
      clockDriftSeconds: 0,
      ...config,
    };

    this.state = {
      connected: false,
      authenticated: false,
      status: DeviceStatus.OFFLINE,
      lastHeartbeat: null,
      logsInBuffer: 0,
    };
  }

  public async connect(): Promise<void> {
    if (this.config.failureMode === FailureMode.TIMEOUT) {
      throw new Error(`Connection timeout connecting to mock device '${this.config.deviceId}'`);
    }
    if (this.config.failureMode === FailureMode.AUTH_FAILURE) {
      this.state.status = DeviceStatus.AUTH_ERROR;
      throw new Error(`Authentication failure for mock device '${this.config.deviceId}'`);
    }

    this.state.connected = true;
    this.state.authenticated = true;
    this.state.status = DeviceStatus.ONLINE;
    this.state.lastHeartbeat = new Date();
  }

  public async disconnect(): Promise<void> {
    this.state.connected = false;
    this.state.status = DeviceStatus.OFFLINE;
  }

  public getStatus(): DeviceStatusEvent {
    return {
      eventId: crypto.randomUUID(),
      schemaVersion: 1,
      organizationId: this.config.organizationId,
      deviceId: this.config.deviceId,
      status: this.state.status,
      latencyMs: this.config.defaultLatencyMs,
      clockOffsetSeconds: this.config.clockDriftSeconds,
      observedAt: new Date().toISOString(),
    };
  }

  public async executeCommand(
    commandId: string,
    commandType: CommandType,
  ): Promise<DeviceCommandResultEvent> {
    if (!this.state.connected) {
      return {
        commandId,
        schemaVersion: 1,
        organizationId: this.config.organizationId,
        deviceId: this.config.deviceId,
        commandType,
        status: CommandStatus.FAILED,
        executedAt: new Date().toISOString(),
        errorMessage: 'Device is offline',
      };
    }

    return {
      commandId,
      schemaVersion: 1,
      organizationId: this.config.organizationId,
      deviceId: this.config.deviceId,
      commandType,
      status: CommandStatus.EXECUTED,
      executedAt: new Date().toISOString(),
      latencyMs: this.config.defaultLatencyMs,
      resultPayload: { success: true },
    };
  }

  public subscribeRealtime(callback: (event: RawAttendanceEvent) => void): () => void {
    this.realtimeSubscribers.push(callback);
    return () => {
      this.realtimeSubscribers = this.realtimeSubscribers.filter((cb) => cb !== callback);
    };
  }

  public emitRealtime(event: RawAttendanceEvent): void {
    for (const subscriber of this.realtimeSubscribers) {
      subscriber(event);
    }
  }

  public getState(): Readonly<MockDeviceState> {
    return this.state;
  }
}
