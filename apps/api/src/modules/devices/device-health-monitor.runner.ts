import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type { AppLogger } from '@attendance/logging';
import { LOGGER_TOKEN } from '../logging/logging.module.js';
import { DevicesService } from './devices.service.js';

/**
 * Automatic ONLINE/OFFLINE status monitor for POLL-based vendors (Hikvision,
 * ZKTeco, Anviz).
 *
 * Suprema is intentionally EXCLUDED: its status is already maintained in real
 * time by the G-SDK gateway connect/disconnect events (see PunchesService), and
 * its `testConnection` opens the shared G-SDK gateway connection — polling it
 * here would churn that connection and could disrupt the live punch stream.
 *
 * STOPPED terminals are also skipped so automatic monitoring never overrides an
 * operator's manual Stop; they resume being probed once Started again.
 *
 * The probe reuses DevicesService.probeDevice (the same path as the manual
 * "Probe Ping"), which persists status + last-seen. The dashboard polls the
 * device list, so changes appear without a manual refresh.
 */
@Injectable()
export class DeviceHealthMonitorRunner implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;

  // Vendors whose status comes from active polling (not a persistent stream).
  private static readonly POLLED_VENDORS = new Set(['HIKVISION', 'ZKTECO', 'ANVIZ', 'DAHUA']);

  private readonly intervalMs = Number(process.env['DEVICE_HEALTH_INTERVAL_MS'] ?? 15000);

  constructor(
    // Explicit @Inject: this app runs under tsx/esbuild, which does not emit
    // decorator type-metadata, so Nest cannot infer class deps without a token.
    @Inject(DevicesService) private readonly devicesService: DevicesService,
    @Inject(LOGGER_TOKEN) private readonly logger: AppLogger,
  ) {}

  public onModuleInit(): void {
    setTimeout(() => void this.sweep(), 3000);
    this.timer = setInterval(() => void this.sweep(), this.intervalMs);
    this.logger.info(
      { intervalMs: this.intervalMs, vendors: [...DeviceHealthMonitorRunner.POLLED_VENDORS] },
      'Device health monitor started (poll-based ONLINE/OFFLINE detection; Suprema handled by G-SDK events)',
    );
  }

  public onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sweep(): Promise<void> {
    if (this.sweeping) return; // never overlap a slow sweep with the next tick
    this.sweeping = true;
    try {
      const devices = await this.devicesService.findAll();
      const monitored = devices.filter(
        (d) =>
          DeviceHealthMonitorRunner.POLLED_VENDORS.has(String(d.vendor).toUpperCase()) &&
          String(d.status).toUpperCase() !== 'STOPPED',
      );

      const results = await Promise.allSettled(
        monitored.map((d) => this.devicesService.probeDevice(d.id)),
      );

      let online = 0;
      let offline = 0;
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.success) online++;
        else offline++;
      }
      this.logger.debug(
        { checked: monitored.length, online, offline },
        'Device health sweep complete (poll-based vendors)',
      );
    } catch (err: unknown) {
      this.logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'Device health sweep failed',
      );
    } finally {
      this.sweeping = false;
    }
  }
}
