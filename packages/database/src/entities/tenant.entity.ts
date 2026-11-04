import { type RowDataPacket } from 'mysql2/promise';

export interface TenantEntity extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTenantDto {
  code: string;
  name: string;
  status?: string;
}
