import { DeviceVendor, PunchType } from '../enums.js';

export function normalizePunchType(vendor: DeviceVendor | string, rawCode: unknown): PunchType {
  if (rawCode === null || rawCode === undefined) {
    return PunchType.UNKNOWN;
  }

  const strCode = String(rawCode).trim();
  const upperCode = strCode.toUpperCase();
  const normalizedVendor = typeof vendor === 'string' ? vendor.toUpperCase() : vendor;

  // Already a canonical PunchType value
  if (Object.values(PunchType).includes(upperCode as PunchType)) {
    return upperCode as PunchType;
  }

  switch (normalizedVendor) {
    case DeviceVendor.ZKTECO:
    case 'ZKTECO': {
      // ZKTeco standard state codes
      switch (strCode) {
        case '0':
        case 'CHECK_IN':
        case 'IN':
        case 'DUTY_ON':
          return PunchType.IN;
        case '1':
        case 'CHECK_OUT':
        case 'OUT':
        case 'DUTY_OFF':
          return PunchType.OUT;
        case '2':
        case 'BREAK_OUT':
        case 'OUT_BACK':
          return PunchType.BREAK_OUT;
        case '3':
        case 'BREAK_IN':
        case 'IN_BACK':
          return PunchType.BREAK_IN;
        case '4':
        case 'OVERTIME_IN':
        case 'OT_IN':
          return PunchType.OVERTIME_IN;
        case '5':
        case 'OVERTIME_OUT':
        case 'OT_OUT':
          return PunchType.OVERTIME_OUT;
        default:
          return PunchType.UNKNOWN;
      }
    }

    case DeviceVendor.HIKVISION:
    case 'HIKVISION': {
      switch (upperCode) {
        case 'CHECKIN':
        case 'CHECK_IN':
        case 'ENTRY':
        case '0':
          return PunchType.IN;
        case 'CHECKOUT':
        case 'CHECK_OUT':
        case 'EXIT':
        case '1':
          return PunchType.OUT;
        case 'BREAKOUT':
        case 'BREAK_OUT':
        case '2':
          return PunchType.BREAK_OUT;
        case 'BREAKIN':
        case 'BREAK_IN':
        case '3':
          return PunchType.BREAK_IN;
        default:
          return PunchType.UNKNOWN;
      }
    }

    case DeviceVendor.SUPREMA:
    case 'SUPREMA': {
      switch (upperCode) {
        case 'IN':
        case 'CHECK_IN':
        case 'START_WORK':
        case '0':
          return PunchType.IN;
        case 'OUT':
        case 'CHECK_OUT':
        case 'LEAVE_WORK':
        case '1':
          return PunchType.OUT;
        case 'BREAK_OUT':
        case 'START_BREAK':
        case '2':
          return PunchType.BREAK_OUT;
        case 'BREAK_IN':
        case 'END_BREAK':
        case '3':
          return PunchType.BREAK_IN;
        default:
          return PunchType.UNKNOWN;
      }
    }

    default: {
      if (upperCode.includes('IN') && !upperCode.includes('BREAK') && !upperCode.includes('OUT')) {
        return PunchType.IN;
      }
      if (upperCode.includes('OUT') && !upperCode.includes('BREAK') && !upperCode.includes('IN')) {
        return PunchType.OUT;
      }
      return PunchType.UNKNOWN;
    }
  }
}
