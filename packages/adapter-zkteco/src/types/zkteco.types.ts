/**
 * ZKTeco Standalone Protocol Command Codes.
 */
export enum ZKCommand {
  CMD_CONNECT = 1000,
  CMD_EXIT = 1001,
  CMD_ENABLEDEVICE = 1002,
  CMD_DISABLEDEVICE = 1003,
  CMD_RESTART = 1004,
  CMD_POWEROFF = 1005,
  CMD_ATTLOG_RRQ = 8, // Read attendance log records
  CMD_CLEAR_ATTLOG = 9,
  CMD_GET_TIME = 201,
  CMD_SET_TIME = 202,
  CMD_GET_DEVICE_STATUS = 1014,
  CMD_GET_DEVICE_INFO = 11,

  // Response Codes
  CMD_ACK_OK = 2000,
  CMD_ACK_ERROR = 2001,
  CMD_ACK_DATA = 2002,
  CMD_ACK_RETRY = 2003,
  CMD_ACK_REPEAT = 2004,
  CMD_ACK_UNAUTH = 2005,
}

/**
 * Parsed record from ZKTeco Standalone buffer.
 */
export interface ZKStandaloneLogRecord {
  userSn: number; // Internal device user sequence number
  userId: string; // User ID / PIN (e.g. "457")
  verified: number; // Verification method (1=FP, 2=PIN, 4=Card, 15=Face)
  status: number; // Punch state (0=Check-In, 1=Check-Out, 2=Break-Out, 3=Break-In, 4=OT-In, 5=OT-Out)
  timestamp: string; // ISO timestamp
  workcode: number;
}

/**
 * Parsed record from ZKTeco ADMS/ICLOCK HTTP push line.
 */
export interface ZKAdmsLogRecord {
  pin: string;
  time: string;
  status: string; // e.g. "0", "1"
  verify: string; // e.g. "1", "15"
  workcode?: string;
  reserved1?: string;
  reserved2?: string;
}

/**
 * Standalone TCP connection configuration.
 */
export interface ZKConnectionOptions {
  host: string;
  port: number;
  timeoutMs?: number;
  commKey?: number; // Communication password (0 default)
  inMemoryMockFallback?: boolean;
}

/**
 * Error category classification for ZKTeco operations.
 */
export enum ZKErrorCategory {
  TRANSIENT = 'TRANSIENT',
  PERMANENT = 'PERMANENT',
  HARDWARE = 'HARDWARE',
}
