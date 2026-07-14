#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_PATH="$SCRIPT_DIR/../raspberrypi"

if [[ -f "$PROJECT_PATH/.env" ]]; then
  while IFS='=' read -r key value; do
    value="${value%$'\r'}"
    case "$key" in
      START_CAMERA_STREAM|STREAM_PORT|CAMERA_PYTHON_BIN)
        if [[ "$value" == \"*\" && "$value" == *\" ]]; then
          value="${value:1:${#value}-2}"
        elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
          value="${value:1:${#value}-2}"
        fi
        export "$key=$value"
        ;;
    esac
  done < "$PROJECT_PATH/.env"
fi

STREAM_PID=""

cleanup() {
  if [[ -n "$STREAM_PID" ]] && kill -0 "$STREAM_PID" >/dev/null 2>&1; then
    echo "[camera] stopping MJPEG stream server..."
    kill "$STREAM_PID" >/dev/null 2>&1 || true
    wait "$STREAM_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

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
  STREAM_PORT="${STREAM_PORT:-8081}"
  echo "[camera] starting MJPEG stream server on 0.0.0.0:$STREAM_PORT..."
  "$STREAM_PYTHON_BIN" ./camera/mjpeg_server.py &
  STREAM_PID="$!"
fi

"$PYTHON_BIN" ./main.py
