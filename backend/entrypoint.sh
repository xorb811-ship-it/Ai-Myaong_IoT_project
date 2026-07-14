#!/usr/bin/env bash
set -euo pipefail

export PORT="${PORT:-8000}"
export ORACLE_WALLET_DIR="${ORACLE_WALLET_DIR:-/tmp/oracle_wallet}"

if [[ -n "${ORACLE_WALLET_B64:-}" || -n "${ORACLE_WALLET_B64_1:-}" || -n "${ORACLE_WALLET_GZIP_B64:-}" || -n "${ORACLE_WALLET_GZIP_B64_1:-}" ]]; then
  rm -rf "$ORACLE_WALLET_DIR"
  mkdir -p "$ORACLE_WALLET_DIR"
  chmod 700 "$ORACLE_WALLET_DIR"

  python - <<'PY'
import base64
import gzip
import io
import os
import zipfile

wallet_dir = os.path.realpath(os.environ["ORACLE_WALLET_DIR"])

def read_chunks(name):
    direct = os.environ.get(name, "").strip()
    if direct:
        return direct

    chunks = []
    index = 1
    while True:
        value = os.environ.get(f"{name}_{index}")
        if value is None:
            break
        chunks.append(value.strip())
        index += 1
    return "".join(chunks)

encoded = read_chunks("ORACLE_WALLET_B64")
compressed_encoded = read_chunks("ORACLE_WALLET_GZIP_B64")

if compressed_encoded:
    wallet_bytes = gzip.decompress(base64.b64decode(compressed_encoded, validate=True))
elif encoded:
    wallet_bytes = base64.b64decode(encoded, validate=True)
else:
    raise RuntimeError("ORACLE_WALLET_B64, ORACLE_WALLET_B64_1, ORACLE_WALLET_GZIP_B64, or ORACLE_WALLET_GZIP_B64_1 is required")

with zipfile.ZipFile(io.BytesIO(wallet_bytes)) as archive:
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
  if [[ -z "${ORACLE_WALLET_B64:-}" && -z "${ORACLE_WALLET_B64_1:-}" && -z "${ORACLE_WALLET_GZIP_B64:-}" && -z "${ORACLE_WALLET_GZIP_B64_1:-}" ]]; then
    echo "ORACLE_WALLET_B64, ORACLE_WALLET_B64_1, ORACLE_WALLET_GZIP_B64, or ORACLE_WALLET_GZIP_B64_1 is required" >&2
    exit 1
  fi

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
