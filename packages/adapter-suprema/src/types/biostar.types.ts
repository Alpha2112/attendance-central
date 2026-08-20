/**
 * BioStar 2 Event Type IDs / Opcodes.
 */
export enum BioStarEventTypeId {
  VERIFY_SUCCESS_FINGERPRINT = 4096,
  VERIFY_SUCCESS_CARD = 4097,
  VERIFY_SUCCESS_FACE = 4098,
  VERIFY_SUCCESS_PIN = 4100,
  VERIFY_SUCCESS_QR = 4101,
  VERIFY_SUCCESS_MOBILE_BLE = 4102,
  ACCESS_GRANTED_FINGERPRINT = 4864,
  ACCESS_GRANTED_CARD = 4865,
  ACCESS_GRANTED_FACE = 4866,
  ACCESS_GRANTED_PIN = 4867,
  ACCESS_GRANTED_QR = 4868,
  ACCESS_DENIED_INVALID_USER = 4880,
  ACCESS_DENIED_UNREGISTERED = 4881,
  ACCESS_DENIED_EXPIRED = 4882,
}

/**
 * BioStar 2 T&A Function Key codes.
 */
export enum BioStarTnaKey {
  CHECK_IN = 1,
  CHECK_OUT = 2,
  BREAK_OUT = 3,
  BREAK_IN = 4,
}

/**
 * BioStar 2 Login Request payload.
 */
export interface BioStarLoginRequest {
  login_id: string;
  password: string;
  name?: string;
}

/**
 * BioStar 2 active session token & metadata.
 */
export interface BioStarSession {
  sessionId: string;
  username: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * BioStar 2 single event log entry.
 */
export interface BioStarEventLog {
  id: string | number;
  datetime: string; // ISO 8601 string or 'YYYY-MM-DDTHH:mm:ss.SSSZ'
  event_type_id: {
    code: number;
    name?: string;
    description?: string;
  };
  device_id: {
    id: string | number;
    name?: string;
  };
  user_id?: {
    user_id: string;
    name?: string;
    user_group_id?: {
      id: string | number;
      name?: string;
    };
  };
  user_name?: string;
  tna_key?: number;
  door_id?: {
    id: string | number;
    name?: string;
  };
  temperature?: number;
  mask_status?: string;
  has_image?: boolean;
}

/**
 * BioStar 2 Event Search response structure (/api/v2/monitoring/event_log/search or /api/v2/events).
 */
export interface BioStarEventSearchResponse {
  EventCollection: {
    total: string | number;
    rows: BioStarEventLog[];
  };
}

/**
 * BioStar 2 Device details structure (/api/v2/devices/:id).
 */
export interface BioStarDevice {
  id: string | number;
  name: string;
  device_type_id?: {
    id: string | number;
    name?: string;
  };
  device_group_id?: {
    id: string | number;
    name?: string;
  };
  lan?: {
    ip: string;
    port: number;
    use_dhcp: boolean;
  };
  status?: 'NORMAL' | 'DISCONNECTED' | 'LOCKED';
  version?: string;
  firmware_version?: string;
  rs485?: {
    mode: string;
  };
}

/**
 * BioStar 2 connection options.
 */
export interface BioStarConnectionOptions {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  useHttps?: boolean;
  rejectUnauthorized?: boolean;
  timeoutMs?: number;
  mockFallback?: boolean;
  sessionTtlMs?: number;
}

/**
 * Suprema error classification categories.
 */
export enum SupremaErrorCategory {
  TRANSIENT = 'TRANSIENT',
  PERMANENT = 'PERMANENT',
  HARDWARE = 'HARDWARE',
}
