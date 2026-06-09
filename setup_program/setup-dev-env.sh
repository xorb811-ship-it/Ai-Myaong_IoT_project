#!/usr/bin/env bash
set -euo pipefail

TARGET="all"
SKIP_INSTALL=0
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN=""
EXPECTED_PYTHON="$(tr -d '[:space:]' < "$REPO_ROOT/.python-version")"
EXPECTED_NODE="$(tr -d '[:space:]' < "$REPO_ROOT/.nvmrc")"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -Target|--target)
      TARGET="${2:-}"
      shift 2
      ;;
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

pick_python() {
  if command -v pyenv >/dev/null 2>&1; then
    eval "$(pyenv init -)"
    local pyenv_python
    pyenv_python="$(pyenv exec python -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')"
    if [[ "$pyenv_python" == "$EXPECTED_PYTHON" ]]; then
      PYTHON_BIN="$(pyenv which python)"
      return
    fi
  fi

  if command -v python3.11 >/dev/null 2>&1; then
    PYTHON_BIN="python3.11"
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    local version
    version="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
    if [[ "$version" == "3.11" ]]; then
      PYTHON_BIN="python3"
      return
    fi
  fi

  echo "Python $EXPECTED_PYTHON is required. Run setup-toolchain.sh first and try again." >&2
  exit 1
}

check_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    local node_version
    node_version="$(node -p 'process.versions.node')"
    if [[ "$node_version" == "$EXPECTED_NODE".* ]]; then
      echo "Node.js $node_version is active."
      return
    fi
    echo "Current Node.js version is $node_version. Trying to activate $EXPECTED_NODE..."
  else
    echo "Node.js $EXPECTED_NODE was not found. Trying to activate it..."
  fi

  ensure_nvm_loaded
  nvm install "$EXPECTED_NODE"
  nvm use "$EXPECTED_NODE"

  if ! command -v npm >/dev/null 2>&1; then
    echo "npm is required. Install Node.js $EXPECTED_NODE and run again." >&2
    exit 1
  fi

  local node_version
  node_version="$(node -p 'process.versions.node')"
  if [[ "$node_version" != "$EXPECTED_NODE".* ]]; then
    echo "Node.js $EXPECTED_NODE is required. Current version: $node_version" >&2
    exit 1
  fi

  echo "Node.js $node_version is now active."
}

ensure_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    return
  fi

  echo "Homebrew is required. Install it first from https://brew.sh and run again." >&2
  exit 1
}

ensure_nvm_loaded() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
    return
  fi

  ensure_homebrew

  if brew list nvm >/dev/null 2>&1; then
    mkdir -p "$NVM_DIR"
    local brew_prefix
    brew_prefix="$(brew --prefix nvm)"
    # shellcheck disable=SC1090
    . "$brew_prefix/nvm.sh"
    return
  fi

  echo "Installing nvm with Homebrew..."
  brew install nvm
  mkdir -p "$NVM_DIR"
  local brew_prefix
  brew_prefix="$(brew --prefix nvm)"
  # shellcheck disable=SC1090
  . "$brew_prefix/nvm.sh"
}

setup_python_target() {
  local key="$1"
  local label="$2"
  local project_path="$REPO_ROOT/$key"
  local venv_path="$project_path/.venv"
  local venv_python="$venv_path/bin/python"
  local requirements_path="$project_path/requirements.txt"

  echo
  echo "[$label] $project_path"

  if [[ ! -x "$venv_python" ]]; then
    echo "Creating virtual environment with Python 3.11..."
    "$PYTHON_BIN" -m venv "$venv_path"
  else
    echo "Virtual environment already exists."
  fi

  if [[ "$SKIP_INSTALL" -eq 1 ]]; then
    echo "Skipping package install."
    return
  fi

  if [[ ! -f "$requirements_path" ]]; then
    echo "No requirements file found. Skipping package install."
    return
  fi

  echo "Installing packages from requirements.txt..."
  "$venv_python" -m pip install --upgrade pip
  "$venv_python" -m pip install -r "$requirements_path"
}

setup_frontend() {
  local project_path="$REPO_ROOT/frontend"

  check_node

  echo
  echo "[Frontend] $project_path"

  if [[ "$SKIP_INSTALL" -eq 1 ]]; then
    echo "Skipping package install."
    return
  fi

  pushd "$project_path" >/dev/null
  if [[ -f package-lock.json ]]; then
    echo "Installing packages with npm ci..."
    if ! npm ci; then
      echo "npm ci failed. package-lock.json may be out of sync."
      echo "Retrying with npm install..."
      npm install
    fi
  else
    echo "Installing packages with npm install..."
    npm install
  fi
  popd >/dev/null
}

case "$TARGET" in
  backend|desktop|raspberrypi|all)
    pick_python
    ;;
  frontend)
    ;;
  *)
    echo "Invalid target: $TARGET" >&2
    exit 1
    ;;
esac

case "$TARGET" in
  backend)
    setup_python_target "backend" "Backend"
    ;;
  desktop)
    setup_python_target "desktop" "Desktop"
    ;;
  raspberrypi)
    setup_python_target "raspberrypi" "Raspberry Pi"
    ;;
  frontend)
    setup_frontend
    ;;
  all)
    setup_python_target "backend" "Backend"
    setup_python_target "desktop" "Desktop"
    setup_python_target "raspberrypi" "Raspberry Pi"
    setup_frontend
    ;;
esac

echo
echo "Setup finished successfully."
