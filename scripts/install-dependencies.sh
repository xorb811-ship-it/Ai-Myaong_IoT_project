#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

install_node() {
  local project_path="$1"
  local label="$2"

  echo
  echo "[$label npm]"
  if [[ ! -f "$project_path/package.json" ]]; then
    echo "package.json not found. Skipping."
    return
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "npm was not found. Install Node.js first." >&2
    return 1
  fi

  pushd "$project_path" >/dev/null
  if [[ -f package-lock.json ]]; then
    echo "Running npm ci..."
    if ! npm ci; then
      echo "npm ci failed. Retrying with npm install..."
      npm install
    fi
  else
    echo "Running npm install..."
    npm install
  fi
  popd >/dev/null
}

pick_python() {
  if command -v python3.11 >/dev/null 2>&1; then
    echo "python3.11"
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    echo "python3"
    return
  fi

  if command -v python >/dev/null 2>&1; then
    echo "python"
    return
  fi

  echo "Python 3.11 or compatible Python was not found." >&2
  return 1
}

install_python() {
  local target_key="$1"
  local label="$2"
  local project_path="$REPO_ROOT/$target_key"
  local venv_path="$project_path/.venv"
  local requirements_path="$project_path/requirements.txt"
  local venv_python="$venv_path/bin/python"

  echo
  echo "[$label Python]"
  if [[ ! -f "$requirements_path" ]]; then
    echo "requirements.txt not found. Skipping."
    return
  fi

  if [[ ! -x "$venv_python" ]]; then
    local python_bin
    python_bin="$(pick_python)"
    echo "Creating virtual environment: $venv_path"
    "$python_bin" -m venv "$venv_path"
  fi

  "$venv_python" -m pip install --upgrade pip
  "$venv_python" -m pip install -r "$requirements_path"
}

install_node "$REPO_ROOT" "Root"
install_node "$REPO_ROOT/frontend" "Frontend"

install_python "backend" "Backend"
install_python "desktop" "Desktop"
install_python "raspberrypi" "Raspberry Pi"

echo
echo "Dependency install finished successfully."
