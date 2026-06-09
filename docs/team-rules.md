# Team Rules

## Locked Versions

- Python: `3.11.9`
- Node.js: `22` LTS
- OpenCV: `4.13.0.92`
- YOLO / Ultralytics: `8.4.52`
- FastAPI: `0.115.0`
- Uvicorn: `0.30.6`
- MQTT client: `paho-mqtt 2.1.0`

Use the repo version files before creating environments:

- `.python-version`
- `.nvmrc`

## Environment Rules

- Never commit `.venv/`, `venv/`, `__pycache__/`, `node_modules/`, or `.env`.
- Create Python virtual environments locally per machine.
- Install frontend packages locally with `npm install` or `npm ci`.
- Keep broker hosts, ports, camera sources, and API URLs in `.env` files instead of hardcoding them.

## Cross-Platform Rules

- Use `pathlib.Path` in Python instead of absolute Windows or macOS paths.
- Keep shell scripts on LF and Windows batch scripts on CRLF. `.gitattributes` handles this.
- Windows users should avoid Korean or overly long project paths when possible.
- Apple Silicon users should prefer `pyenv` plus `python 3.11.9` for better package compatibility.

## Git Rules

- Branches:
  - `main`
  - `develop`
  - `feature/<topic>`
- Commit prefixes:
  - `feat:`
  - `fix:`
  - `refactor:`
  - `docs:`

Recommended Git settings:

```bash
# Windows
git config --global core.autocrlf true

# macOS / Linux
git config --global core.autocrlf input
```

## Local Networking

- `localhost` and `127.0.0.1` always mean the current machine.
- Share test environments with a dedicated server, Tailscale, or ZeroTier when team members need to connect to the same backend or broker.
- Keep MQTT broker settings aligned across backend, desktop, and Raspberry Pi `.env` files.
