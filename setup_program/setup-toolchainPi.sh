#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_VERSION="$(tr -d '[:space:]' < "$REPO_ROOT/.python-version")"

if [[ -z "$PYTHON_VERSION" ]]; then
  echo ".python-version was not found or is empty." >&2
  exit 1
fi

# ── 시스템 빌드 의존성 (pyenv 소스 빌드에 필요) ───────────────────────────
ensure_build_deps() {
  echo "Checking system build dependencies..."
  local pkgs=(
    build-essential libssl-dev zlib1g-dev libbz2-dev libreadline-dev
    libsqlite3-dev libncurses5-dev libffi-dev liblzma-dev curl git
  )
  local missing=()
  for pkg in "${pkgs[@]}"; do
    dpkg -s "$pkg" >/dev/null 2>&1 || missing+=("$pkg")
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Installing missing packages: ${missing[*]}"
    sudo apt-get update -qq
    sudo apt-get install -y "${missing[@]}"
  else
    echo "All build dependencies are already installed."
  fi
}

# ── pyenv 설치 ─────────────────────────────────────────────────────────────
ensure_pyenv_installed() {
  export PYENV_ROOT="${PYENV_ROOT:-$HOME/.pyenv}"
  export PATH="$PYENV_ROOT/bin:$PATH"

  if command -v pyenv >/dev/null 2>&1; then
    return
  fi

  echo "Installing pyenv via curl..."
  ensure_build_deps
  curl -fsSL https://pyenv.run | bash

  export PATH="$PYENV_ROOT/bin:$PATH"
}

# ── Python 설치 및 활성화 ──────────────────────────────────────────────────
ensure_python() {
  echo "Checking Python $PYTHON_VERSION..."

  ensure_pyenv_installed
  eval "$(pyenv init -)"

  pyenv install -s "$PYTHON_VERSION"
  pyenv local "$PYTHON_VERSION"

  local current
  current="$(pyenv exec python -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')"
  if [[ "$current" == "$PYTHON_VERSION" ]]; then
    echo "Python $current is ready."
    return
  fi

  echo "Failed to activate Python $PYTHON_VERSION." >&2
  exit 1
}

# ── ~/.bashrc에 pyenv 초기화 구문 추가 (최초 1회) ─────────────────────────
patch_shell_profile() {
  local profile=""
  if [[ -f "$HOME/.bashrc" ]]; then
    profile="$HOME/.bashrc"
  elif [[ -f "$HOME/.bash_profile" ]]; then
    profile="$HOME/.bash_profile"
  fi
  [[ -z "$profile" ]] && return

  if ! grep -q 'pyenv init' "$profile" 2>/dev/null; then
    cat >> "$profile" << 'PROFILE'

# pyenv (added by setup-toolchain.sh)
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"
PROFILE
    echo "Added pyenv init to $profile"
  fi
}

ensure_python
patch_shell_profile

echo
echo "Toolchain is ready. Python: $PYTHON_VERSION"
echo "Note: Run 'source ~/.bashrc' or open a new terminal to use pyenv globally."
