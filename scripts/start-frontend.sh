#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_PATH="$SCRIPT_DIR/../frontend"
REPO_ROOT="$SCRIPT_DIR/.."
EXPECTED_NODE="$(tr -d '[:space:]' < "$REPO_ROOT/.nvmrc")"

ensure_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    return
  fi

  echo "Homebrew is required to install nvm on macOS." >&2
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

  if ! brew list nvm >/dev/null 2>&1; then
    echo "Installing nvm with Homebrew..."
    brew install nvm
  fi

  mkdir -p "$NVM_DIR"
  local brew_prefix
  brew_prefix="$(brew --prefix nvm)"
  # shellcheck disable=SC1090
  . "$brew_prefix/nvm.sh"
}

ensure_expected_node() {
  if command -v node >/dev/null 2>&1; then
    local current_node
    current_node="$(node -p 'process.versions.node')"
    if [[ "$current_node" == "$EXPECTED_NODE".* ]]; then
      echo "Node.js $current_node is active."
      return
    fi
    echo "Current Node.js version is $current_node. Trying to activate $EXPECTED_NODE..."
  else
    echo "Node.js $EXPECTED_NODE was not found. Trying to activate it..."
  fi

  ensure_nvm_loaded
  nvm install "$EXPECTED_NODE"
  nvm use "$EXPECTED_NODE"

  local current_node
  current_node="$(node -p 'process.versions.node')"
  if [[ "$current_node" != "$EXPECTED_NODE".* ]]; then
    echo "Node.js $EXPECTED_NODE is required. Current version: $current_node" >&2
    exit 1
  fi

  echo "Node.js $current_node is now active."
}

ensure_expected_node
cd "$PROJECT_PATH"

if [[ ! -d node_modules ]]; then
  if [[ -f package-lock.json ]]; then
    echo "node_modules not found. Trying npm ci..."
    if ! npm ci; then
      echo "npm ci failed. package-lock.json may be out of sync."
      echo "Retrying with npm install..."
      npm install
    fi
  else
    echo "node_modules not found. Running npm install..."
    npm install
  fi
fi

exec npm run dev
