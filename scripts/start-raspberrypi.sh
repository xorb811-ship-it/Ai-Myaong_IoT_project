#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_PATH="$SCRIPT_DIR/../raspberrypi"
PORT="${MQTT_BROKER_PORT:-1883}"
BIND_ADDRESS="${MQTT_BROKER_BIND_ADDRESS:-0.0.0.0}"
BROKER_PID=""
STREAM_PID=""
CONFIG_DIR=""

cleanup() {
  if [[ -n "$BROKER_PID" ]] && kill -0 "$BROKER_PID" >/dev/null 2>&1; then
    echo "[mqtt-broker] stopping bundled broker..."
    kill "$BROKER_PID" >/dev/null 2>&1 || true
    wait "$BROKER_PID" >/dev/null 2>&1 || true
  fi

  if [[ -n "$STREAM_PID" ]] && kill -0 "$STREAM_PID" >/dev/null 2>&1; then
    echo "[camera] stopping MJPEG stream server..."
    kill "$STREAM_PID" >/dev/null 2>&1 || true
    wait "$STREAM_PID" >/dev/null 2>&1 || true
  fi

  if [[ -n "$CONFIG_DIR" ]]; then
    rm -rf "$CONFIG_DIR"
  fi
}
trap cleanup EXIT INT TERM

port_is_open() {
  (echo >/dev/tcp/127.0.0.1/"$PORT") >/dev/null 2>&1
}

warn_if_broker_is_local_only() {
  if ! command -v ss >/dev/null 2>&1; then
    return
  fi

  local listeners
  listeners="$(ss -ltn 2>/dev/null | awk -v port=":$PORT" '$4 ~ port "$" { print $4 }')"
  if [[ -z "$listeners" ]]; then
    return
  fi

  if echo "$listeners" | grep -Eq '(^|:)0\.0\.0\.0:|(^|:)\*:|\[::\]:'; then
    return
  fi

  if echo "$listeners" | grep -Eq '127\.0\.0\.1:|\[::1\]:'; then
    echo "[mqtt-broker] warning: an existing broker is listening only on localhost."
    echo "[mqtt-broker] desktop/backend publishes to the Raspberry Pi IP, so D-pad commands may not arrive."
    echo "[mqtt-broker] fix mosquitto to listen on 0.0.0.0 or stop it and rerun this script."
  fi
}

start_broker_if_needed() {
  if port_is_open; then
    echo "[mqtt-broker] broker is already listening on port $PORT."
    warn_if_broker_is_local_only
    return
  fi

  if ! command -v mosquitto >/dev/null 2>&1; then
    echo "[mqtt-broker] mosquitto is not installed."
    echo "[mqtt-broker] Install it on Raspberry Pi with:"
    echo "  sudo apt update && sudo apt install -y mosquitto mosquitto-clients"
    exit 1
  fi

  CONFIG_DIR="$(mktemp -d)"
  local config_file="$CONFIG_DIR/mosquitto.conf"

  cat >"$config_file" <<EOF
listener $PORT $BIND_ADDRESS
allow_anonymous true
persistence false
log_dest stdout
connection_messages true
EOF

  echo "[mqtt-broker] starting bundled broker on $BIND_ADDRESS:$PORT..."
  mosquitto -c "$config_file" &
  BROKER_PID="$!"

  for _ in {1..20}; do
    if port_is_open; then
      echo "[mqtt-broker] bundled broker is ready."
      return
    fi

    if ! kill -0 "$BROKER_PID" >/dev/null 2>&1; then
      echo "[mqtt-broker] bundled broker exited before it was ready." >&2
      wait "$BROKER_PID"
      exit 1
    fi

    sleep 0.2
  done

  echo "[mqtt-broker] bundled broker did not open port $PORT in time." >&2
  exit 1
}

start_broker_if_needed

cd "$PROJECT_PATH"

if [[ -x ".venv/bin/python" ]]; then
  PYTHON_BIN=".venv/bin/python"
elif command -v python3.11 >/dev/null 2>&1; then
  PYTHON_BIN="python3.11"
else
  PYTHON_BIN="python3"
fi

if [[ -n "${CAMERA_PYTHON_BIN:-}" ]]; then
  STREAM_PYTHON_BIN="$CAMERA_PYTHON_BIN"
elif [[ -x "/usr/bin/python3" ]]; then
  STREAM_PYTHON_BIN="/usr/bin/python3"
else
  STREAM_PYTHON_BIN="python3"
fi

if [[ "${START_CAMERA_STREAM:-true}" != "false" ]]; then
  STREAM_PORT="${STREAM_PORT:-8080}"
  echo "[camera] starting MJPEG stream server on 0.0.0.0:$STREAM_PORT..."
  "$STREAM_PYTHON_BIN" ./camera/mjpeg_server.py &
  STREAM_PID="$!"
fi

if [[ -x ".venv/bin/python" ]]; then
  "$PYTHON_BIN" ./main.py
  exit $?
fi

"$PYTHON_BIN" ./main.py
