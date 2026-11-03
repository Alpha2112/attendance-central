import fs from 'node:fs';
import path from 'node:path';
import { PunchType, VerificationType } from '@attendance/contracts';
import { type AppLogger } from '@attendance/logging';

/**
 * G-SDK event codes that represent a successful authentication, i.e. an
 * attendance punch. Everything else (door/zone/device/system events) is ignored.
 *
 *   4096 = BS2_EVENT_VERIFY_SUCCESS   (1:1 authentication)
 *   4864 = BS2_EVENT_IDENTIFY_SUCCESS (1:N authentication)
 *   5632 = BS2_EVENT_DUAL_AUTH_SUCCESS
 */
export const PUNCH_EVENT_CODES: ReadonlySet<number> = new Set<number>([4096, 4864, 5632]);

export function isPunchEvent(eventCode: number): boolean {
  return PUNCH_EVENT_CODES.has(eventCode);
}

/**
 * Maps a G-SDK T&A key (tna.Key) to the canonical platform punch type.
 * KEY_1..KEY_4 follow Suprema's default Check-In/Out / Break convention.
 */
export function mapTnaKeyToPunchType(tnaKey: number | undefined): string {
  switch (tnaKey) {
    case 1:
      return PunchType.IN;
    case 2:
      return PunchType.OUT;
    case 3:
      return PunchType.BREAK_OUT;
    case 4:
      return PunchType.BREAK_IN;
    default:
      return PunchType.UNKNOWN;
  }
}

export interface EventCodeEntry {
  event_code: number;
  event_code_str: string;
  sub_code: number;
  sub_code_str: string;
  desc: string;
}

interface EventCodeFile {
  entries: EventCodeEntry[];
}

/**
 * Loads the official G-SDK `event_code.json` catalog and derives the canonical
 * verification type for a (eventCode, subCode) pair from the credential named in
 * the sub-code. Degrades gracefully (UNKNOWN) when the catalog is unavailable.
 */
export class EventCodeCatalog {
  private readonly map = new Map<string, EventCodeEntry>();
  private readonly loaded: boolean;

  /** Builds a catalog directly from entries (used by tests and in-memory callers). */
  public static fromEntries(entries: EventCodeEntry[]): EventCodeCatalog {
    const catalog = new EventCodeCatalog('\u0000__none__');
    for (const entry of entries) {
      catalog.map.set(`${entry.event_code}:${entry.sub_code}`, entry);
    }
    return catalog;
  }

  constructor(filePath?: string, logger?: AppLogger) {
    if (filePath === '\u0000__none__') {
      this.loaded = true;
      return;
    }
    const resolved = EventCodeCatalog.resolvePath(filePath);
    if (resolved && fs.existsSync(resolved)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(resolved, 'utf-8')) as EventCodeFile;
        for (const entry of parsed.entries ?? []) {
          this.map.set(`${entry.event_code}:${entry.sub_code}`, entry);
        }
        this.loaded = this.map.size > 0;
      } catch (err: unknown) {
        logger?.warn(
          { error: err instanceof Error ? err.message : String(err), file: resolved },
          'Failed to parse G-SDK event_code.json; verification types will be UNKNOWN',
        );
        this.loaded = false;
      }
    } else {
      this.loaded = false;
    }
  }

  private static resolvePath(filePath?: string): string | undefined {
    if (filePath) return filePath;
    const fromEnv = process.env['SUPREMA_GSDK_EVENT_CODE_FILE'];
    if (fromEnv) return fromEnv;
    const protoDir = process.env['SUPREMA_GSDK_PROTO_DIR'];
    if (protoDir) return path.join(protoDir, '..', 'event_code.json');
    return undefined;
  }

  public get isLoaded(): boolean {
    return this.loaded;
  }

  /** Human-readable description for a (eventCode, subCode) pair, if known. */
  public describe(eventCode: number, subCode: number): string | undefined {
    return this.map.get(`${eventCode}:${subCode}`)?.desc;
  }

  /**
   * Derives the canonical verification type from the credential named in the
   * sub-code (priority: face > fingerprint > card/mobile > QR > PIN).
   */
  public verificationType(eventCode: number, subCode: number): string {
    const subStr = (this.map.get(`${eventCode}:${subCode}`)?.sub_code_str ?? '').toUpperCase();
    if (subStr.includes('FACE')) return VerificationType.FACE;
    if (subStr.includes('FINGER')) return VerificationType.FINGERPRINT;
    if (subStr.includes('CARD') || subStr.includes('MOBILE')) return VerificationType.CARD;
    if (subStr.includes('QR')) return VerificationType.QR;
    if (subStr.includes('PIN')) return VerificationType.PIN;
    return VerificationType.UNKNOWN;
  }
}
