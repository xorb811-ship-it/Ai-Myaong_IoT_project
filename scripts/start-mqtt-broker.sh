#!/usr/bin/env bash
set -euo pipefail

PORT="${MQTT_BROKER_PORT:-1883}"
BIND_ADDRESS="${MQTT_BROKER_BIND_ADDRESS:-0.0.0.0}"

if ! command -v mosquitto >/dev/null 2>&1; then
  echo "[mqtt-broker] mosquitto is not installed."
  echo "[mqtt-broker] Install it on Raspberry Pi with:"
  echo "  sudo apt update && sudo apt install -y mosquitto mosquitto-clients"
  exit 1
fi

CONFIG_DIR="$(mktemp -d)"
CONFIG_FILE="$CONFIG_DIR/mosquitto.conf"

cleanup() {
  rm -rf "$CONFIG_DIR"
}
trap cleanup EXIT

cat >"$CONFIG_FILE" <<EOF
listener $PORT $BIND_ADDRESS
allow_anonymous true
persistence false
log_dest stdout
connection_messages true
EOF

echo "[mqtt-broker] starting mosquitto on $BIND_ADDRESS:$PORT"
echo "[mqtt-broker] anonymous connections are allowed."
echo "[mqtt-broker] press Ctrl+C to stop."

exec mosquitto -c "$CONFIG_FILE"
