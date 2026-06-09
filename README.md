# Ai-Myaong

Ai-Myaong is split into two mostly independent systems:

- Remote robot: React/FastAPI -> MQTT -> Raspberry Pi -> serial robot controller
- Dispenser: React/FastAPI -> MQTT -> standalone ESP32 dispenser

The backend simulator can still process commands even without the real Raspberry Pi, robot controller, camera, or ESP32 hardware.

## Folder Layout

- `backend/`: FastAPI API, MQTT publishing, and simulator logic
- `frontend/`: React + Vite web UI
- `desktop/`: desktop MJPEG/OpenCV worker and MQTT robot publisher
- `raspberrypi/`: MJPEG camera service and serial bridge
- `arduino-uno/`: Arduino Uno robot controller sketch
- `esp32/`: ESP32 sketches, including the dispenser device
- `docs/`: notes for architecture, APIs, and hardware
- `scripts/`: helper scripts for local startup

## Robot Flow

1. Raspberry Pi serves the Pi camera stream as MJPEG.
2. The desktop worker receives the stream and runs OpenCV or other vision logic.
3. The desktop worker or web UI decides robot movement.
4. Commands are published to MQTT.
5. Raspberry Pi subscribes to robot topics and forwards serial commands.
6. Arduino Uno drives crawler motors and pan/tilt servos.

## Dispenser Flow

1. The web UI sends feed or water requests to the backend.
2. The backend publishes MQTT messages to dispenser topics.
3. The standalone ESP32 dispenser receives commands and actuates food or water hardware.

## Quick Start Order

Follow this order on a fresh machine:

1. Match the OS toolchain versions.
2. Create the project environments.
3. Start the services you need.

Windows:

```cmd
setup-toolchain.bat
setup-python-venv.bat -Target all
rebuild-env.bat all
check-versions.bat all
scripts\start-backend.bat
scripts\start-frontend.bat
```

macOS:

```bash
bash ./setup-toolchain.sh
bash ./setup-dev-env.sh -Target all
bash ./rebuild-env.sh all
bash ./check-versions.sh all
bash ./scripts/start-backend.sh
bash ./scripts/start-frontend.sh
```

## Windows `cmd` Quick Start

Pinned toolchain:

- Python `3.11.9`
- Node.js `22` LTS
- OpenCV `4.13.0.92`
- Ultralytics `8.4.52`
- See [docs/team-rules.md](/C:/Users/soldesk/Desktop/Ai-Myaong/docs/team-rules.md:1) for collaboration and OS-specific rules

You can align the OS toolchain automatically before creating project environments:

```cmd
setup-toolchain.bat
```

Python and frontend environments can be created automatically from the repo root:

```cmd
setup-python-venv.bat
setup-python-venv.bat -Target backend
setup-python-venv.bat -Target desktop
setup-python-venv.bat -Target raspberrypi
setup-python-venv.bat -Target frontend
setup-python-venv.bat -Target all
```

These setup scripts now stop with an error if Python is not `3.11.x` or Node.js is not `22.x`.

Start scripts can also be run directly from `cmd`:

```cmd
scripts\start-backend.bat
scripts\start-frontend.bat
scripts\start-raspberrypi.bat
```

Check installed versions:

```cmd
check-versions.bat all
check-versions.bat desktop
```

Rebuild old environments if they were created with the wrong Python version:

```cmd
rebuild-env.bat all
rebuild-env.bat desktop
```

## macOS Quick Start

Use the repo version files first:

```bash
cat .python-version
cat .nvmrc
```

Then align the macOS toolchain:

```bash
bash ./setup-toolchain.sh
```

Then create environments from the repo root:

```bash
bash ./setup-dev-env.sh -Target all
bash ./setup-dev-env.sh -Target backend
bash ./setup-dev-env.sh -Target frontend
```

These setup scripts now stop with an error if Python is not `3.11.x` or Node.js is not `22.x`.

Start services with:

```bash
bash ./scripts/start-backend.sh
bash ./scripts/start-frontend.sh
bash ./scripts/start-raspberrypi.sh
```

Check installed versions:

```bash
bash ./check-versions.sh all
bash ./check-versions.sh desktop
```

Rebuild old environments if they were created with the wrong Python version:

```bash
bash ./rebuild-env.sh all
bash ./rebuild-env.sh desktop
```

## Common Workflows

Backend only:

```cmd
setup-toolchain.bat
setup-python-venv.bat -Target backend
scripts\start-backend.bat
```

Frontend only:

```cmd
setup-toolchain.bat
setup-python-venv.bat -Target frontend
scripts\start-frontend.bat
```

Desktop vision only:

```cmd
setup-toolchain.bat
setup-python-venv.bat -Target desktop
```

### Backend

```cmd
cd /d C:\Users\soldesk\Desktop\Ai-Myaong\backend
python -m venv .venv
.venv\Scripts\activate.bat
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```cmd
cd /d C:\Users\soldesk\Desktop\Ai-Myaong\frontend
npm install
npm run dev
```

### Desktop Worker

```cmd
cd /d C:\Users\soldesk\Desktop\Ai-Myaong\desktop
python -m venv .venv
.venv\Scripts\activate.bat
pip install -r requirements.txt
python main.py
```

### Raspberry Pi Agent Local Test

```cmd
cd /d C:\Users\soldesk\Desktop\Ai-Myaong\raspberrypi
python -m venv .venv
.venv\Scripts\activate.bat
pip install -r requirements.txt
python main.py
```
