#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -d "node_modules" ]]; then
  if [[ -f "package-lock.json" ]]; then
    npm ci || npm install
  else
    npm install
  fi
fi

exec npm run dev
