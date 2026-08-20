import { describe, it, expect, vi } from 'vitest';
import {
  DeviceAdapterRegistry,
  AdapterNotRegisteredError,
  StandardMockDeviceAdapter,
  DeviceLockCoordinator,
  DeviceLockAcquisitionError,
  BackoffManager,
  RawEventPublisher,
  DevicePollingOrchestrator,
  DeviceHeartbeatMonitor,
  CollectorService,
} from '../index.js';
import {
  type DeviceModel,
  DeviceStatus,
  DeviceVendor,
  KAFKA_TOPICS,
  type RawAttendanceEvent,
} from '@attendance/contracts';
import { type RedisLockManager, type LockResult } from '@attendance/redis';
import { type KafkaProducer } from '@attendance/kafka';

describe('Collector Ingestion Framework & Orchestration', () => {
  const sampleDevice: DeviceModel = {
    id: 'DEV-HQ-ZK01',
    organizationId: 'ORG-TECHIVE',
    branchId: 'BR-HQ-01',
    deviceCode: 'DEV-HQ-ZK01',
    serialNumber: 'ZK-SN-99881122',
    name: 'ZKTeco Main Entrance',
    vendor: 'ZKTECO',
    protocol: 'ADMS',
    connectionMode: 'PULL',
    status: DeviceStatus.ONLINE,
    timezone: 'UTC',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  };

  describe('1. DeviceAdapterRegistry', () => {
    it('should register and resolve adapter by vendor and composite key', () => {
      const registry = new DeviceAdapterRegistry();
      const mockAdapter = new StandardMockDeviceAdapter({
        organizationId: 'ORG-TECHIVE',
        deviceId: 'DEV-HQ-ZK01',
        vendor: DeviceVendor.ZKTECO,
      });

      registry.register('ZKTECO:ADMS', mockAdapter);

      const resolved = registry.resolve(sampleDevice);
      expect(resolved).toBe(mockAdapter);
      expect(resolved.capabilities.length).toBeGreaterThan(0);
    });

    it('should throw AdapterNotRegisteredError when no adapter matches device', () => {
      const registry = new DeviceAdapterRegistry();
      const unknownDevice: DeviceModel = {
        ...sampleDevice,
        vendor: 'UNKNOWN_VENDOR',
        protocol: undefined,
      };

      expect(() => registry.resolve(unknownDevice)).toThrow(AdapterNotRegisteredError);
    });
  });

  describe('2. DeviceLockCoordinator', () => {
    it('should acquire lock, run operation, and release lock', async () => {
      const mockLockResult: LockResult = {
        acquired: true,
        key: 'locks:device:DEV-HQ-ZK01',
        token: 'test-token',
      };

      const mockLockManager: RedisLockManager = {
        acquireLock: vi.fn().mockResolvedValue(mockLockResult),
        releaseLock: vi.fn().mockResolvedValue(true),
      } as unknown as RedisLockManager;

      const coordinator = new DeviceLockCoordinator(mockLockManager);
      let executed = false;

      const result = await coordinator.withDeviceLock('DEV-HQ-ZK01', async () => {
        executed = true;
        return 'success';
      });

      expect(result).toBe('success');
      expect(executed).toBe(true);
      expect(mockLockManager.acquireLock).toHaveBeenCalledWith('device:DEV-HQ-ZK01', 60000);
      expect(mockLockManager.releaseLock).toHaveBeenCalledWith('device:DEV-HQ-ZK01', 'test-token');
    });

    it('should throw DeviceLockAcquisitionError if lock is already held', async () => {
      const mockLockManager: RedisLockManager = {
        acquireLock: vi.fn().mockResolvedValue({ acquired: false }),
        releaseLock: vi.fn(),
      } as unknown as RedisLockManager;

      const coordinator = new DeviceLockCoordinator(mockLockManager);

      await expect(
        coordinator.withDeviceLock('DEV-HQ-ZK01', async () => 'not_reached'),
      ).rejects.toThrow(DeviceLockAcquisitionError);
    });
  });

  describe('3. BackoffManager', () => {
    it('should compute exponential backoff with jitter and clear upon success', () => {
      const backoff = new BackoffManager(undefined, {
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        multiplier: 2.0,
        jitterFactor: 0.1,
      });

      expect(backoff.isAllowed('DEV-1')).toBe(true);

      const delay1 = backoff.recordFailure('DEV-1', 'Timeout');
      expect(delay1).toBeGreaterThanOrEqual(900);
      expect(delay1).toBeLessThanOrEqual(1100);
      expect(backoff.isAllowed('DEV-1')).toBe(false);

      const delay2 = backoff.recordFailure('DEV-1', 'Timeout 2');
      expect(delay2).toBeGreaterThanOrEqual(1800);
      expect(delay2).toBeLessThanOrEqual(2200);

      backoff.recordSuccess('DEV-1');
      expect(backoff.isAllowed('DEV-1')).toBe(true);
      expect(backoff.getState('DEV-1')).toBeUndefined();
    });
  });

  describe('4. RawEventPublisher', () => {
    it('should publish validated RawAttendanceEvent to Kafka topic attendance.raw.v1', async () => {
      const mockProducer: KafkaProducer = {
        publish: vi.fn().mockResolvedValue([]),
      } as unknown as KafkaProducer;

      const publisher = new RawEventPublisher(mockProducer);

      const validPunch: RawAttendanceEvent = {
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        schemaVersion: 1,
        organizationId: 'ORG-TECHIVE',
        branchId: 'BR-HQ-01',
        deviceId: 'DEV-HQ-ZK01',
        deviceSerialNumber: 'ZK-SN-99881122',
        vendor: 'ZKTECO',
        adapter: 'zkteco-standalone',
        vendorUserId: '457',
        deviceTime: '2026-08-16T08:00:00.000Z',
        receivedAt: '2026-08-16T08:00:01.000Z',
        vendorPunchType: '0',
        vendorVerificationType: '1',
        source: 'PUSH',
        rawPayload: { pin: '457', status: 0 },
      };

      const result = await publisher.publishRawEvent(validPunch);
      expect(result.eventId).toBe(validPunch.eventId);
      expect(result.topic).toBe(KAFKA_TOPICS.ATTENDANCE_RAW);
      expect(mockProducer.publish).toHaveBeenCalledWith({
        topic: KAFKA_TOPICS.ATTENDANCE_RAW,
        key: 'ORG-TECHIVE:DEV-HQ-ZK01',
        value: validPunch,
      });
    });

    it('should reject invalid RawAttendanceEvent before reaching Kafka', async () => {
      const mockProducer: KafkaProducer = {
        publish: vi.fn(),
      } as unknown as KafkaProducer;

      const publisher = new RawEventPublisher(mockProducer);

      const invalidPunch = {
        eventId: 'invalid-uuid',
        organizationId: 'ORG-TECHIVE',
      } as unknown as RawAttendanceEvent;

      await expect(publisher.publishRawEvent(invalidPunch)).rejects.toThrow();
      expect(mockProducer.publish).not.toHaveBeenCalled();
    });
  });

  describe('5. DevicePollingOrchestrator End-to-End Flow', () => {
    it('should pull incremental logs from adapter, advance cursor, and publish to Kafka', async () => {
      const registry = new DeviceAdapterRegistry();
      const mockAdapter = new StandardMockDeviceAdapter({
        organizationId: 'ORG-TECHIVE',
        deviceId: 'DEV-HQ-ZK01',
      });
      registry.register('ZKTECO', mockAdapter);

      const mockLockResult: LockResult = {
        acquired: true,
        key: 'locks:device:DEV-HQ-ZK01',
        token: 'token',
      };
      const mockLockManager: RedisLockManager = {
        acquireLock: vi.fn().mockResolvedValue(mockLockResult),
        releaseLock: vi.fn().mockResolvedValue(true),
      } as unknown as RedisLockManager;

      const mockProducer: KafkaProducer = {
        publish: vi.fn().mockResolvedValue([]),
      } as unknown as KafkaProducer;

      const lockCoordinator = new DeviceLockCoordinator(mockLockManager);
      const backoff = new BackoffManager();
      const rawPublisher = new RawEventPublisher(mockProducer);

      const orchestrator = new DevicePollingOrchestrator(
        registry,
        lockCoordinator,
        backoff,
        rawPublisher,
      );

      const syncResult = await orchestrator.syncDevice(sampleDevice);
      expect(syncResult.success).toBe(true);
      expect(syncResult.eventsCount).toBe(5);
      expect(syncResult.nextCursor).toBeDefined();

      // Verify Kafka publish was called 5 times
      expect(mockProducer.publish).toHaveBeenCalledTimes(5);

      // Verify cursor was updated
      const cursor = orchestrator.getCursor('DEV-HQ-ZK01');
      expect(cursor?.lastLogIndex).toBe(5);
    });

    it('should tolerate failing device without blocking or throwing unhandled errors', async () => {
      const registry = new DeviceAdapterRegistry();
      const mockLockManager: RedisLockManager = {
        acquireLock: vi.fn().mockResolvedValue({ acquired: true, token: 't', key: 'k' }),
        releaseLock: vi.fn().mockResolvedValue(true),
      } as unknown as RedisLockManager;

      const mockProducer: KafkaProducer = { publish: vi.fn() } as unknown as KafkaProducer;
      const orchestrator = new DevicePollingOrchestrator(
        registry,
        new DeviceLockCoordinator(mockLockManager),
        new BackoffManager(),
        new RawEventPublisher(mockProducer),
      );

      const failingDevice: DeviceModel = { ...sampleDevice, vendor: 'NON_EXISTENT_VENDOR' };
      const syncResult = await orchestrator.syncDevice(failingDevice);

      expect(syncResult.success).toBe(false);
      expect(syncResult.error).toContain('Device adapter not registered');
    });
  });

  describe('6. DeviceHeartbeatMonitor', () => {
    it('should probe device status and publish DeviceStatusEvent to Kafka', async () => {
      const registry = new DeviceAdapterRegistry();
      const mockAdapter = new StandardMockDeviceAdapter({
        organizationId: 'ORG-TECHIVE',
        deviceId: 'DEV-HQ-ZK01',
      });
      registry.register('ZKTECO', mockAdapter);

      const mockProducer: KafkaProducer = {
        publish: vi.fn().mockResolvedValue([]),
      } as unknown as KafkaProducer;

      const monitor = new DeviceHeartbeatMonitor(registry, mockProducer);
      const probeResult = await monitor.probeDevice(sampleDevice);

      expect(probeResult.deviceId).toBe('DEV-HQ-ZK01');
      expect(probeResult.status).toBe(DeviceStatus.ONLINE);
      expect(mockProducer.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: KAFKA_TOPICS.DEVICE_STATUS,
          key: 'ORG-TECHIVE:DEV-HQ-ZK01',
        }),
      );
    });
  });

  describe('7. CollectorService Lifecycle', () => {
    it('should manage start, fleet configuration, and graceful stop cleanly', async () => {
      const mockLockManager: RedisLockManager = {
        acquireLock: vi.fn().mockResolvedValue({ acquired: true, token: 't', key: 'k' }),
        releaseLock: vi.fn().mockResolvedValue(true),
      } as unknown as RedisLockManager;
      const mockProducer: KafkaProducer = {
        publish: vi.fn().mockResolvedValue([]),
      } as unknown as KafkaProducer;

      const collector = new CollectorService(mockLockManager, mockProducer, undefined, {
        pollIntervalMs: 500,
        heartbeatIntervalMs: 500,
      });

      collector.adapterRegistry.register(
        'ZKTECO',
        new StandardMockDeviceAdapter({
          organizationId: 'ORG-TECHIVE',
          deviceId: 'DEV-HQ-ZK01',
        }),
      );

      collector.setDevices([sampleDevice]);
      expect(collector.getIsRunning()).toBe(false);

      collector.start();
      expect(collector.getIsRunning()).toBe(true);

      await collector.stop();
      expect(collector.getIsRunning()).toBe(false);
    });
  });
});
