# Hikvision Device Adapter Guide & Physical Hardware Validation Manual

## 1. Overview

The `@attendance/adapter-hikvision` package enables communication with Hikvision access control and time attendance terminals using the **ISAPI (Intelligent Security API)** protocol over HTTP/HTTPS with **RFC 7616 Digest Authentication**.

---

## 2. Supported Hardware Models

- **MinMoe Facial Recognition Terminals**:
  - `DS-K1T341AMF`, `DS-K1T342MFX`, `DS-K1T343MWX`
  - `DS-K1T671MF`, `DS-K1T673DX`, `DS-K1T680DFX`
- **Fingerprint & Card Terminals**:
  - `DS-K1T804AMF`, `DS-K1T804EF`, `DS-K1T8003MF`
- **Speed Gates & Turnstile Controllers**:
  - `DS-K3B801`, `DS-K3Y411X`
- **Access Controllers**:
  - `DS-K2600`, `DS-K2800` Series

---

## 3. Communication Protocols & Ports

| Port          | Protocol    | Usage                  | Description                                                 |
| ------------- | ----------- | ---------------------- | ----------------------------------------------------------- |
| `80` / `8000` | HTTP        | ISAPI REST             | Default unencrypted ISAPI endpoint.                         |
| `443`         | HTTPS       | ISAPI REST (TLS)       | Recommended encrypted endpoint.                             |
| `8080`        | HTTP (Push) | Alert Stream / Webhook | Terminal pushes real-time HTTP events to platform listener. |

---

## 4. ISAPI Endpoints Used

| Endpoint                                    | Method        | Purpose                                                                  |
| ------------------------------------------- | ------------- | ------------------------------------------------------------------------ |
| `/ISAPI/System/deviceInfo?format=json`      | `GET`         | Probes device model, serial number, firmware version, and MAC address.   |
| `/ISAPI/System/time?format=json`            | `GET` / `PUT` | Reads and synchronizes device Real-Time Clock (RTC).                     |
| `/ISAPI/System/status?format=json`          | `GET`         | Evaluates CPU, memory, and runtime health.                               |
| `/ISAPI/AccessControl/AcsEvent?format=json` | `POST`        | Incremental retrieval of access & attendance punch logs with pagination. |
| `/ISAPI/Event/notification/alertStream`     | `GET`         | Real-time multipart event subscription stream.                           |

---

## 5. Event Codes & Verification Modes

### Major Event Codes

- `major: 5` $\to$ **Access Control Event** (Standard attendance punches)

### Minor Event Codes

| Minor Code | Domain Meaning               | Canonical Verification Mode |
| ---------- | ---------------------------- | --------------------------- |
| `75`       | Facial Recognition Pass      | `FACE` (`15`)               |
| `76`       | Face + Card Combination Pass | `FACE` (`15`)               |
| `1`        | Proximity Card Pass          | `CARD` (`4`)                |
| `2`        | Card + Password Pass         | `CARD` (`4`)                |
| `38`       | Fingerprint Match Pass       | `FINGERPRINT` (`1`)         |
| `39`       | Fingerprint + Password Pass  | `FINGERPRINT` (`1`)         |
| `80`       | Dynamic QR Code Pass         | `QR` (`30`)                 |
| `10`       | Door Exit Button Press       | `PIN` (`2`)                 |

---

## 6. How to Test Your Physical Hikvision Device

If you have a physical Hikvision terminal on your local network, follow these steps to test and verify connectivity:

### Step 1: Configure Device IP & Credentials in `.env`

Open your `.env` file (or set environment variables in your terminal) with your device's actual network IP and admin password:

```env
HIKVISION_HOST=192.168.1.100       # Change to your device's IP
HIKVISION_PORT=80                 # Default HTTP port (or 443 for HTTPS)
HIKVISION_USERNAME=admin          # Device admin username
HIKVISION_PASSWORD=YourPassword123 # Device admin password
HIKVISION_USE_HTTPS=false         # Set to true if using HTTPS (port 443)
```

### Step 2: Test ISAPI Connection Probe

Run the connection probe CLI command:

```powershell
pnpm run hikvision:test-conn
```

> **Expected Output**:
>
> - Negotiates Digest Authentication with your physical terminal.
> - Queries `/ISAPI/System/deviceInfo`.
> - Logs `status: "ONLINE"`, latency in milliseconds, model number (e.g. `DS-K1T341AMF`), and serial number.

---

### Step 3: Query Full Device Information

Inspect hardware specifications and firmware details:

```powershell
pnpm run hikvision:device-info
```

> **Expected Output**: Displays device model, MAC address, encoder/decoder version, firmware release date, and supported feature matrix.

---

### Step 4: Test Real-Time Punch & Incremental Log Ingestion

1. Walk up to your physical terminal and authenticate with your face, fingerprint, or RFID card.
2. Run the sync command:

```powershell
pnpm run hikvision:sync-once
```

> **Expected Output**:
>
> - Queries `/ISAPI/AccessControl/AcsEvent` on your device.
> - Retrieves your physical punch with employee number, exact timestamp, and verification mode.
> - Publishes the raw biometric event to Kafka topic `attendance.raw.v1`.

---

### Step 5: Verify Ingested Records in Kafka UI

Open **[http://localhost:8080](http://localhost:8080)** $\to$ **Topics** $\to$ **`attendance.raw.v1`** $\to$ **Messages** tab to see your physical punch record!
