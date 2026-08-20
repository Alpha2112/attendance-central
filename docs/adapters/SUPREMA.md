# Suprema / BioStar 2 Device Adapter Guide & Validation Manual

## 1. Overview

The `@attendance/adapter-suprema` package provides an enterprise adapter for **Suprema biometric and RFID access control systems** interfacing via the centralized **BioStar 2 API** (REST & WebSockets).

---

## 2. Supported Hardware Models (via BioStar 2)

- **Facial Recognition Terminals**:
  - `FaceStation F2`, `FaceStation 2`, `FaceLite`
- **Multimodal & RFID Terminals**:
  - `BioStation 3`, `BioStation 2`, `BioStation A2`, `BioStation L2`
- **Compact Fingerprint & Card Readers**:
  - `BioEntry W2`, `BioEntry P2`, `BioEntry Plus`, `BioEntry R2`
- **Smart Card & QR Readers**:
  - `X-Station 2` (RFID, QR Code, Mobile Access BLE/NFC)
- **Centralized Controllers**:
  - `CoreStation (CS-40)`

---

## 3. Communication Architecture

```text
┌────────────────────────────────────────────────────────┐
│               Suprema Terminal Fleet                   │
│   (BioStation 3, FaceStation F2, BioEntry W2, etc.)   │
└──────────────────────────┬─────────────────────────────┘
                           │ TCP / RS-485 / OSDP
                           ▼
┌────────────────────────────────────────────────────────┐
│                   BioStar 2 Server                     │
│               (Port 80 / 443 / 8080)                   │
└──────────────────────────┬─────────────────────────────┘
                           │ REST API + WebSockets
                           │ (bs-session-id token)
                           ▼
┌────────────────────────────────────────────────────────┐
│         @attendance/adapter-suprema Connector          │
│       (Session Manager + Realtime + Reconciliation)    │
└────────────────────────────────────────────────────────┘
```

---

## 4. BioStar 2 REST & WebSocket Endpoints

| Endpoint                              | Method        | Description                                                         |
| ------------------------------------- | ------------- | ------------------------------------------------------------------- |
| `/api/v2/login`                       | `POST`        | Authenticates administrator credentials and yields `bs-session-id`. |
| `/api/v2/devices`                     | `GET`         | Queries fleet of registered Suprema devices.                        |
| `/api/v2/devices/:id`                 | `GET`         | Inspects device details (firmware version, IP, status).             |
| `/api/v2/devices/:id/time`            | `GET` / `PUT` | Queries and synchronizes device Real-Time Clock (RTC).              |
| `/api/v2/monitoring/event_log/search` | `POST`        | Searches historical attendance punches with pagination.             |
| `/api/v2/monitoring/events`           | `WebSocket`   | Real-time event stream for immediate punch ingestion.               |

---

## 5. Event Codes & Verification Modes

### Verification Type Mapping

| BioStar Event Code | Description                                    | Platform Verification Mode |
| ------------------ | ---------------------------------------------- | -------------------------- |
| `4098`, `4866`     | Facial Verification Pass / Access Granted      | `FACE` (`15`)              |
| `4096`, `4864`     | Fingerprint Verification Pass / Access Granted | `FINGERPRINT` (`1`)        |
| `4097`, `4865`     | RFID Proximity Card Pass / Access Granted      | `CARD` (`4`)               |
| `4100`, `4867`     | PIN Verification Pass                          | `PIN` (`2`)                |
| `4101`, `4868`     | Dynamic QR Code Pass                           | `QR` (`30`)                |
| `4102`             | Mobile Access (BLE / NFC)                      | `MOBILE` (`40`)            |

### T&A Key Mapping

| BioStar TNA Key | Domain Meaning | Platform PunchType |
| --------------- | -------------- | ------------------ |
| `1`             | Check-In       | `IN`               |
| `2`             | Check-Out      | `OUT`              |
| `3`             | Break-Out      | `BREAK_OUT`        |
| `4`             | Break-In       | `BREAK_IN`         |

---

## 6. How to Test Your Suprema / BioStar 2 Integration

### Step 1: Configure BioStar 2 Credentials in `.env`

Add your BioStar 2 Server details to `.env`:

```env
BIOSTAR_HOST=192.168.1.50          # IP of your BioStar 2 Server
BIOSTAR_PORT=80                   # BioStar web port (or 443 for HTTPS)
BIOSTAR_USERNAME=admin             # BioStar administrator username
BIOSTAR_PASSWORD=YourPassword123  # BioStar administrator password
BIOSTAR_USE_HTTPS=false            # Set to true if using HTTPS
```

---

### Step 2: Test Server Reachability & Session Authentication (CLI)

```powershell
pnpm run suprema:test-conn
```

> **Expected Output**: Authenticates with BioStar 2 Server via `POST /api/v2/login`, verifies `bs-session-id`, and logs connection latency.

---

### Step 3: Inspect Connected Devices (CLI)

```powershell
pnpm run suprema:device-info
```

> **Expected Output**: Retrieves connected device models (e.g. BioStation 3, FaceStation F2), serial numbers, and firmware versions.

---

### Step 4: Incremental Event Synchronization (CLI)

```powershell
pnpm run suprema:sync-once
```

> **Expected Output**: Searches historical logs via `/api/v2/monitoring/event_log/search`, converts events into `RawAttendanceEvent`, and publishes records to Kafka `attendance.raw.v1`.

---

### Step 5: Real-time Live Event Streaming (CLI)

```powershell
pnpm run suprema:listen-realtime
```

> **Expected Output**: Opens a persistent WebSocket stream to `/api/v2/monitoring/events`. When any employee punches on any registered BioStar device, the event is immediately captured and logged.
