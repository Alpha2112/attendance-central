import { DeviceSimulator } from './engine/device-simulator.js';
import { DeviceVendor } from '@attendance/contracts';
import { createLogger } from '@attendance/logging';

async function main(): Promise<void> {
  const mode = process.argv[2] || 'single';
  const logger = createLogger({ serviceName: 'device-simulator', level: 'info' });

  const simulator = new DeviceSimulator({
    organizationId: '1',
    branchId: '1',
    deviceId: '1',
    deviceSerialNumber: 'ZK-SN-99881122',
    vendor: DeviceVendor.ZKTECO,
    adapter: 'zkteco-standalone',
  });

  switch (mode) {
    case 'single': {
      const punch = simulator.generatePunch();
      logger.info({ punch }, 'Generated single simulated raw punch');
      console.log(JSON.stringify(punch, null, 2));
      break;
    }

    case 'duplicates': {
      const base = simulator.generatePunch({ vendorUserId: '457' });
      const duplicates = simulator.generateDuplicates(base, 10);
      logger.info(
        { count: duplicates.length, vendorUserId: '457' },
        'Generated 10 duplicate raw punch events',
      );
      console.log(JSON.stringify(duplicates, null, 2));
      break;
    }

    case 'offline': {
      const result = simulator.simulateOfflinePeriod(8, 15, 120);
      logger.info(
        {
          totalPunches: result.punches.length,
          clockDriftSeconds: result.clockDriftSecondsApplied,
          transitions: result.deviceStatusTransitions,
        },
        'Simulated 8-hour offline period with backlog replay and clock drift',
      );
      console.log(`Generated ${result.punches.length} buffered punches from 8h offline window.`);
      break;
    }

    case 'batch': {
      const batch = simulator.generateBatch(100);
      logger.info({ count: batch.length }, 'Generated batch of 100 historical punches');
      console.log(`Generated ${batch.length} batch punches across employee cohort.`);
      break;
    }

    default:
      logger.error(
        `Unknown simulator mode '${mode}'. Use 'single', 'duplicates', 'offline', or 'batch'.`,
      );
      process.exit(1);
  }
}

main();
