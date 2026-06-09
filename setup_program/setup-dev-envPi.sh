#!/usr/bin/env bash
set -euo pipefail

SKIP_INSTALL=0
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PATH="$REPO_ROOT/raspberrypi/.venv"
VENV_PYTHON="$VENV_PATH/bin/python"
REQUIREMENTS="$REPO_ROOT/raspberrypi/requirements.txt"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -SkipInstall|--skip-install)
      SKIP_INSTALL=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# ── Python 3.11 탐색 ───────────────────────────────────────────────────────
pick_python() {
  # 1) pyenv
  export PYENV_ROOT="${PYENV_ROOT:-$HOME/.pyenv}"
  export PATH="$PYENV_ROOT/bin:$PATH"
  if command -v pyenv >/dev/null 2>&1; then
    eval "$(pyenv init -)"
    local v
    v="$(pyenv exec python -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)"
    if [[ "$v" == "3.11" ]]; then
      PYTHON_BIN="$(pyenv exec python -c 'import sys; print(sys.executable)')"
      return
    fi
  fi

  # 2) 시스템 python3.11
  if command -v python3.11 >/dev/null 2>&1; then
    PYTHON_BIN="python3.11"
    return
  fi

  # 3) apt로 설치 시도
  echo "Python 3.11 not found. Installing via apt-get..."
  sudo apt-get update -qq
  sudo apt-get install -y python3.11 python3.11-venv python3.11-dev

  if command -v python3.11 >/dev/null 2>&1; then
    PYTHON_BIN="python3.11"
    return
  fi

  echo "Python 3.11 is required but could not be installed." >&2
  exit 1
}

# ── 가상환경 생성 및 패키지 설치 ──────────────────────────────────────────
PYTHON_BIN=""
pick_python

echo "[Raspberry Pi] $REPO_ROOT/raspberrypi"

if [[ ! -x "$VENV_PYTHON" ]]; then
  echo "Creating virtual environment..."
  "$PYTHON_BIN" -m venv "$VENV_PATH"
else
  echo "Virtual environment already exists."
fi

if [[ "$SKIP_INSTALL" -eq 1 ]]; then
  echo "Skipping package install."
else
  if [[ ! -f "$REQUIREMENTS" ]]; then
    echo "No requirements.txt found. Skipping package install."
  else
    echo "Installing packages from requirements.txt..."
    "$VENV_PYTHON" -m pip install --upgrade pip
    "$VENV_PYTHON" -m pip install -r "$REQUIREMENTS"
  fi
fi

echo
echo "Setup finished successfully."
