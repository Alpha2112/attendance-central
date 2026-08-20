import { type RowDataPacket } from 'mysql2/promise';

export interface ApiClientEntity extends RowDataPacket {
  id: number;
  organization_id: number;
  client_id: string;
  client_name: string;
  client_secret_hash: string;
  roles: string[];
  status: string;
  created_at: Date;
  updated_at: Date;
}
