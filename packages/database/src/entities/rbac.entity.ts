import { type RowDataPacket } from 'mysql2/promise';

export interface UserEntity extends RowDataPacket {
  id: number;
  organization_id: number;
  email: string;
  password_hash: string;
  full_name: string;
  avatar_url: string | null;
  status: string; // ACTIVE | INACTIVE
  must_change_password: number; // 0 | 1
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface RoleEntity extends RowDataPacket {
  id: number;
  organization_id: number | null;
  code: string;
  name: string;
  description: string | null;
  is_system: number; // 0 | 1
  created_at: Date;
  updated_at: Date;
}

export interface PermissionEntity extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  description: string;
  module: string;
  page: string;
  action: string;
  created_at: Date;
}

export interface CreateUserDto {
  email: string;
  passwordHash: string;
  fullName: string;
  avatarUrl?: string | null;
  status?: string;
  mustChangePassword?: boolean;
  organizationId?: number;
}

export interface CreateRoleDto {
  code: string;
  name: string;
  description?: string | null;
  isSystem?: boolean;
  organizationId?: number | null;
}
