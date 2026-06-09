#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPECTED_PYTHON="$(tr -d '[:space:]' < "$REPO_ROOT/.python-version")"
VENV_PYTHON="$REPO_ROOT/raspberrypi/.venv/bin/python"

# ── 시스템 정보 ────────────────────────────────────────────────────────────
echo "[System]"
if [[ -f /proc/device-tree/model ]]; then
  echo "Board  : $(tr -d '\0' < /proc/device-tree/model)"
fi
echo "OS     : $(grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d= -f2 | tr -d '"' || uname -s)"
echo "Arch   : $(uname -m)"
echo "Kernel : $(uname -r)"

# ── 가상환경 확인 ──────────────────────────────────────────────────────────
echo
echo "[Raspberry Pi] $REPO_ROOT/raspberrypi"

if [[ ! -x "$VENV_PYTHON" ]]; then
  echo "Virtual environment not found."
  echo "Run: bash ./setup-dev-env.sh"
  exit 1
fi

# Python 버전
current_python="$("$VENV_PYTHON" -c "import sys; print(sys.version.split()[0])")"
echo "Python : $current_python"
if [[ "$current_python" == "$EXPECTED_PYTHON" ]]; then
  echo "         OK"
else
  echo "         MISMATCH (expected $EXPECTED_PYTHON)"
fi

# 패키지 확인
echo
echo "[Packages]"
for pkg in flask paho-mqtt python-dotenv serial; do
  import_name="$pkg"
  [[ "$pkg" == "paho-mqtt" ]]     && import_name="paho.mqtt.client"
  [[ "$pkg" == "python-dotenv" ]] && import_name="dotenv"

  version="$("$VENV_PYTHON" -c "
import importlib, sys
try:
    mod = importlib.import_module('${import_name}'.split('.')[0])
    print(getattr(mod, '__version__', 'installed'))
except ImportError:
    print('NOT INSTALLED')
" 2>/dev/null)"
  printf "  %-20s %s\n" "$pkg" "$version"
done

echo
echo "Version check finished."
