import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseClient } from '@attendance/database';
import { DeviceEmployeeMappingRepository } from '@attendance/database';
import { DeviceRepository } from '@attendance/database';
import { OrganizationRepository } from '@attendance/database';
import { type DeviceEmployeeMappingWithDevice } from '@attendance/database';
import { AppLogger } from '@attendance/logging';
import { LOGGER_TOKEN } from '../logging/logging.module.js';
import { CreateMappingApiDto } from './dto/create-mapping.dto.js';
import { UpdateMappingApiDto } from './dto/update-mapping.dto.js';

@Injectable()
export class MappingsService {
  private readonly mappingRepo: DeviceEmployeeMappingRepository;
  private readonly deviceRepo: DeviceRepository;
  private readonly orgRepo: OrganizationRepository;

  constructor(
    @Inject(DatabaseClient) private readonly dbClient: DatabaseClient,
    @Inject(LOGGER_TOKEN) private readonly logger: AppLogger,
  ) {
    this.mappingRepo = new DeviceEmployeeMappingRepository(this.dbClient);
    this.deviceRepo = new DeviceRepository(this.dbClient);
    this.orgRepo = new OrganizationRepository(this.dbClient);
  }

  public async findAll(orgIdOrCode?: string | number): Promise<DeviceEmployeeMappingWithDevice[]> {
    let numericOrgId: number | undefined;
    if (orgIdOrCode) {
      if (typeof orgIdOrCode === 'number') {
        numericOrgId = orgIdOrCode;
      } else {
        const org = await this.orgRepo.findByCode(orgIdOrCode);
        if (org) numericOrgId = org.id;
      }
    }
    return this.mappingRepo.findAll(numericOrgId);
  }

  public async findById(id: number): Promise<DeviceEmployeeMappingWithDevice> {
    const mapping = await this.mappingRepo.findById(id);
    if (!mapping) {
      throw new NotFoundException(`Identity mapping with ID ${id} not found`);
    }
    return mapping;
  }

  public async create(dto: CreateMappingApiDto): Promise<DeviceEmployeeMappingWithDevice> {
    // 1. Resolve organization
    let orgId = 1;
    if (dto.organizationId) {
      if (typeof dto.organizationId === 'number') {
        orgId = dto.organizationId;
      } else {
        const org = await this.orgRepo.findByCode(dto.organizationId);
        if (org) orgId = org.id;
      }
    }

    // 2. Resolve target device
    let targetDeviceId = dto.deviceId;
    if (!targetDeviceId && dto.deviceCode) {
      const dev = await this.deviceRepo.findByOrgAndCode(orgId, dto.deviceCode);
      if (dev) {
        targetDeviceId = dev.id;
      }
    }

    if (!targetDeviceId) {
      // Fallback: pick first active device in the organization if not explicitly provided
      const devices = await this.deviceRepo.listByOrg(orgId);
      if (devices.length > 0 && devices[0]) {
        targetDeviceId = devices[0].id;
      } else {
        throw new BadRequestException('No target device found for mapping');
      }
    }

    // 3. Metadata packing
    const metadata: Record<string, unknown> = {};
    if (dto.employeeName) metadata['employeeName'] = dto.employeeName;
    if (dto.department) metadata['department'] = dto.department;
    if (dto.cardNo) metadata['cardNo'] = dto.cardNo;

    const mappingId = await this.mappingRepo.createOrUpdate({
      organizationId: orgId,
      deviceId: targetDeviceId,
      externalEmployeeId: dto.externalEmployeeId,
      vendorUserId: dto.vendorUserId,
      vendorEmployeeCode: dto.vendorEmployeeCode || dto.vendorUserId,
      status: dto.status || 'ACTIVE',
      metadata,
    });

    this.logger.info(
      {
        mappingId,
        externalEmployeeId: dto.externalEmployeeId,
        vendorUserId: dto.vendorUserId,
        deviceId: targetDeviceId,
      },
      'Created identity mapping',
    );

    return await this.findById(mappingId);
  }

  public async update(
    id: number,
    dto: UpdateMappingApiDto,
  ): Promise<DeviceEmployeeMappingWithDevice> {
    const existing = await this.findById(id);

    // Merge metadata
    const metadata: Record<string, unknown> = { ...(existing.metadata || {}) };
    if (dto.employeeName !== undefined) metadata['employeeName'] = dto.employeeName;
    if (dto.department !== undefined) metadata['department'] = dto.department;
    if (dto.cardNo !== undefined) metadata['cardNo'] = dto.cardNo;

    let targetDeviceId = dto.deviceId;
    if (!targetDeviceId && dto.deviceCode) {
      const dev = await this.deviceRepo.findByOrgAndCode(existing.organization_id, dto.deviceCode);
      if (dev) targetDeviceId = dev.id;
    }

    await this.mappingRepo.update(id, {
      externalEmployeeId: dto.externalEmployeeId,
      vendorUserId: dto.vendorUserId,
      vendorEmployeeCode: dto.vendorEmployeeCode,
      status: dto.status,
      deviceId: targetDeviceId,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });

    this.logger.info({ id }, 'Updated identity mapping');
    return await this.findById(id);
  }

  public async delete(id: number): Promise<void> {
    await this.findById(id);
    await this.mappingRepo.delete(id);
    this.logger.info({ id }, 'Deleted identity mapping');
  }
}
