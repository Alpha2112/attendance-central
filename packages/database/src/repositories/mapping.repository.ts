import { DatabaseClient } from '../pool.js';
import {
  type DeviceEmployeeMappingEntity,
  type DeviceEmployeeMappingWithDevice,
  type CreateMappingDto,
} from '../entities/mapping.entity.js';
import { type ResultSetHeader } from 'mysql2/promise';

export class DeviceEmployeeMappingRepository {
  constructor(private readonly client: DatabaseClient) {}

  public async findMapping(
    deviceId: number,
    vendorUserId: string,
  ): Promise<DeviceEmployeeMappingEntity | null> {
    const rows = await this.client.query<DeviceEmployeeMappingEntity[]>(
      'SELECT * FROM device_employee_mappings WHERE device_id = ? AND vendor_user_id = ? LIMIT 1',
      [deviceId, vendorUserId],
    );
    return rows[0] || null;
  }

  public async findByDeviceAndExternalEmployeeId(
    deviceId: number,
    externalEmployeeId: string,
  ): Promise<DeviceEmployeeMappingEntity | null> {
    const rows = await this.client.query<DeviceEmployeeMappingEntity[]>(
      'SELECT * FROM device_employee_mappings WHERE device_id = ? AND external_employee_id = ? LIMIT 1',
      [deviceId, externalEmployeeId],
    );
    return rows[0] || null;
  }

  public async findById(id: number): Promise<DeviceEmployeeMappingWithDevice | null> {
    const rows = await this.client.query<DeviceEmployeeMappingWithDevice[]>(
      `SELECT 
        m.*,
        d.device_code,
        d.name AS device_name,
        d.vendor,
        d.model,
        d.host,
        d.port
      FROM device_employee_mappings m
      LEFT JOIN devices d ON d.id = m.device_id
      WHERE m.id = ?
      LIMIT 1`,
      [id],
    );
    return rows[0] || null;
  }

  public async findByExternalEmployeeId(
    organizationId: number,
    externalEmployeeId: string,
  ): Promise<DeviceEmployeeMappingEntity[]> {
    return this.client.query<DeviceEmployeeMappingEntity[]>(
      'SELECT * FROM device_employee_mappings WHERE organization_id = ? AND external_employee_id = ?',
      [organizationId, externalEmployeeId],
    );
  }

  public async findAll(organizationId?: number): Promise<DeviceEmployeeMappingWithDevice[]> {
    if (organizationId) {
      return this.client.query<DeviceEmployeeMappingWithDevice[]>(
        `SELECT 
          m.*,
          d.device_code,
          d.name AS device_name,
          d.vendor,
          d.model,
          d.host,
          d.port
        FROM device_employee_mappings m
        LEFT JOIN devices d ON d.id = m.device_id
        WHERE m.organization_id = ?
        ORDER BY m.updated_at DESC, m.id DESC`,
        [organizationId],
      );
    }
    return this.client.query<DeviceEmployeeMappingWithDevice[]>(
      `SELECT 
        m.*,
        d.device_code,
        d.name AS device_name,
        d.vendor,
        d.model,
        d.host,
        d.port
      FROM device_employee_mappings m
      LEFT JOIN devices d ON d.id = m.device_id
      ORDER BY m.updated_at DESC, m.id DESC`,
    );
  }

  /** Number of employee mappings bound to an organization. */
  public async countByOrganization(organizationId: number): Promise<number> {
    const rows = await this.client.query<
      Array<{ n: number } & import('mysql2/promise').RowDataPacket>
    >('SELECT COUNT(*) AS n FROM device_employee_mappings WHERE organization_id = ?', [
      organizationId,
    ]);
    return Number(rows[0]?.n ?? 0);
  }

