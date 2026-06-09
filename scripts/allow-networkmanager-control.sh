#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
RULE_FILE="/etc/polkit-1/rules.d/80-aimyaong-networkmanager.rules"
USER_OVERRIDE=""

usage() {
  cat <<EOF
Allow the Ai-Myaong Raspberry Pi agent user to control NetworkManager.

Usage:
  ./scripts/$SCRIPT_NAME
  sudo ./scripts/$SCRIPT_NAME
  sudo ./scripts/$SCRIPT_NAME --user pi

Options:
  -u, --user USER   Grant permission to USER explicitly.
  -h, --help        Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -u|--user)
      if [[ -z "${2:-}" ]]; then
        echo "$1 requires a user name." >&2
        usage >&2
        exit 1
      fi
      USER_OVERRIDE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  if ! command -v sudo >/dev/null 2>&1; then
    echo "sudo was not found. Run as root with --user, for example:" >&2
    echo "  su -c './scripts/$SCRIPT_NAME --user ${USER:-pi}'" >&2
    exit 1
  fi

  TARGET_FROM_USER="${USER_OVERRIDE:-${USER:-}}"
  if [[ -n "$USER_OVERRIDE" ]]; then
    exec sudo env AIMYAONG_NM_TARGET_USER="$TARGET_FROM_USER" bash "$0" --user "$USER_OVERRIDE"
  fi
  exec sudo env AIMYAONG_NM_TARGET_USER="$TARGET_FROM_USER" bash "$0"
fi

TARGET_USER="${USER_OVERRIDE:-${AIMYAONG_NM_TARGET_USER:-${SUDO_USER:-}}}"
if [[ -z "$TARGET_USER" ]] && command -v logname >/dev/null 2>&1; then
  TARGET_USER="$(logname 2>/dev/null || true)"
fi

if [[ -z "$TARGET_USER" || "$TARGET_USER" == "root" ]]; then
  echo "Could not determine the Raspberry Pi agent user." >&2
  echo "Run it as the Pi user with sudo, or pass the user explicitly:" >&2
  echo "  sudo ./scripts/$SCRIPT_NAME --user pi" >&2
  exit 1
fi

if [[ ! "$TARGET_USER" =~ ^[A-Za-z0-9_.-]+$ ]]; then
  echo "Invalid user name: $TARGET_USER" >&2
  exit 1
fi

if ! id "$TARGET_USER" >/dev/null 2>&1; then
  echo "User does not exist on this system: $TARGET_USER" >&2
  exit 1
fi

if ! command -v nmcli >/dev/null 2>&1; then
  echo "nmcli was not found. Install or enable NetworkManager first:" >&2
  echo "  sudo apt install -y network-manager" >&2
  exit 1
fi

TMP_RULE="$(mktemp)"
trap 'rm -f "$TMP_RULE"' EXIT

cat > "$TMP_RULE" <<EOF
polkit.addRule(function(action, subject) {
  if (subject.user == "$TARGET_USER" &&
      action.id.indexOf("org.freedesktop.NetworkManager.") == 0) {
    return polkit.Result.YES;
  }
});
EOF

install -D -m 0644 -o root -g root "$TMP_RULE" "$RULE_FILE"

if command -v systemctl >/dev/null 2>&1; then
  systemctl restart polkit 2>/dev/null || systemctl restart polkit.service 2>/dev/null || systemctl restart polkitd 2>/dev/null || true
fi

echo "NetworkManager control permission was granted to user: $TARGET_USER"
echo "Rule installed: $RULE_FILE"
echo "Restart the Raspberry Pi agent after this."
