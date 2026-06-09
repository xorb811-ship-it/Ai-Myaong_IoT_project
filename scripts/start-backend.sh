#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_PATH="$SCRIPT_DIR/../backend"

cd "$PROJECT_PATH"
export PYTHONPATH="$SCRIPT_DIR/.."

if [[ -x ".venv/bin/python" ]]; then
  exec .venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
fi

if command -v python3.11 >/dev/null 2>&1; then
  exec python3.11 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
fi

exec python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
