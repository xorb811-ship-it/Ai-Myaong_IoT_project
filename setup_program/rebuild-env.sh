#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-all}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPECTED_PYTHON="$(tr -d '[:space:]' < "$REPO_ROOT/.python-version")"
EXPECTED_NODE="$(tr -d '[:space:]' < "$REPO_ROOT/.nvmrc")"

python_target_is_valid() {
  local key="$1"
  local venv_python="$REPO_ROOT/$key/.venv/bin/python"

  [[ -x "$venv_python" ]] || return 1

  local current_python
  current_python="$("$venv_python" -c "import sys; print(sys.version.split()[0])")"
  [[ "$current_python" == "$EXPECTED_PYTHON" ]] || return 1

  case "$key" in
    backend)
      "$venv_python" -c "import fastapi, cv2" >/dev/null 2>&1
      ;;
    desktop)
      "$venv_python" -c "import cv2, ultralytics, requests" >/dev/null 2>&1
      ;;
    raspberrypi)
      "$venv_python" -c "import flask, serial, dotenv" >/dev/null 2>&1
      ;;
    *)
      return 1
      ;;
  esac
}

prepare_venv() {
  local key="$1"
  local label="$2"
  local venv_path="$REPO_ROOT/$key/.venv"

  echo
  echo "[$label]"
  if [[ ! -d "$venv_path" ]]; then
    echo "No virtual environment found."
    return
  fi

  if python_target_is_valid "$key"; then
    echo "Existing environment is valid. Keeping $venv_path"
    return 1
  else
    echo "Existing environment needs rebuild. Removing $venv_path"
    rm -rf "$venv_path"
    return 0
  fi
}

ensure_nvm_loaded() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
    return
  fi

  if command -v brew >/dev/null 2>&1 && brew list nvm >/dev/null 2>&1; then
    mkdir -p "$NVM_DIR"
    local brew_prefix
    brew_prefix="$(brew --prefix nvm)"
    # shellcheck disable=SC1090
    . "$brew_prefix/nvm.sh"
  fi
}

frontend_is_valid() {
  [[ -d "$REPO_ROOT/frontend/node_modules" ]] || return 1

  if command -v node >/dev/null 2>&1; then
    local current_node
    current_node="$(node -p 'process.versions.node' 2>/dev/null || true)"
    [[ "$current_node" == "$EXPECTED_NODE".* ]] && return 0
  fi

  ensure_nvm_loaded
  if command -v nvm >/dev/null 2>&1; then
    nvm use "$EXPECTED_NODE" >/dev/null 2>&1 || true
    local current_node
    current_node="$(node -p 'process.versions.node' 2>/dev/null || true)"
    [[ "$current_node" == "$EXPECTED_NODE".* ]] && return 0
  fi

  return 1
}

prepare_node_modules() {
  local node_modules_path="$REPO_ROOT/frontend/node_modules"

  echo
  echo "[Frontend]"
  if [[ ! -d "$node_modules_path" ]]; then
    echo "No node_modules directory found."
    return
  fi

  if frontend_is_valid; then
    echo "Existing frontend dependencies look valid. Keeping $node_modules_path"
    return 1
  else
    echo "Existing frontend dependencies need rebuild. Removing $node_modules_path"
    rm -rf "$node_modules_path"
    return 0
  fi
}

case "$TARGET" in
  backend)
    if prepare_venv "backend" "Backend"; then
      bash "$REPO_ROOT/setup-dev-env.sh" -Target backend
    else
      echo
      echo "backend environment is already valid. Skipping rebuild."
    fi
    ;;
  desktop)
    if prepare_venv "desktop" "Desktop"; then
      bash "$REPO_ROOT/setup-dev-env.sh" -Target desktop
    else
      echo
      echo "desktop environment is already valid. Skipping rebuild."
    fi
    ;;
  raspberrypi)
    if prepare_venv "raspberrypi" "Raspberry Pi"; then
      bash "$REPO_ROOT/setup-dev-env.sh" -Target raspberrypi
    else
      echo
      echo "raspberrypi environment is already valid. Skipping rebuild."
    fi
    ;;
  frontend)
    if prepare_node_modules; then
      bash "$REPO_ROOT/setup-dev-env.sh" -Target frontend
    else
      echo
      echo "frontend environment is already valid. Skipping rebuild."
    fi
    ;;
  all)
    NEED_BACKEND=0
    NEED_DESKTOP=0
    NEED_RASPBERRYPI=0
    NEED_FRONTEND=0

    if prepare_venv "backend" "Backend"; then NEED_BACKEND=1; fi
    if prepare_venv "desktop" "Desktop"; then NEED_DESKTOP=1; fi
    if prepare_venv "raspberrypi" "Raspberry Pi"; then NEED_RASPBERRYPI=1; fi
    if prepare_node_modules; then NEED_FRONTEND=1; fi

    echo
    echo "Rebuilding all environments..."
    if [[ "$NEED_BACKEND" -eq 1 ]]; then bash "$REPO_ROOT/setup-dev-env.sh" -Target backend; fi
    if [[ "$NEED_DESKTOP" -eq 1 ]]; then bash "$REPO_ROOT/setup-dev-env.sh" -Target desktop; fi
    if [[ "$NEED_RASPBERRYPI" -eq 1 ]]; then bash "$REPO_ROOT/setup-dev-env.sh" -Target raspberrypi; fi
    if [[ "$NEED_FRONTEND" -eq 1 ]]; then bash "$REPO_ROOT/setup-dev-env.sh" -Target frontend; fi
    if [[ "$NEED_BACKEND$NEED_DESKTOP$NEED_RASPBERRYPI$NEED_FRONTEND" == "0000" ]]; then
      echo "All environments are already valid. Skipping rebuild."
    fi
    ;;
  *)
    echo "Invalid target: $TARGET" >&2
    echo "Use one of: backend, desktop, raspberrypi, frontend, all" >&2
    exit 1
    ;;
esac

echo
echo "Rebuild finished successfully."
