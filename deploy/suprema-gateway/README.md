# Suprema G-SDK Device Gateway

The collector talks to Suprema terminals (BioStation 3, etc.) through this **Device
Gateway** — a Suprema-provided gRPC server. BioStar 2 is **not** required.

```
collector  ──gRPC :4000──▶  Device Gateway  ──TCP 51211/51213──▶  BioStation 3
```

## Licensing

The gateway binary and the G-SDK proto files are **licensed Suprema software** and are
**not committed to this repository** (`.gitignore` excludes `deploy/suprema-gateway/bin/`
and `vendor/`). Obtain them from the Suprema Download Center with your partner account.

## One-time setup

1. From the **Device Gateway** download (`device_gateway_<ver>.7z`), open the
   `device_gateway_linux_x64_<ver>.zip` and copy into `deploy/suprema-gateway/bin/`:
   - `device_gateway_linux_x64`
   - `config.json`
2. From the **Client SDK** download, copy the proto files and event-code catalog into
   the repo (the collector reads them at runtime):
   - `node_client_sdk_<ver>/biostar/proto/*` → `vendor/suprema-gsdk/proto/`
   - `node_client_sdk_<ver>/example/event/event_code.json` → `vendor/suprema-gsdk/event_code.json`

## Run

```bash
docker compose --profile suprema up -d suprema-gateway
```

On first start the gateway generates its TLS certificates under `deploy/suprema-gateway/cert/`.
Point the collector at the CA certificate:

```
SUPREMA_GATEWAY_ADDR=127.0.0.1:4000
SUPREMA_GATEWAY_CA_CERT=./deploy/suprema-gateway/cert/ca.crt
SUPREMA_GSDK_PROTO_DIR=./vendor/suprema-gsdk/proto
```

## Default ports (`config.json`)

| Port  | Purpose                                             |
| ----- | --------------------------------------------------- |
| 4000  | gRPC server for clients (the collector)             |
| 51212 | device ← gateway, non-SSL (device-to-server mode)   |
| 51213 | device ← gateway, SSL (device-to-server mode)       |

In the default **server-to-device** mode the gateway dials the terminal at its device
port (**51211**, or **51213** when SSL is enabled on the device).
