import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  DatabaseClient,
  DeviceRepository,
  OrganizationRepository,
  type DeviceEntity,
} from '@attendance/database';
import { AppLogger } from '@attendance/logging';
import { HikvisionDeviceAdapter } from '@attendance/adapter-hikvision';
import { ZKTecoDeviceAdapter } from '@attendance/adapter-zkteco';
import { SupremaDeviceAdapter } from '@attendance/adapter-suprema';
import { type DeviceModel, DeviceStatus } from '@attendance/contracts';
import { CreateDeviceApiDto } from './dto/create-device.dto.js';
import { UpdateDeviceApiDto } from './dto/update-device.dto.js';

import { LOGGER_TOKEN } from '../logging/logging.module.js';

export interface DeviceProbeResult {
  success: boolean;
  latencyMs?: number;
  serialNumber?: string;
  firmwareVersion?: string;
  details?: Record<string, unknown>;
  error?: string;
  status: string;
}

@Injectable()
export class DevicesService {
  private readonly deviceRepo: DeviceRepository;
  private readonly orgRepo: OrganizationRepository;
  private readonly hikvisionAdapter: HikvisionDeviceAdapter;
  private readonly zktecoAdapter: ZKTecoDeviceAdapter;
  private readonly supremaAdapter: SupremaDeviceAdapter;

  constructor(
    @Inject(DatabaseClient) private readonly db: DatabaseClient,
    @Inject(LOGGER_TOKEN) private readonly logger: AppLogger,
  ) {
    this.deviceRepo = new DeviceRepository(this.db);
    this.orgRepo = new OrganizationRepository(this.db);
    this.hikvisionAdapter = new HikvisionDeviceAdapter(this.logger);
    this.zktecoAdapter = new ZKTecoDeviceAdapter(this.logger);
    this.supremaAdapter = new SupremaDeviceAdapter(this.logger);
  }

  public async findAll(): Promise<DeviceEntity[]> {
    return this.deviceRepo.findAll();
  }

  public async findById(id: number): Promise<DeviceEntity> {
    const device = await this.deviceRepo.findById(id);
    if (!device) {
      throw new NotFoundException(`Device with ID ${id} not found`);
    }
    return device;
  }

  public async create(dto: CreateDeviceApiDto): Promise<DeviceEntity> {
    // Resolve organization numeric ID (default to 1 / ORG-TECHIVE if not specified)
    let orgId = 1;
    if (dto.organizationId) {
      if (typeof dto.organizationId === 'number') {
        orgId = dto.organizationId;
      } else {
        const org = await this.orgRepo.findByCode(dto.organizationId);
        if (org) {
          orgId = org.id;
        }
      }
    }

    // Prepare metadata with credentials if provided
    const metadata: Record<string, unknown> = {};
    if (dto.username) metadata['username'] = dto.username;
    if (dto.password) metadata['password'] = dto.password;
    if (dto.useHttps !== undefined) metadata['useHttps'] = dto.useHttps;

    const existing = await this.deviceRepo.findByOrgAndCode(orgId, dto.deviceCode);
    if (existing) {
      return await this.update(existing.id, dto);
    }

    const vendorUpper = dto.vendor.toUpperCase();
    const defaultProtocol =
      vendorUpper === 'HIKVISION' ? 'ISAPI' : vendorUpper === 'SUPREMA' ? 'GSDK' : 'STANDALONE_SDK';
    const defaultPort =
      vendorUpper === 'HIKVISION' ? 80 : vendorUpper === 'SUPREMA' ? 51211 : 4370;

    try {
      const newId = await this.deviceRepo.create({
        organizationId: orgId,
        deviceCode: dto.deviceCode,
        name: dto.name,
        vendor: vendorUpper,
        model: dto.model,
        protocol: dto.protocol || defaultProtocol,
        connectionMode: dto.connectionMode || 'PUSH',
        host: dto.host,
        port: dto.port || defaultPort,
        timezone: dto.timezone || 'UTC',
        status: dto.status || 'ONLINE',
        metadata,
      });

      return await this.findById(newId);
    } catch (err: unknown) {
      const errorObj = err as { code?: string };
      if (errorObj?.code === 'ER_DUP_ENTRY') {
        throw new BadRequestException(
          `Device code [${dto.deviceCode}] already exists for this organization`,
        );
      }
      throw err;
    }
  }

