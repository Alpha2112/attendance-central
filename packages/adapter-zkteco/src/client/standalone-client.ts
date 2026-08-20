import net from 'node:net';
import {
  ZKCommand,
  type ZKConnectionOptions,
  type ZKStandaloneLogRecord,
} from '../types/zkteco.types.js';
import {
  buildZkPacket,
  parseZkPacket,
  decodeZkTimestamp,
  encodeZkTimestamp,
} from './packet-protocol.js';
import { type AppLogger } from '@attendance/logging';

export class ZKStandaloneClient {
  private socket: net.Socket | null = null;
  private sessionId = 0;
  private replyId = 0;
  private isConnected = false;

  constructor(
    private readonly options: ZKConnectionOptions,
    private readonly logger?: AppLogger,
  ) {}

  /**
   * Connects to device over TCP and performs protocol handshake.
   */
  public async connect(): Promise<boolean> {
    if (this.isConnected) return true;

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      this.socket = socket;
      const timeoutMs = this.options.timeoutMs ?? 5000;

      socket.setTimeout(timeoutMs);

      socket.on('timeout', () => {
        socket.destroy();
        reject(
          new Error(
            `TCP connection timeout after ${timeoutMs}ms to ${this.options.host}:${this.options.port}`,
          ),
        );
      });

      socket.on('error', (err) => {
        this.isConnected = false;
        reject(err);
      });

      socket.connect(this.options.port, this.options.host, async () => {
        try {
          // Send CMD_CONNECT handshake
          const connectPacket = buildZkPacket(ZKCommand.CMD_CONNECT, 0, 0);
          socket.write(connectPacket);

          socket.once('data', (data) => {
            try {
              const decoded = parseZkPacket(data);
              if (decoded.isAckOk || decoded.isAckData) {
                this.sessionId = decoded.header.sessionId;
                this.replyId = decoded.header.replyId;
                this.isConnected = true;
                this.logger?.debug(
                  { host: this.options.host, port: this.options.port, sessionId: this.sessionId },
                  'ZKTeco standalone TCP handshake succeeded',
                );
                resolve(true);
              } else if (decoded.isAckUnauth) {
                reject(
                  new Error('ZKTeco authentication rejected: Invalid commKey or unauthorized'),
                );
              } else {
                reject(
                  new Error(`ZKTeco connection failed with response code ${decoded.commandId}`),
                );
              }
            } catch (parseErr: unknown) {
              reject(parseErr);
            }
          });
        } catch (err: unknown) {
          reject(err);
        }
      });
    });
  }

  /**
   * Sends a command and waits for a response packet.
   */
  public async executeCommand(
    command: ZKCommand,
    payload: Buffer = Buffer.alloc(0),
    timeoutMs = 5000,
  ): Promise<Buffer> {
    if (!this.isConnected || !this.socket) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for command ${command} response`));
      }, timeoutMs);

      const dataHandler = (data: Buffer) => {
        try {
          const decoded = parseZkPacket(data);
          if (decoded.isAckOk || decoded.isAckData) {
            clearTimeout(timer);
            this.socket?.removeListener('data', dataHandler);
            resolve(decoded.payload);
          } else if (decoded.isAckUnauth) {
            clearTimeout(timer);
            this.socket?.removeListener('data', dataHandler);
            reject(new Error(`ZKTeco command ${command} rejected: Unauthorized`));
          } else {
            clearTimeout(timer);
            this.socket?.removeListener('data', dataHandler);
            reject(new Error(`ZKTeco command ${command} failed with code ${decoded.commandId}`));
          }
        } catch (err: unknown) {
          clearTimeout(timer);
          this.socket?.removeListener('data', dataHandler);
          reject(err);
        }
      };

      this.socket!.on('data', dataHandler);

      this.replyId = (this.replyId + 1) & 0xffff;
      const packet = buildZkPacket(command, this.sessionId, this.replyId, payload);
      this.socket!.write(packet);
    });
  }

  /**
   * Queries hardware Real-Time Clock (RTC).
   */
  public async getTime(): Promise<Date> {
    const payload = await this.executeCommand(ZKCommand.CMD_GET_TIME);
    if (payload.length >= 4) {
      const encoded = payload.readUInt32LE(0);
      const isoStr = decodeZkTimestamp(encoded);
      return new Date(isoStr);
    }
    return new Date();
  }

  /**
   * Sets hardware Real-Time Clock (RTC).
   */
  public async setTime(date: Date): Promise<void> {
    const encoded = encodeZkTimestamp(date);
    const payload = Buffer.alloc(4);
    payload.writeUInt32LE(encoded, 0);
    await this.executeCommand(ZKCommand.CMD_SET_TIME, payload);
  }

  /**
   * Reads attendance records from terminal buffer.
   */
  public async getAttendanceLogs(): Promise<ZKStandaloneLogRecord[]> {
    const records: ZKStandaloneLogRecord[] = [];
    const payload = await this.executeCommand(ZKCommand.CMD_ATTLOG_RRQ);

    // Modern ZKTeco firmware uses 40-byte attendance log records:
    // [0-1]: User SN (UInt16LE)
    // [2-25]: User PIN / ID string (24 bytes null-terminated ASCII)
    // [26]: Verified (UInt8)
    // [27-30]: Encoded Timestamp (UInt32LE)
    // [31]: Status (UInt8: 0=CheckIn, 1=CheckOut, etc.)
    // [32-35]: Workcode (UInt32LE)
    const RECORD_SIZE = 40;
    const count = Math.floor(payload.length / RECORD_SIZE);

    for (let i = 0; i < count; i++) {
      const offset = i * RECORD_SIZE;
      try {
        const userSn = payload.readUInt16LE(offset);
        const userId = payload
          .subarray(offset + 2, offset + 26)
          .toString('ascii')
          .replace(/\0/g, '')
          .trim();
        const verified = payload.readUInt8(offset + 26);
        const encodedTime = payload.readUInt32LE(offset + 27);
        const status = payload.readUInt8(offset + 31);
        const workcode = payload.readUInt32LE(offset + 32);

        records.push({
          userSn,
          userId: userId || String(userSn),
          verified,
          status,
          timestamp: decodeZkTimestamp(encodedTime),
          workcode,
        });
      } catch (rowErr: unknown) {
        this.logger?.warn(
          { offset, error: rowErr instanceof Error ? rowErr.message : String(rowErr) },
          'Skipping corrupted ZKTeco log record in binary buffer',
        );
      }
    }

    return records;
  }

  /**
   * Closes TCP socket gracefully.
   */
  public async disconnect(): Promise<void> {
    if (this.socket && this.isConnected) {
      try {
        const exitPacket = buildZkPacket(ZKCommand.CMD_EXIT, this.sessionId, this.replyId);
        this.socket.write(exitPacket);
      } catch {
        // Ignore write error on disconnect
      }
      this.socket.destroy();
    }
    this.socket = null;
    this.isConnected = false;
  }

  public getConnected(): boolean {
    return this.isConnected;
  }
}
