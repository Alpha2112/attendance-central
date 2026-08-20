# ZKTeco Device Adapter Guide & Validation Manual

## 1. Overview

The `@attendance/adapter-zkteco` package provides enterprise-grade connectivity to ZKTeco biometric terminals. It supports two primary communication modes:

1. **Standalone Protocol (TCP 4370)**: Direct binary packet communication with on-premise hardware terminals (command handshake, 16-bit one's complement checksum, incremental attendance log reads, RTC synchronization).
2. **ADMS / ICLOCK Push (HTTP 80/8080/443)**: Ingestion of real-time push streams (`POST /iclock/cdata?table=ATTLOG`) from enterprise push-enabled terminals.

---

## 2. Supported Hardware Models

- **Multimodal Facial & Fingerprint**: SilkBio-100TC, SilkBio-101TC, MB2000, MB160, uFace800, G3 / G4.
- **Fingerprint & RFID Standalone**: iClock 880, iClock 360, K40, IN01, F18, F19, F22.
- **Proximity / Card Readers**: SC405, SC105.

---

## 3. Communication Protocols & Ports

| Protocol             | Default Port  | Direction             | Description                                                               |
| -------------------- | ------------- | --------------------- | ------------------------------------------------------------------------- |
| **Standalone TCP**   | `4370`        | Platform $\to$ Device | Binary command framing (`CMD_CONNECT`, `CMD_ATTLOG_RRQ`, `CMD_GET_TIME`). |
| **Standalone UDP**   | `4370`        | Platform $\to$ Device | Legacy binary packet protocol for older firmware.                         |
| **ADMS Push (HTTP)** | `80` / `8080` | Device $\to$ Platform | Cloud / Push server mode. Device sends `POST /iclock/cdata` requests.     |

---

## 4. Verification Codes & Punch States

### Punch Status (`status`)

| ZKTeco Code | Canonical Domain Punch Type | Meaning                           |
| ----------- | --------------------------- | --------------------------------- |
| `0`         | `CHECK_IN`                  | Standard Morning / Shift Check-In |
| `1`         | `CHECK_OUT`                 | Evening / Shift Check-Out         |
| `2`         | `BREAK_OUT`                 | Meal / Rest Break Departure       |
| `3`         | `BREAK_IN`                  | Break Return                      |
| `4`         | `OVERTIME_IN`               | Overtime Start                    |
| `5`         | `OVERTIME_OUT`              | Overtime End                      |

### Verification Modes (`verify` / `verified`)

| ZKTeco Code | Canonical Mode | Meaning                               |
| ----------- | -------------- | ------------------------------------- |
| `1`         | `FINGERPRINT`  | Optical / SilkID Fingerprint sensor   |
| `2`         | `PIN`          | Numeric keypad password / PIN         |
| `4`         | `CARD`         | RFID / Mifare proximity card          |
| `15`        | `FACE`         | Visible Light / IR Facial Recognition |
| `25`        | `PALM`         | Near-Infrared Palm vein / print       |

---

## 5. Known Limitations & Edge-Case Handling

1. **24-Byte User ID Buffer**: Older firmware limits `pin` / `userId` to 9 or 24 alphanumeric characters. The parser strips null padding (`\0`) automatically.
2. **Clock Drift Without NTP**: Hardware RTCs on unmanaged networks can drift $\pm 30$ seconds per month. The adapter provides `getClock` and `setClock` capabilities for periodic drift correction.
3. **Communication Key (CommKey)**: Older devices send CommKey as an integer (default `0`). Always store CommKeys securely and never commit plaintext keys.
4. **Offline Backlog Bursts**: When an offline terminal reconnects, it re-emits up to 10,000 cached records. The platform's SHA-256 idempotency fingerprint (`generateEventFingerprint`) guarantees duplicate stability.

---

## 6. Real-Device Physical Validation Checklist

When commissioning a real ZKTeco terminal on-site, complete the following verification steps:

- [ ] **Network Reachability**: Ping device IP from collector host (`ping <device_ip>`).
- [ ] **Port Check**: Verify TCP port 4370 is accessible (`Test-NetConnection -ComputerName <device_ip> -Port 4370`).
- [ ] **CommKey Alignment**: Ensure the CommKey set in device menu (`Comm -> PC Connection -> Comm Key`) matches `secretReference`.
- [ ] **Connection Test**: Run `pnpm run collector:test-conn` and verify `ONLINE` status.
- [ ] **Live Punch Test**: Place a registered finger/face on the terminal and run `pnpm run collector:sync-once` to observe log ingestion.
- [ ] **Kafka Ingestion Check**: Confirm the raw record arrives in Kafka topic `attendance.raw.v1` via Kafka UI (`http://localhost:8080`).
- [ ] **Time Synchronization**: Verify device RTC time aligns within 5 seconds of UTC server time.
