/**
 * Hikvision ISAPI Major Event Types.
 */
export enum HikvisionMajorEvent {
  MAJOR_ALARM = 1,
  MAJOR_EXCEPTION = 2,
  MAJOR_OPERATION = 3,
  MAJOR_EVENT = 4,
  MAJOR_ACCESS_CONTROL = 5,
}

/**
 * Hikvision ISAPI Minor Event Types (Access Control Major = 5).
 */
export enum HikvisionMinorEvent {
  MINOR_LEGAL_CARD_PASS = 1,
  MINOR_CARD_AND_PSW_PASS = 2,
  MINOR_CARD_AND_PSW_FAIL = 3,
  MINOR_CARD_AND_PSW_TIMEOUT = 4,
  MINOR_DOOR_BUTTON_PRESS = 10,
  MINOR_FINGERPRINT_PASS = 38,
  MINOR_FINGERPRINT_AND_PASSWORD_PASS = 39,
  MINOR_FACE_VERIFY_PASS = 75,
  MINOR_FACE_AND_CARD_PASS = 76,
  MINOR_FACE_AND_CARD_AND_PASSWORD_PASS = 77,
  MINOR_FACE_AND_FINGERPRINT_PASS = 78,
  MINOR_FACE_VERIFY_FAIL = 79,
  MINOR_QR_CODE_PASS = 80,
}

/**
 * ISAPI System Device Information response (/ISAPI/System/deviceInfo).
 */
export interface HikvisionDeviceInfo {
  deviceName?: string;
  deviceID?: string;
  model: string;
  serialNumber: string;
  macAddress?: string;
  firmwareVersion: string;
  firmwareReleasedDate?: string;
  encoderVersion?: string;
  decoderVersion?: string;
  hardwareVersion?: string;
  deviceType?: string;
  telecontrolID?: number;
  support?: string[];
}

/**
 * ISAPI System Time structure (/ISAPI/System/time).
 */
export interface HikvisionDeviceTime {
  timeMode: 'manual' | 'NTP';
  localTime: string; // ISO 8601 string or 'YYYY-MM-DDTHH:mm:ss+ZZ:ZZ'
  timeZone: string;
}

/**
 * Single access event entry in ISAPI AcsEvent response.
 */
export interface HikvisionAcsEventRecord {
  major: number;
  minor: number;
  time: string; // ISO timestamp
  cardNo?: string;
  cardType?: number;
  name?: string;
  employeeNoString?: string; // Standard employee identifier
  userType?: string;
  doorNo?: number;
  currentVerifyMode?: string; // e.g. 'face', 'card', 'fingerprint'
  serialNo?: number;
  type?: number;
  mask?: string;
  temperature?: number;
  pictureURL?: string;
}

/**
 * AcsEvent search response payload.
 */
export interface HikvisionAcsEventSearchResult {
  AcsEvent: {
    totalMatches: number;
    responseStatusStrg: 'OK' | 'MORE' | 'NO MATCH';
    numOfMatches: number;
    InfoList?: HikvisionAcsEventRecord[];
  };
}

/**
 * Connection options for Hikvision ISAPI Client.
 */
export interface HikvisionConnectionOptions {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  useHttps?: boolean;
  rejectUnauthorized?: boolean;
  timeoutMs?: number;
  mockFallback?: boolean;
}

/**
 * Error category classification for Hikvision operations.
 */
export enum HikvisionErrorCategory {
  TRANSIENT = 'TRANSIENT',
  PERMANENT = 'PERMANENT',
  HARDWARE = 'HARDWARE',
}
