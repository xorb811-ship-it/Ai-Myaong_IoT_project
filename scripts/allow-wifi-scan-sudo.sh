#!/usr/bin/env bash
set -euo pipefail

INTERFACE="${1:-wlan0}"

if [[ ! "$INTERFACE" =~ ^[A-Za-z0-9_.:-]+$ ]]; then
  echo "Invalid interface name: $INTERFACE" >&2
  exit 1
fi

if ! command -v iwlist >/dev/null 2>&1; then
  echo "iwlist was not found. Install it first: sudo apt install -y wireless-tools" >&2
  exit 1
fi

if ! command -v visudo >/dev/null 2>&1; then
  echo "visudo was not found. Install sudo package first." >&2
  exit 1
fi

TARGET_USER="${SUDO_USER:-$USER}"
IWL="$(command -v iwlist)"
SUDOERS_FILE="/etc/sudoers.d/aimyaong-wifi-scan"
TMP_FILE="$(mktemp)"

cleanup() {
  rm -f "$TMP_FILE"
}
trap cleanup EXIT

cat > "$TMP_FILE" <<EOF
# Allow Ai-Myaong Raspberry Pi agent to scan Wi-Fi without storing a sudo password.
$TARGET_USER ALL=(root) NOPASSWD: $IWL $INTERFACE scan
EOF

echo "Checking sudoers syntax..."
sudo visudo -cf "$TMP_FILE"

echo "Installing $SUDOERS_FILE for user $TARGET_USER..."
sudo install -m 0440 -o root -g root "$TMP_FILE" "$SUDOERS_FILE"

echo "Testing passwordless scan permission..."
sudo -n "$IWL" "$INTERFACE" scan >/dev/null

echo "Done. Ai-Myaong can now run: sudo -n $IWL $INTERFACE scan"
