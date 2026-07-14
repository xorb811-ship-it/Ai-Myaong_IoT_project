#!/usr/bin/env bash
set -euo pipefail

export PORT="${PORT:-8000}"
export ORACLE_WALLET_DIR="${ORACLE_WALLET_DIR:-/tmp/oracle_wallet}"

if [[ -n "${ORACLE_WALLET_B64:-}" ]]; then
  rm -rf "$ORACLE_WALLET_DIR"
  mkdir -p "$ORACLE_WALLET_DIR"
  chmod 700 "$ORACLE_WALLET_DIR"

  python - <<'PY'
import base64
import io
import os
import zipfile

wallet_dir = os.path.realpath(os.environ["ORACLE_WALLET_DIR"])
encoded = os.environ["ORACLE_WALLET_B64"].strip()

with zipfile.ZipFile(io.BytesIO(base64.b64decode(encoded, validate=True))) as archive:
    for entry in archive.infolist():
        destination = os.path.realpath(os.path.join(wallet_dir, entry.filename))
        if os.path.commonpath([wallet_dir, destination]) != wallet_dir:
            raise RuntimeError("Invalid path in Oracle Wallet archive")
    archive.extractall(wallet_dir)
PY

  find "$ORACLE_WALLET_DIR" -type f -exec chmod 600 {} +
fi

if [[ -n "${ORACLE_USER:-}" || -n "${ORACLE_PASSWORD:-}" || -n "${ORACLE_DSN:-}" ]]; then
  : "${ORACLE_USER:?ORACLE_USER is required}"
  : "${ORACLE_PASSWORD:?ORACLE_PASSWORD is required}"
  : "${ORACLE_DSN:?ORACLE_DSN is required}"
  : "${ORACLE_WALLET_B64:?ORACLE_WALLET_B64 is required}"

  python - <<'PY'
import os

required = (
    "ORACLE_USER",
    "ORACLE_PASSWORD",
    "ORACLE_DSN",
    "ORACLE_WALLET_DIR",
)

wallet_password = os.environ.get("ORACLE_WALLET_PASSWORD", "")
if wallet_password:
    required = required + ("ORACLE_WALLET_PASSWORD",)

for name in required:
    value = os.environ.get(name, "")
    if not value:
        raise RuntimeError(f"{name} is empty")
    if value != value.strip():
        raise RuntimeError(f"{name} has leading or trailing whitespace")
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"\"", "'"}:
        raise RuntimeError(f"{name} must not include surrounding quotes")

wallet_dir = os.environ["ORACLE_WALLET_DIR"]
for filename in ("tnsnames.ora", "ewallet.pem"):
    path = os.path.join(wallet_dir, filename)
    if not os.path.isfile(path):
        raise RuntimeError(f"Oracle Wallet file is missing: {filename}")

print("[entrypoint] Oracle environment and Wallet files validated", flush=True)
PY
fi

exec python -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --no-access-log
