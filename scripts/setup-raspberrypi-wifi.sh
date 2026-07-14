#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/setup-raspberrypi-wifi.sh "SSID" "PASSWORD"

Optional environment variables:
  PI_AP_FALLBACK=false
  PI_AP_SSID=AiMyaong_PI_SETUP
  PI_AP_PASSWORD=aimyaong1234

This script connects Raspberry Pi OS to Wi-Fi with nmcli or raspi-config and
updates the Raspberry Pi, backend, and frontend network URLs.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 2 ]]; then
  usage
  exit 1
fi

SSID="$1"
PASSWORD="$2"
PI_AP_FALLBACK="${PI_AP_FALLBACK:-false}"
PI_AP_SSID="${PI_AP_SSID:-AiMyaong_PI_SETUP}"
PI_AP_PASSWORD="${PI_AP_PASSWORD:-aimyaong1234}"
NMCLI_CONNECT_TIMEOUT="${NMCLI_CONNECT_TIMEOUT:-30}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PI_ENV="$REPO_ROOT/raspberrypi/.env"
BACKEND_ENV="$REPO_ROOT/backend/.env"
FRONTEND_ENV="$REPO_ROOT/frontend/.env"
PI_ENV_BACKUP=""
PREVIOUS_NMCLI_CONNECTION=""

start_pi_ap_fallback() {
  if [[ "$PI_AP_FALLBACK" != "true" ]]; then
    return
  fi

  if ! command -v nmcli >/dev/null 2>&1; then
    echo "[wifi] AP fallback requires nmcli. Skipping AP mode." >&2
    return
  fi

  echo "[wifi] starting Raspberry Pi AP fallback: $PI_AP_SSID"
  nmcli dev wifi hotspot ifname wlan0 ssid "$PI_AP_SSID" password "$PI_AP_PASSWORD" || true
}

rollback_pi_wifi() {
  if [[ -n "$PI_ENV_BACKUP" && -f "$PI_ENV_BACKUP" ]]; then
    cp "$PI_ENV_BACKUP" "$PI_ENV"
    echo "[wifi] raspberrypi/.env restored from backup."
  fi

  if [[ -n "$PREVIOUS_NMCLI_CONNECTION" ]] && command -v nmcli >/dev/null 2>&1; then
    echo "[wifi] rolling back Raspberry Pi Wi-Fi to: $PREVIOUS_NMCLI_CONNECTION"
    nmcli device disconnect wlan0 >/dev/null 2>&1 || true
    nmcli --wait "$NMCLI_CONNECT_TIMEOUT" connection up "$PREVIOUS_NMCLI_CONNECTION" || true
  fi
}

fail_with_rollback() {
  echo "[wifi] $1" >&2
  print_nmcli_diagnostics
  rollback_pi_wifi
  start_pi_ap_fallback
  exit 1
}

detect_pi_ip() {
  local ip=""
  ip="$(nmcli -g IP4.ADDRESS device show wlan0 2>/dev/null | head -n 1 | cut -d/ -f1 || true)"
  if [[ -z "$ip" ]] && command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 addr show wlan0 2>/dev/null | awk '/inet / { sub("/.*", "", $2); print $2; exit }')"
  fi
  printf '%s' "$ip"
}

active_nmcli_connection() {
  nmcli -t -f NAME,DEVICE connection show --active 2>/dev/null | awk -F: '$2 == "wlan0" { print $1; exit }'
}

wifi_device_state() {
  nmcli -t -f DEVICE,STATE device status 2>/dev/null | awk -F: '$1 == "wlan0" { print $2; exit }'
}

print_nmcli_diagnostics() {
  if ! command -v nmcli >/dev/null 2>&1; then
    return
  fi

  echo "[wifi] nmcli device status:" >&2
  nmcli device status >&2 || true
  echo "[wifi] active wlan0 connection: $(active_nmcli_connection)" >&2
  echo "[wifi] wlan0 IP: $(detect_pi_ip)" >&2
}

wait_for_nmcli_connected() {
  local expected_connection="$1"
  local deadline=$((SECONDS + NMCLI_CONNECT_TIMEOUT))
  local state=""
  local active_connection=""
  local ip=""

  while (( SECONDS < deadline )); do
    state="$(wifi_device_state)"
    active_connection="$(active_nmcli_connection)"
    ip="$(detect_pi_ip)"

    if [[ "$state" == "connected" && -n "$ip" ]]; then
      echo "[wifi] Raspberry Pi wlan0 connected: $active_connection ($ip)"
      return 0
    fi

    sleep 2
  done

  echo "[wifi] expected connection: $expected_connection" >&2
  echo "[wifi] last wlan0 state: ${state:-unknown}" >&2
  echo "[wifi] last active connection: ${active_connection:-none}" >&2
  echo "[wifi] last wlan0 IP: ${ip:-none}" >&2
  return 1
}

