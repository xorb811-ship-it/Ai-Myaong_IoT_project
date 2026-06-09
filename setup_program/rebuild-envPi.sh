#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPECTED_PYTHON="$(tr -d '[:space:]' < "$REPO_ROOT/.python-version")"
VENV_PATH="$REPO_ROOT/raspberrypi/.venv"
VENV_PYTHON="$VENV_PATH/bin/python"

# ── 가상환경 유효성 검사 ───────────────────────────────────────────────────
is_venv_valid() {
  [[ -x "$VENV_PYTHON" ]] || return 1

  local current
  current="$("$VENV_PYTHON" -c "import sys; print(sys.version.split()[0])")"
  [[ "$current" == "$EXPECTED_PYTHON" ]] || return 1

  "$VENV_PYTHON" -c "import flask, serial, dotenv" >/dev/null 2>&1
}

echo "[Raspberry Pi]"

if [[ ! -d "$VENV_PATH" ]]; then
  echo "No virtual environment found. Running setup..."
  bash "$REPO_ROOT/setup-dev-env.sh"
  echo; echo "Rebuild finished successfully."
  exit 0
fi

if is_venv_valid; then
  echo "Existing environment is valid. Nothing to do."
else
  echo "Environment needs rebuild. Removing $VENV_PATH..."
  rm -rf "$VENV_PATH"
  bash "$REPO_ROOT/setup-dev-env.sh"
fi

echo
echo "Rebuild finished successfully."