  public async createOrUpdate(dto: CreateMappingDto): Promise<number> {
    // 1. Check if external_employee_id is already mapped on this device
    const existingByEmp = await this.findByDeviceAndExternalEmployeeId(
      dto.deviceId,
      dto.externalEmployeeId,
    );

    // 2. Check if vendor_user_id is already mapped on this device
    const existingByVendor = await this.findMapping(dto.deviceId, dto.vendorUserId);

    if (existingByEmp) {
      // If vendor_user_id is taken by a different obsolete record on the same device, delete the obsolete record first
      if (existingByVendor && existingByVendor.id !== existingByEmp.id) {
        await this.delete(existingByVendor.id);
      }

      await this.update(existingByEmp.id, {
        externalEmployeeId: dto.externalEmployeeId,
        vendorUserId: dto.vendorUserId,
        vendorEmployeeCode: dto.vendorEmployeeCode || dto.vendorUserId,
        status: dto.status || 'ACTIVE',
        deviceId: dto.deviceId,
        metadata: dto.metadata,
      });
      return existingByEmp.id;
    }

    if (existingByVendor) {
      // Re-bind existing vendor user ID to new external employee ID
      await this.update(existingByVendor.id, {
        externalEmployeeId: dto.externalEmployeeId,
        vendorUserId: dto.vendorUserId,
        vendorEmployeeCode: dto.vendorEmployeeCode || dto.vendorUserId,
        status: dto.status || 'ACTIVE',
        deviceId: dto.deviceId,
        metadata: dto.metadata,
      });
      return existingByVendor.id;
    }

    // 3. Clean 1-to-1 insert
    const result = await this.client.query<ResultSetHeader>(
      `INSERT INTO device_employee_mappings (
        tenant_id, organization_id, device_id, external_employee_id,
        vendor_user_id, vendor_employee_code, status, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        external_employee_id = VALUES(external_employee_id),
        vendor_employee_code = VALUES(vendor_employee_code),
        status = VALUES(status),
        metadata = VALUES(metadata),
        updated_at = CURRENT_TIMESTAMP(6)`,
      [
        dto.tenantId || null,
        dto.organizationId,
        dto.deviceId,
        dto.externalEmployeeId,
        dto.vendorUserId,
        dto.vendorEmployeeCode || null,
        dto.status || 'ACTIVE',
        dto.metadata ? JSON.stringify(dto.metadata) : null,
      ],
    );

    if (result.insertId) {
      return result.insertId;
    }
    const created = await this.findMapping(dto.deviceId, dto.vendorUserId);
    return created ? created.id : 0;
  }

  public async update(id: number, fields: Partial<CreateMappingDto>): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (fields.externalEmployeeId !== undefined) {
      setClauses.push('external_employee_id = ?');
      values.push(fields.externalEmployeeId);
    }
    if (fields.vendorUserId !== undefined) {
      setClauses.push('vendor_user_id = ?');
      values.push(fields.vendorUserId);
    }
    if (fields.vendorEmployeeCode !== undefined) {
      setClauses.push('vendor_employee_code = ?');
      values.push(fields.vendorEmployeeCode);
    }
    if (fields.status !== undefined) {
      setClauses.push('status = ?');
      values.push(fields.status);
    }
    if (fields.deviceId !== undefined) {
      setClauses.push('device_id = ?');
      values.push(fields.deviceId);
    }
    if (fields.organizationId !== undefined) {
      setClauses.push('organization_id = ?');
      values.push(fields.organizationId);
    }
    if (fields.tenantId !== undefined) {
      setClauses.push('tenant_id = ?');
      values.push(fields.tenantId ?? null);
    }
    if (fields.metadata !== undefined) {
      setClauses.push('metadata = ?');
      values.push(JSON.stringify(fields.metadata));
    }

    if (setClauses.length === 0) return;

    values.push(id);
    await this.client.query(
      `UPDATE device_employee_mappings SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP(6) WHERE id = ?`,
      values,
    );
  }

  public async delete(id: number): Promise<void> {
    await this.client.query('DELETE FROM device_employee_mappings WHERE id = ?', [id]);
  }
}
