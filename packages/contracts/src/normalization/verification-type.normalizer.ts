import { DeviceVendor, VerificationType } from '../enums.js';

export function normalizeVerificationType(
  vendor: DeviceVendor | string,
  rawCode: unknown,
): VerificationType {
  if (rawCode === null || rawCode === undefined) {
    return VerificationType.UNKNOWN;
  }

  const strCode = String(rawCode).trim();
  const upperCode = strCode.toUpperCase();
  const normalizedVendor = typeof vendor === 'string' ? vendor.toUpperCase() : vendor;

  // Already canonical
  if (Object.values(VerificationType).includes(upperCode as VerificationType)) {
    return upperCode as VerificationType;
  }

  switch (normalizedVendor) {
    case DeviceVendor.ZKTECO:
    case 'ZKTECO': {
      switch (upperCode) {
        case '1':
        case 'FP':
        case 'FINGERPRINT':
          return VerificationType.FINGERPRINT;
        case '15':
        case 'FACE':
          return VerificationType.FACE;
        case '2':
        case 'PIN':
        case 'PASSWORD':
          return VerificationType.PIN;
        case '4':
        case 'CARD':
        case 'RFID':
          return VerificationType.CARD;
        case '8':
        case 'PALM':
          return VerificationType.PALM;
        case 'QR':
        case 'QRCODE':
          return VerificationType.QR;
        default:
          return VerificationType.UNKNOWN;
      }
    }

    case DeviceVendor.HIKVISION:
    case 'HIKVISION': {
      switch (upperCode) {
        case 'FACE':
        case '1':
          return VerificationType.FACE;
        case 'FP':
        case 'FINGERPRINT':
        case '2':
          return VerificationType.FINGERPRINT;
        case 'CARD':
        case '3':
          return VerificationType.CARD;
        case 'PASSWORD':
        case 'PIN':
        case '4':
          return VerificationType.PIN;
        case 'IRIS':
        case '5':
          return VerificationType.IRIS;
        case 'QR':
        case 'QRCODE':
          return VerificationType.QR;
        default:
          return VerificationType.UNKNOWN;
      }
    }

    case DeviceVendor.SUPREMA:
    case 'SUPREMA': {
      switch (upperCode) {
        case 'FINGERPRINT':
        case 'FP':
          return VerificationType.FINGERPRINT;
        case 'FACE':
          return VerificationType.FACE;
        case 'CARD':
          return VerificationType.CARD;
        case 'PIN':
          return VerificationType.PIN;
        case 'QR':
        case 'QRCODE':
          return VerificationType.QR;
        case 'BLE':
        case 'BLUETOOTH':
          return VerificationType.BLUETOOTH;
        default:
          return VerificationType.UNKNOWN;
      }
    }

    default: {
      if (upperCode.includes('FACE')) return VerificationType.FACE;
      if (upperCode.includes('FINGER') || upperCode.includes('FP'))
        return VerificationType.FINGERPRINT;
      if (upperCode.includes('CARD') || upperCode.includes('RFID')) return VerificationType.CARD;
      if (upperCode.includes('PIN') || upperCode.includes('PASS')) return VerificationType.PIN;
      if (upperCode.includes('PALM')) return VerificationType.PALM;
      if (upperCode.includes('QR')) return VerificationType.QR;
      if (upperCode.includes('IRIS')) return VerificationType.IRIS;
      return VerificationType.UNKNOWN;
    }
  }
}
