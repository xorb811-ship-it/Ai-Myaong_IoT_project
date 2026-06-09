#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_VERSION="$(tr -d '[:space:]' < "$REPO_ROOT/.python-version")"
NODE_VERSION="$(tr -d '[:space:]' < "$REPO_ROOT/.nvmrc")"
NVM_VERSION="v0.39.7"

if [[ -z "$PYTHON_VERSION" ]]; then
  echo ".python-version was not found or is empty." >&2
  exit 1
fi

if [[ -z "$NODE_VERSION" ]]; then
  echo ".nvmrc was not found or is empty." >&2
  exit 1
fi

ensure_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    return
  fi

  echo "Homebrew is required. Install it first from https://brew.sh and run again." >&2
  exit 1
}

ensure_python() {
  echo "Checking Python $PYTHON_VERSION..."

  if command -v pyenv >/dev/null 2>&1; then
    eval "$(pyenv init -)"
    pyenv install -s "$PYTHON_VERSION"
    pyenv local "$PYTHON_VERSION"
    local current_python
    current_python="$(pyenv exec python -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')"
    if [[ "$current_python" == "$PYTHON_VERSION" ]]; then
      echo "Python $current_python is ready through pyenv."
      return
    fi
  fi

  ensure_homebrew

  if ! brew list pyenv >/dev/null 2>&1; then
    echo "Installing pyenv with Homebrew..."
    brew install pyenv
  fi

  eval "$(pyenv init -)"
  pyenv install -s "$PYTHON_VERSION"
  pyenv local "$PYTHON_VERSION"

  local current_python
  current_python="$(pyenv exec python -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')"
  if [[ "$current_python" == "$PYTHON_VERSION" ]]; then
    echo "Python $current_python is ready through pyenv."
    return
  fi

  echo "Failed to activate Python $PYTHON_VERSION with pyenv." >&2
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

ensure_node() {
  echo
  echo "Checking Node.js $NODE_VERSION..."

  ensure_nvm_loaded

  nvm install "$NODE_VERSION"
  nvm use "$NODE_VERSION"

  local current_node
  current_node="$(node -p 'process.versions.node')"
  if [[ "$current_node" == "$NODE_VERSION".* ]]; then
    echo "Node.js $current_node is ready through nvm."
    return
  fi

  echo "Failed to activate Node.js $NODE_VERSION with nvm." >&2
  exit 1
}

ensure_python
ensure_node

echo
echo "Toolchain is ready."
echo "Python target: $PYTHON_VERSION"
echo "Node target: $NODE_VERSION"
