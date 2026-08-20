import { DatabaseClient } from '../pool.js';
import { type DeviceEntity, type CreateDeviceDto } from '../entities/device.entity.js';
import { type ResultSetHeader } from 'mysql2/promise';

export class DeviceRepository {
  constructor(private readonly client: DatabaseClient) {}

  public async findById(id: number): Promise<DeviceEntity | null> {
    const rows = await this.client.query<DeviceEntity[]>(
      'SELECT * FROM devices WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] || null;
  }

  public async findByOrgAndCode(
    organizationId: number,
    deviceCode: string,
  ): Promise<DeviceEntity | null> {
    const rows = await this.client.query<DeviceEntity[]>(
      'SELECT * FROM devices WHERE organization_id = ? AND device_code = ? LIMIT 1',
      [organizationId, deviceCode],
    );
    return rows[0] || null;
  }

  public async findBySerial(serialNumber: string): Promise<DeviceEntity | null> {
    const rows = await this.client.query<DeviceEntity[]>(
      'SELECT * FROM devices WHERE serial_number = ? LIMIT 1',
      [serialNumber],
    );
    return rows[0] || null;
  }

  public async create(dto: CreateDeviceDto): Promise<number> {
    const result = await this.client.query<ResultSetHeader>(
      `INSERT INTO devices (
        tenant_id, organization_id, branch_id, device_type_id,
        device_code, serial_number, name, vendor, model, protocol,
        connection_mode, host, port, timezone, secret_reference,
        status, firmware_version, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dto.tenantId || null,
        dto.organizationId,
        dto.branchId || null,
        dto.deviceTypeId || null,
        dto.deviceCode,
        dto.serialNumber || null,
        dto.name,
        dto.vendor,
        dto.model || null,
        dto.protocol || null,
        dto.connectionMode || 'PUSH',
        dto.host || null,
        dto.port || null,
        dto.timezone || 'UTC',
        dto.secretReference || null,
        dto.status || 'REGISTERED',
        dto.firmwareVersion || null,
        dto.metadata ? JSON.stringify(dto.metadata) : null,
      ],
    );
    return result.insertId;
  }

  public async updateStatus(
    id: number,
    status: string,
    lastSeenAt: Date = new Date(),
  ): Promise<void> {
    await this.client.query('UPDATE devices SET status = ?, last_seen_at = ? WHERE id = ?', [
      status,
      lastSeenAt,
      id,
    ]);
  }

  public async updateLastSync(id: number, lastSyncAt: Date = new Date()): Promise<void> {
    await this.client.query('UPDATE devices SET last_sync_at = ? WHERE id = ?', [lastSyncAt, id]);
  }

  public async findAll(): Promise<DeviceEntity[]> {
    return this.client.query<DeviceEntity[]>('SELECT * FROM devices ORDER BY id DESC');
  }

  public async listByOrg(organizationId: number): Promise<DeviceEntity[]> {
    return this.client.query<DeviceEntity[]>(
      'SELECT * FROM devices WHERE organization_id = ? ORDER BY id ASC',
      [organizationId],
    );
  }

  public async update(id: number, fields: Partial<CreateDeviceDto>): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (fields.name !== undefined) {
      setClauses.push('name = ?');
      values.push(fields.name);
    }
    if (fields.deviceCode !== undefined) {
      setClauses.push('device_code = ?');
      values.push(fields.deviceCode);
    }
    if (fields.vendor !== undefined) {
      setClauses.push('vendor = ?');
      values.push(fields.vendor);
    }
    if (fields.model !== undefined) {
      setClauses.push('model = ?');
      values.push(fields.model);
    }
    if (fields.host !== undefined) {
      setClauses.push('host = ?');
      values.push(fields.host);
    }
    if (fields.port !== undefined) {
      setClauses.push('port = ?');
      values.push(fields.port);
    }
    if (fields.protocol !== undefined) {
      setClauses.push('protocol = ?');
      values.push(fields.protocol);
    }
    if (fields.connectionMode !== undefined) {
      setClauses.push('connection_mode = ?');
      values.push(fields.connectionMode);
    }
    if (fields.status !== undefined) {
      setClauses.push('status = ?');
      values.push(fields.status);
    }
    if (fields.serialNumber !== undefined) {
      setClauses.push('serial_number = ?');
      values.push(fields.serialNumber);
    }
    if (fields.firmwareVersion !== undefined) {
      setClauses.push('firmware_version = ?');
      values.push(fields.firmwareVersion);
    }
    if (fields.metadata !== undefined) {
      setClauses.push('metadata = ?');
      values.push(JSON.stringify(fields.metadata));
    }

    if (setClauses.length === 0) return;

    values.push(id);
    await this.client.query(`UPDATE devices SET ${setClauses.join(', ')} WHERE id = ?`, values);
  }

  public async delete(id: number): Promise<void> {
    await this.client.query('DELETE FROM devices WHERE id = ?', [id]);
  }
}