connect_with_nmcli() {
  echo "[wifi] connecting Raspberry Pi with nmcli: $SSID"
  PREVIOUS_NMCLI_CONNECTION="$(nmcli -t -f NAME,DEVICE connection show --active | awk -F: '$2 == "wlan0" { print $1; exit }')"
  if nmcli -t -f NAME connection show | grep -Fxq "$SSID"; then
    if [[ -n "$PASSWORD" ]]; then
      nmcli connection modify "$SSID" \
        802-11-wireless.ssid "$SSID" \
        wifi-sec.key-mgmt wpa-psk \
        wifi-sec.psk "$PASSWORD" \
        connection.autoconnect yes \
        ipv4.method auto \
        ipv6.method auto \
        || fail_with_rollback "failed to update Wi-Fi profile."
    else
      nmcli connection modify "$SSID" \
        802-11-wireless.ssid "$SSID" \
        connection.autoconnect yes \
        ipv4.method auto \
        ipv6.method auto \
        || fail_with_rollback "failed to update open Wi-Fi profile."
    fi
    nmcli --wait "$NMCLI_CONNECT_TIMEOUT" connection up "$SSID" \
      || fail_with_rollback "failed to connect Raspberry Pi to Wi-Fi: $SSID"
    wait_for_nmcli_connected "$SSID" \
      || fail_with_rollback "Raspberry Pi Wi-Fi stayed in connecting state. Check the Wi-Fi password, DHCP, and router compatibility."
  else
    if [[ -n "$PASSWORD" ]]; then
      nmcli --wait "$NMCLI_CONNECT_TIMEOUT" dev wifi connect "$SSID" password "$PASSWORD" ifname wlan0 \
        || fail_with_rollback "failed to connect Raspberry Pi to Wi-Fi: $SSID"
    else
      nmcli --wait "$NMCLI_CONNECT_TIMEOUT" dev wifi connect "$SSID" ifname wlan0 \
        || fail_with_rollback "failed to connect Raspberry Pi to open Wi-Fi: $SSID"
    fi
    wait_for_nmcli_connected "$SSID" \
      || fail_with_rollback "Raspberry Pi Wi-Fi stayed in connecting state. Check the Wi-Fi password, DHCP, and router compatibility."
  fi
}

connect_with_raspi_config() {
  echo "[wifi] connecting Raspberry Pi with raspi-config: $SSID"
  if [[ "$EUID" -eq 0 ]]; then
    raspi-config nonint do_wifi_ssid_passphrase "$SSID" "$PASSWORD"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    if sudo -n true >/dev/null 2>&1; then
      sudo raspi-config nonint do_wifi_ssid_passphrase "$SSID" "$PASSWORD"
      return
    fi

    echo "[wifi] raspi-config requires sudo permission, but passwordless sudo is not available." >&2
    echo "[wifi] Run this script directly in a Raspberry Pi terminal, or install/enable NetworkManager nmcli." >&2
    exit 1
  fi

  echo "[wifi] sudo was not found, so raspi-config cannot change Wi-Fi." >&2
  exit 1
}

if command -v nmcli >/dev/null 2>&1; then
  connect_with_nmcli
elif command -v raspi-config >/dev/null 2>&1; then
  connect_with_raspi_config
else
  echo "[wifi] neither nmcli nor raspi-config was found." >&2
  echo "[wifi] Install NetworkManager or configure Wi-Fi manually first." >&2
  exit 1
fi

PI_WIFI_IP="$(detect_pi_ip)"
if [[ -z "$PI_WIFI_IP" ]]; then
  fail_with_rollback "failed to detect the Raspberry Pi Wi-Fi IP."
fi

mkdir -p "$(dirname "$PI_ENV")"
if [[ ! -f "$PI_ENV" ]]; then
  cp "$REPO_ROOT/raspberrypi/.env.example" "$PI_ENV"
fi
PI_ENV_BACKUP="$(mktemp)"
cp "$PI_ENV" "$PI_ENV_BACKUP"

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  mkdir -p "$(dirname "$file")"
  touch "$file"
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

set_pi_env_value() {
  local key="$1"
  local value="$2"
  set_env_value "$PI_ENV" "$key" "$value"
}

set_pi_env_value MQTT_DISABLED false
set_pi_env_value PI_AGENT_HTTP_HOST "${PI_AGENT_HTTP_HOST:-0.0.0.0}"
set_pi_env_value PI_AGENT_HTTP_PORT "${PI_AGENT_HTTP_PORT:-8765}"
set_pi_env_value PI_AGENT_HTTP_DISABLED false

if [[ -f "$BACKEND_ENV" ]]; then
  set_env_value "$BACKEND_ENV" PI_AGENT_BASE_URL "http://$PI_WIFI_IP:${PI_AGENT_HTTP_PORT:-8765}"
  set_env_value "$BACKEND_ENV" CAMERA_STREAM_URL "http://$PI_WIFI_IP:${STREAM_PORT:-8081}/stream.mjpg"
  set_env_value "$BACKEND_ENV" CAMERA_PROXY false
fi

if [[ -f "$FRONTEND_ENV" ]]; then
  set_env_value "$FRONTEND_ENV" VITE_STREAM_URL "http://$PI_WIFI_IP:${STREAM_PORT:-8081}/stream.mjpg"
fi

echo "[wifi] Raspberry Pi Wi-Fi configured."
echo "[wifi] Raspberry Pi Wi-Fi IP: $PI_WIFI_IP"
