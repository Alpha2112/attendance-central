# Suprema G-SDK Device Gateway (Linux x64).
#
# The gateway binary is LICENSED Suprema software and is NOT committed to this repo
# (see the SDK License Agreement). Populate ./bin before building:
#
#   bin/device_gateway_linux_x64   (from device_gateway_<ver>.7z -> device_gateway_linux_x64.zip)
#   bin/config.json                (shipped alongside the binary; defaults are fine)
#
# Build/run via docker-compose profile:  docker compose --profile suprema up -d suprema-gateway
FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY bin/device_gateway_linux_x64 /app/device_gateway
COPY bin/config.json /app/config.json
# Renamed SDK license file; its presence signals acceptance of the Suprema SDK
# License Agreement, which the gateway requires before it will start.
COPY bin/LICENSE_AGREEMENT.txt /app/LICENSE_AGREEMENT.txt

RUN chmod +x /app/device_gateway \
  && mkdir -p /app/cert /app/logs

# gRPC server for clients (the collector connects here).
EXPOSE 4000

CMD ["/app/device_gateway"]
