# Suprema G-SDK Device Adapter Guide & Validation Manual

## 1. Overview

The `@attendance/adapter-suprema` package integrates **Suprema biometric terminals**
(BioStation 3, FaceStation, BioEntry, X-Station…) using the official **Suprema G-SDK**.

The adapter is a **gRPC client** of a Suprema **Device Gateway**. The gateway connects to
the terminal over Suprema's binary protocol. **BioStar 2 is not required.**

```text
┌──────────────────────────┐   gRPC + TLS (:4000)   ┌───────────────────────┐   TCP 51211 / 51213 (SSL)   ┌──────────────────┐
│  @attendance/collector   │ ─────────────────────▶ │  Suprema Device       │ ─────────────────────────▶  │  BioStation 3     │
│  (SupremaDeviceAdapter)  │                        │  Gateway (Go binary)  │                             │  (and other BS2   │
└──────────────────────────┘                        └───────────────────────┘                             │   devices)        │
                                                                                                            └──────────────────┘
```

## 2. Supported Hardware (via G-SDK v1.5.0+)

BioStation 3 / 3 Max, BioStation 2/A2/L2, FaceStation F2 / 2 / FaceLite,
BioEntry W2/P2/R2/Plus, X-Station 2, CoreStation — i.e. all BioStar 2 devices.
BioStation 3 requires firmware ≥ `v1.0.0_20220901`.

## 3. gRPC Services Used

| Service   | RPC                                          | Purpose                                   |
| --------- | -------------------------------------------- | ----------------------------------------- |
| `Connect` | `Connect` / `AddAsyncConnection`             | Connect the gateway to the terminal by IP |
| `Connect` | `GetDeviceList` / `SubscribeStatus`          | Connection status                         |
| `Device`  | `GetInfo`                                    | Model, firmware, MAC                       |
| `Event`   | `GetLog`                                     | Historical attendance logs (paginated)    |
| `Event`   | `EnableMonitoring` + `SubscribeRealtimeLog`  | Real-time punch stream                     |
| `Time`    | `Get` / `Set`                                | Read / synchronize the device RTC         |

## 4. Event Mapping

A log is treated as an attendance punch when its `eventCode` is a success event:
`4096` VERIFY_SUCCESS, `4864` IDENTIFY_SUCCESS, `5632` DUAL_AUTH_SUCCESS.

- **Verification type** comes from the event `subCode` (via `event_code.json`):
  face / fingerprint / card / QR / PIN.
- **Punch type** comes from the `TNAKey`: `1`→IN, `2`→OUT, `3`→BREAK_OUT, `4`→BREAK_IN.
- **Idempotency key** is `vendorEventId = <deviceID>:<logID>` (the per-device monotonic
  counter), shared by live delivery and historical backfill.

## 5. Prerequisites

1. **Device Gateway** running and reachable (see [`deploy/suprema-gateway/README.md`](../../deploy/suprema-gateway/README.md)).
2. The licensed **G-SDK proto files** at `vendor/suprema-gsdk/proto/`.
3. Environment:

```env
SUPREMA_GATEWAY_ADDR=127.0.0.1:4000
SUPREMA_GATEWAY_CA_CERT=./deploy/suprema-gateway/cert/ca.crt
SUPREMA_GSDK_PROTO_DIR=./vendor/suprema-gsdk/proto
SUPREMA_GSDK_EVENT_CODE_FILE=./vendor/suprema-gsdk/event_code.json
SUPREMA_DEVICE_IP=192.168.1.3     # terminal IP
SUPREMA_DEVICE_PORT=51211         # 51213 if SSL enabled on the device
SUPREMA_DEVICE_SSL=false
```

## 6. How to Test Against a Physical BioStation 3

### Step 1 — Start the gateway

```powershell
docker compose --profile suprema up -d suprema-gateway
```

### Step 2 — Connection probe (identity + firmware)

```powershell
pnpm run suprema:test-conn
```

> Connects the gateway to the terminal, calls `Device.GetInfo`, and logs the model
> (e.g. `BS3-DB`), firmware, and gateway deviceID.

### Step 3 — Device info

```powershell
pnpm run suprema:device-info
```

### Step 4 — Historical sync (publishes to Kafka)

```powershell
pnpm run suprema:sync-once
```

> Pulls stored logs via `Event.GetLog`, normalizes punches, and publishes to
> `attendance.raw.v1`.

### Step 5 — Real-time streaming

```powershell
pnpm run suprema:listen-realtime
```

> Opens `EnableMonitoring` + `SubscribeRealtimeLog`. Authenticate on the terminal and the
> punch appears immediately. Reconnects with backoff and reconciles missed events via
> `GetLog` after an interruption.

### Step 6 — Verify in Kafka UI

Open <http://localhost:8080> → Topics → `attendance.raw.v1` → Messages.
