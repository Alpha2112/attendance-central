# Device Adapter Development Guide

## 1. Goal

A new attendance-device vendor must be addable without modifying:
- normalization rules framework;
- attendance API;
- HRMS integration engine;
- dashboard domain contracts.

Vendor code belongs behind an adapter.

---

## 2. Base Adapter Contract

```ts
export interface AttendanceDeviceAdapter {
  readonly vendor: DeviceVendor;
  readonly capabilities: readonly DeviceCapability[];

  testConnection(
    device: DeviceConfiguration,
    signal?: AbortSignal
  ): Promise<ConnectionTestResult>;

  fetchLogs(
    device: DeviceConfiguration,
    cursor?: SyncCursor,
    signal?: AbortSignal
  ): Promise<FetchLogsResult>;

  getStatus(
    device: DeviceConfiguration,
    signal?: AbortSignal
  ): Promise<DeviceStatus>;

  getDeviceInfo?(
    device: DeviceConfiguration,
    signal?: AbortSignal
  ): Promise<DeviceInformation>;

  getClock?(
    device: DeviceConfiguration,
    signal?: AbortSignal
  ): Promise<DeviceClock>;

  setClock?(
    device: DeviceConfiguration,
    timestamp: Date,
    signal?: AbortSignal
  ): Promise<void>;
}
```

Optional capabilities:

```ts
export interface PushAttendanceAdapter {
  handlePush(
    request: DevicePushRequest
  ): Promise<RawAttendanceEvent[]>;
}

export interface RealtimeAttendanceAdapter {
  subscribe(
    device: DeviceConfiguration,
    handler: AttendanceEventHandler,
    signal: AbortSignal
  ): Promise<void>;
}

export interface DeviceUserMappingAdapter {
  synchronizeMapping(
    device: DeviceConfiguration,
    mapping: DeviceEmployeeMapping,
    signal?: AbortSignal
  ): Promise<void>;
}
```

---

## 3. Capabilities

Declare capabilities explicitly:

```text
PULL_LOGS
PUSH_LOGS
REALTIME_EVENTS
USER_MAPPING
CLOCK_READ
CLOCK_WRITE
DEVICE_STATUS
FACE
FINGERPRINT
CARD
PALM
PIN
```

Do not infer capabilities from vendor name alone.

---

## 4. Adapter Responsibilities

The adapter:
- understands vendor protocol/API/SDK;
- authenticates to vendor/device;
- handles vendor sessions;
- converts raw vendor events to `RawAttendanceEvent`;
- exposes vendor status;
- exposes a continuation cursor/checkpoint;
- classifies errors;
- never performs HRMS business logic;
- never writes normalized attendance directly.

---

## 5. Adapter Output

Every vendor record becomes a canonical raw event before leaving the adapter boundary.

Required minimum:
- `eventId`;
- `deviceId`;
- `vendor`;
- `adapter`;
- `vendorUserId`;
- `deviceTime`;
- `receivedAt`;
- `source`;
- `rawPayload`.

---

## 6. Cursor Design

A cursor may contain:

```json
{
  "lastVendorEventId": "12345",
  "lastDeviceTime": "2026-08-15T08:00:00+03:00",
  "vendorCursor": {}
}
```

The adapter should not mutate the persisted checkpoint until downstream ingestion has durably accepted the batch.

---

## 7. Error Classification

Map vendor errors into platform-level errors:

```text
TransientDeviceError
DeviceAuthenticationError
UnsupportedDeviceFeatureError
VendorProtocolError
NetworkTimeoutError
ConfigurationError
```

Examples:

### Retryable
- timeout;
- connection reset;
- HTTP 502/503;
- temporary vendor server outage.

### Usually permanent until operator action
- invalid password;
- invalid communication key;
- unsupported firmware feature;
- malformed configuration.

---

## 8. Push Connectors

For push devices:
- expose a dedicated endpoint;
- authenticate/allowlist when protocol permits;
- validate body size;
- respond within vendor timing expectations;
- publish raw event quickly;
- avoid expensive synchronous normalization inside the push request.

---

## 9. Realtime Streams

Realtime streams/WebSockets must:
- reconnect with backoff;
- use jitter;
- detect stale sessions;
- support cancellation;
- emit health metrics;
- pair with reconciliation when historical retrieval exists.

---

## 10. Testing a New Adapter

Required:
- mapping unit tests;
- malformed payload tests;
- duplicate vendor event tests;
- timeout tests;
- auth failure tests;
- reconnect tests;
- cursor tests;
- clock drift tests where supported;
- simulator/fixture tests.

Real-hardware validation is required before declaring the connector production-certified.

---

## 11. Vendor Connector Definition of Done

- Adapter implements only supported capabilities.
- Every external call has timeout.
- Secrets come from secret abstraction.
- Logs are redacted.
- Metrics exist.
- Error types are classified.
- Reconnect/retry is bounded.
- Raw event contract validates.
- Historical reconciliation is documented.
- Known firmware/model limitations are documented.
- Automated tests pass.
- Real-device test checklist exists.
