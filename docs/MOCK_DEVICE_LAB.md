# Mock Device Lab & Hardware Simulators

The Mock Device Lab provides deterministic, software-defined biometric terminals (ZKTeco, Hikvision, Suprema) to validate the integration architecture without physical hardware.

---

## 1. Simulator Capabilities

- **Single / Realtime Punches**: Normal attendance events with configurable verification methods (`FINGERPRINT`, `FACE`, `CARD`, `PIN`, `PALM`, `QR`).
- **Duplicate Punches**: Burst generator producing $N$ identical logical punches to test database-level idempotency and deduplication.
- **Offline Backlog Replay**: Models 8-hour device outages where punches accumulate in local device buffers and are bulk-replayed with clock drift on reconnect.
- **Clock Drift**: Simulates device RTC skew ($\pm \Delta t$).
- **Chaos / Failure Modes**: Simulates `TIMEOUT`, `AUTH_FAILURE`, `MALFORMED_PAYLOAD`, and `OUT_OF_ORDER` streams.

---

## 2. CLI Usage

From the repository root:

### Generate a Single Simulated Punch

```bash
pnpm --filter @attendance/simulator sim single
```

### Generate a Burst of 10 Duplicate Punches

```bash
pnpm --filter @attendance/simulator sim duplicates
```

### Simulate 8-Hour Offline Window with Backlog Replay

```bash
pnpm --filter @attendance/simulator sim offline
```

### Generate a Historical Batch of 100 Punches

```bash
pnpm --filter @attendance/simulator sim batch
```

---

## 3. Programmatic Usage in Integration Tests

```typescript
import { DeviceSimulator, MockDeviceAdapter } from '@attendance/simulator';
import { DeviceVendor, PunchType, VerificationType } from '@attendance/contracts';

const simulator = new DeviceSimulator({
  organizationId: '10',
  deviceId: '201',
  vendor: DeviceVendor.ZKTECO,
  adapter: 'zkteco-standalone',
});

// Generate 10 duplicates of one punch
const punch = simulator.generatePunch({ vendorUserId: '457', punchType: PunchType.IN });
const duplicates = simulator.generateDuplicates(punch, 10);
```
