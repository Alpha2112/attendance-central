/**
 * The authenticated principal attached to each request by JwtAuthGuard.
 */
export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  status: string;
  mustChangePassword: boolean;
  roles: string[]; // role codes
  permissions: string[]; // permission codes
}