  public async update(id: number, dto: UpdateDeviceApiDto): Promise<DeviceEntity> {
    const existing = await this.findById(id);
    const metadata: Record<string, unknown> = { ...(existing.metadata || {}) };

    if (dto.username) metadata['username'] = dto.username;
    if (dto.password) metadata['password'] = dto.password;
    if (dto.useHttps !== undefined) metadata['useHttps'] = dto.useHttps;

    await this.deviceRepo.update(id, {
      name: dto.name,
      deviceCode: dto.deviceCode,
      vendor: dto.vendor?.toUpperCase(),
      model: dto.model,
      host: dto.host,
      port: dto.port,
      protocol: dto.protocol,
      connectionMode: dto.connectionMode,
      status: dto.status,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });

    return this.findById(id);
  }

  public async delete(id: number): Promise<void> {
    await this.findById(id);
    await this.deviceRepo.delete(id);
  }

  /**
   * Runs a live probe test against a registered device or dynamic parameters.
   */
  public async probeDevice(idOrDevice: number | CreateDeviceApiDto): Promise<DeviceProbeResult> {
    let device: DeviceModel;
    let deviceId: number | null = null;

    if (typeof idOrDevice === 'number') {
      const entity = await this.findById(idOrDevice);
      deviceId = entity.id;
      device = {
        id: String(entity.id),
        name: entity.name,
        deviceCode: entity.device_code,
        organizationId: String(entity.organization_id),
        vendor: entity.vendor,
        status: (entity.status as DeviceStatus) || DeviceStatus.ONLINE,
        connectionMode: (entity.connection_mode as 'PUSH' | 'PULL' | 'HYBRID') || 'PUSH',
        timezone: entity.timezone || 'UTC',
        host: entity.host || undefined,
        port: entity.port || undefined,
        serialNumber: entity.serial_number || undefined,
        firmwareVersion: entity.firmware_version || undefined,
        metadata: (entity.metadata as Record<string, unknown>) || {},
        createdAt: entity.created_at
          ? new Date(entity.created_at).toISOString()
          : new Date().toISOString(),
        updatedAt: entity.updated_at
          ? new Date(entity.updated_at).toISOString()
          : new Date().toISOString(),
      };
    } else {
      const meta: Record<string, unknown> = {};
      if (idOrDevice.username) meta['username'] = idOrDevice.username;
      if (idOrDevice.password) meta['password'] = idOrDevice.password;
      if (idOrDevice.useHttps !== undefined) meta['useHttps'] = idOrDevice.useHttps;

      device = {
        id: '0',
        name: idOrDevice.name || 'Probe Terminal',
        deviceCode: idOrDevice.deviceCode || 'TEMP-PROBE',
        organizationId: 'ORG-TECHIVE',
        vendor: idOrDevice.vendor?.toUpperCase() || 'HIKVISION',
        status: DeviceStatus.ONLINE,
        connectionMode: idOrDevice.connectionMode || 'PUSH',
        timezone: idOrDevice.timezone || 'UTC',
        host: idOrDevice.host,
        port: idOrDevice.port,
        metadata: meta,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    try {
      let testResult;
      const vendor = String(device.vendor).toUpperCase();

      if (vendor === 'HIKVISION') {
        testResult = await this.hikvisionAdapter.testConnection(device);
      } else if (vendor === 'ZKTECO') {
        testResult = await this.zktecoAdapter.testConnection(device);
      } else if (vendor === 'SUPREMA') {
        testResult = await this.supremaAdapter.testConnection(device);
      } else {
        testResult = await this.hikvisionAdapter.testConnection(device);
      }

      const status = testResult.success ? 'ONLINE' : 'OFFLINE';

      // If probing an existing registered device, update status in DB
      if (deviceId) {
        await this.deviceRepo.updateStatus(deviceId, status, new Date());
        if (testResult.serialNumber || testResult.firmwareVersion) {
          await this.deviceRepo.update(deviceId, {
            serialNumber: testResult.serialNumber,
            firmwareVersion: testResult.firmwareVersion,
          });
        }
      }

      return {
        success: testResult.success,
        latencyMs: testResult.latencyMs || 25,
        serialNumber: testResult.serialNumber,
        firmwareVersion: testResult.firmwareVersion,
        details: testResult.details,
        error: testResult.error,
        status,
      };
    } catch (err: unknown) {
      if (deviceId) {
        await this.deviceRepo.updateStatus(deviceId, 'OFFLINE', new Date());
      }
      const errorMsg =
        err instanceof Error ? err.message : 'Connection timeout or device unreachable';
      return {
        success: false,
        status: 'OFFLINE',
        error: errorMsg,
      };
    }
  }
}
