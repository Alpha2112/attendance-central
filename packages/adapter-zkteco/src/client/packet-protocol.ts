import { ZKCommand } from '../types/zkteco.types.js';

export const ZK_MAGIC_TCP = 0x5050; // 'PP'
export const ZK_TCP_HEADER_MAGIC = Buffer.from([0x50, 0x50, 0x82, 0x7d]);

export interface ZKPacketHeader {
  commandId: number;
  checksum: number;
  sessionId: number;
  replyId: number;
}

export interface ZKDecodedPacket {
  header: ZKPacketHeader;
  payload: Buffer;
  commandId: number;
  isAckOk: boolean;
  isAckError: boolean;
  isAckData: boolean;
  isAckUnauth: boolean;
}

/**
 * Calculates standard ZKTeco 16-bit binary checksum.
 */
export function calculateZkChecksum(buffer: Buffer): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 2) {
    if (i + 1 < buffer.length) {
      sum += buffer.readUInt16LE(i);
    } else {
      sum += buffer.readUInt8(i);
    }
  }

  while (sum > 0xffff) {
    sum = (sum & 0xffff) + (sum >> 16);
  }

  return ~sum & 0xffff;
}

/**
 * Encodes a ZKTeco binary command packet with TCP envelope.
 */
export function buildZkPacket(
  commandId: ZKCommand | number,
  sessionId: number,
  replyId: number,
  payload: Buffer = Buffer.alloc(0),
): Buffer {
  // Command header: 8 bytes (command 2B, checksum 2B, session 2B, replyId 2B)
  const headerBuf = Buffer.alloc(8);
  headerBuf.writeUInt16LE(commandId, 0);
  headerBuf.writeUInt16LE(0, 2); // Checksum placeholder
  headerBuf.writeUInt16LE(sessionId, 4);
  headerBuf.writeUInt16LE(replyId, 6);

  const bodyBuf = Buffer.concat([headerBuf, payload]);
  const checksum = calculateZkChecksum(bodyBuf);
  headerBuf.writeUInt16LE(checksum, 2);

  const fullPacket = Buffer.concat([headerBuf, payload]);

  // For TCP: Prefix with 4-byte magic + 4-byte length
  const tcpPrefix = Buffer.alloc(8);
  tcpPrefix.writeUInt16LE(ZK_MAGIC_TCP, 0);
  tcpPrefix.writeUInt16LE(0x7d82, 2);
  tcpPrefix.writeUInt32LE(fullPacket.length, 4);

  return Buffer.concat([tcpPrefix, fullPacket]);
}

/**
 * Decodes a raw TCP stream buffer into a ZKTeco packet.
 */
export function parseZkPacket(buffer: Buffer): ZKDecodedPacket {
  if (buffer.length < 8) {
    throw new Error(`Packet too small: received ${buffer.length} bytes, expected at least 8 bytes`);
  }

  let offset = 0;

  // If TCP magic prefix is present (8 bytes prefix)
  if (
    buffer.length >= 16 &&
    buffer.readUInt16LE(0) === ZK_MAGIC_TCP &&
    buffer.readUInt16LE(2) === 0x7d82
  ) {
    offset = 8;
  }

  const commandId = buffer.readUInt16LE(offset);
  const checksum = buffer.readUInt16LE(offset + 2);
  const sessionId = buffer.readUInt16LE(offset + 4);
  const replyId = buffer.readUInt16LE(offset + 6);
  const payload = buffer.subarray(offset + 8);

  return {
    header: {
      commandId,
      checksum,
      sessionId,
      replyId,
    },
    payload,
    commandId,
    isAckOk: commandId === ZKCommand.CMD_ACK_OK,
    isAckError: commandId === ZKCommand.CMD_ACK_ERROR,
    isAckData: commandId === ZKCommand.CMD_ACK_DATA,
    isAckUnauth: commandId === ZKCommand.CMD_ACK_UNAUTH,
  };
}

/**
 * Decodes ZKTeco 32-bit packed attendance timestamp.
 * Formula: ((year - 2000) * 12 * 31 + ((month - 1) * 31) + day - 1) * (24 * 60 * 60) + (hour * 60 + minute) * 60 + second
 */
export function decodeZkTimestamp(encoded: number): string {
  const second = encoded % 60;
  let remaining = Math.floor(encoded / 60);

  const minute = remaining % 60;
  remaining = Math.floor(remaining / 60);

  const hour = remaining % 24;
  remaining = Math.floor(remaining / 24);

  const day = (remaining % 31) + 1;
  remaining = Math.floor(remaining / 31);

  const month = (remaining % 12) + 1;
  remaining = Math.floor(remaining / 12);

  const year = remaining + 2000;

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}.000Z`;
}

/**
 * Encodes an ISO Date into ZKTeco 32-bit packed timestamp.
 */
export function encodeZkTimestamp(date: Date): number {
  const year = date.getUTCFullYear() - 2000;
  const month = date.getUTCMonth();
  const day = date.getUTCDate() - 1;
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();

  return (year * 12 * 31 + month * 31 + day) * 24 * 60 * 60 + (hour * 60 + minute) * 60 + second;
}
