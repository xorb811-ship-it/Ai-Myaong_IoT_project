import threading
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.runtime_config import read_env_values, runtime_env

router = APIRouter(prefix="/api/device", tags=["device"])

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ENV = REPO_ROOT / "backend" / ".env"
DESKTOP_ENV = REPO_ROOT / "desktop" / ".env"
DEVICES: dict[str, dict[str, str]] = {}


class DeviceRegister(BaseModel):
    device_id: str
    ip: str
    role: str = "raspberrypi"
    ssid: str = ""
    agent_port: int = 8765
    stream_port: int = 8080


@router.post("/register")
def register_device(data: DeviceRegister, request: Request):
    now = datetime.now().isoformat(timespec="seconds")
    DEVICES[data.device_id] = {
        "ip": data.ip,
        "role": data.role,
        "ssid": data.ssid,
        "agent_port": str(data.agent_port),
        "stream_port": str(data.stream_port),
        "last_seen": now,
    }

    if data.role in {"raspberrypi", "robot"}:
        print(f"[device] register {data.device_id}: {data.ip} ssid={data.ssid}")
        _sync_backend_env_from_device(data)
        mqtt_client = getattr(request.app.state, "mqtt_client", None)
        mqtt_connected = bool(getattr(mqtt_client, "connected", False))
        mqtt_reconnect_started = False
        if mqtt_client:
            if runtime_env("BACKEND_REQUIRE_MQTT_ON_DEVICE_REGISTER", "false").lower() == "true":
                mqtt_connected = mqtt_client.reconnect_if_config_changed()
            else:
                threading.Thread(target=mqtt_client.reconnect_if_config_changed, daemon=True).start()
                mqtt_reconnect_started = True
    else:
        mqtt_client = getattr(request.app.state, "mqtt_client", None)
        mqtt_connected = bool(getattr(mqtt_client, "connected", False))
        mqtt_reconnect_started = False

    return {
        "ok": True,
        "device_id": data.device_id,
        "saved": DEVICES[data.device_id],
        "mqttConnected": mqtt_connected,
        "mqttReconnectStarted": mqtt_reconnect_started,
        "backendEnv": read_env_values(
            BACKEND_ENV,
            ("MQTT_BROKER_HOST", "MQTT_BROKER_PORT", "PI_AGENT_BASE_URL", "CAMERA_STREAM_URL"),
        ),
        "desktopEnv": read_env_values(
            DESKTOP_ENV,
            ("MQTT_BROKER_HOST", "MQTT_BROKER_PORT", "MJPEG_STREAM_URL"),
        ),
    }


@router.get("/{device_id}")
def get_device(device_id: str):
    device = DEVICES.get(device_id)
    if not device:
        backend_env = read_env_values(
            BACKEND_ENV,
            ("MQTT_BROKER_HOST", "MQTT_BROKER_PORT", "PI_AGENT_BASE_URL", "CAMERA_STREAM_URL"),
        )
        pi_ip = backend_env.get("MQTT_BROKER_HOST", "")
        if pi_ip and device_id == "myaong-pi-01":
            return {
                "ok": True,
                "device_id": device_id,
                "saved": {
                    "ip": pi_ip,
                    "role": "raspberrypi",
                    "ssid": "",
                    "agent_port": "8765",
                    "stream_port": "8080",
                    "last_seen": "",
                    "source": "backendEnv",
                },
            }
        return {"ok": False, "message": "device not found"}
    return {"ok": True, "device_id": device_id, "saved": device}


def _sync_backend_env_from_device(data: DeviceRegister) -> None:
    mqtt_port = runtime_env("MQTT_BROKER_PORT", "1883").strip() or "1883"
    _set_env_value(BACKEND_ENV, "MQTT_BROKER_HOST", data.ip)
    _set_env_value(BACKEND_ENV, "MQTT_BROKER_PORT", mqtt_port)
    _set_env_value(BACKEND_ENV, "PI_AGENT_BASE_URL", f"http://{data.ip}:{data.agent_port}")
    _set_env_value(BACKEND_ENV, "CAMERA_STREAM_URL", f"http://{data.ip}:{data.stream_port}/stream.mjpg")
    _set_env_value(DESKTOP_ENV, "MQTT_BROKER_HOST", data.ip)
    _set_env_value(DESKTOP_ENV, "MQTT_BROKER_PORT", mqtt_port)
    _set_env_value(DESKTOP_ENV, "MJPEG_STREAM_URL", f"http://{data.ip}:{data.stream_port}/stream.mjpg")


def _set_env_value(path: Path, key: str, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    next_lines: list[str] = []
    replaced = False

    for line in lines:
        if line.startswith(f"{key}="):
            next_lines.append(f"{key}={value}")
            replaced = True
        else:
            next_lines.append(line)

    if not replaced:
        next_lines.append(f"{key}={value}")

    path.write_text("\n".join(next_lines) + "\n", encoding="utf-8")
