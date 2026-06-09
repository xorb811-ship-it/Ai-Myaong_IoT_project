#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -x ".venv/bin/python" ]]; then
  if command -v python3.11 >/dev/null 2>&1; then
    python3.11 -m venv .venv
  else
    python3 -m venv .venv
  fi
fi

.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt
exec .venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
