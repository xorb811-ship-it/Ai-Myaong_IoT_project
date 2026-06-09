import json
import os
import re
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from ipaddress import IPv4Network
from pathlib import Path

from dotenv import load_dotenv

from comm.serial_comm import SerialComm

REPO_ROOT = Path(__file__).resolve().parents[1]
PI_ENV = REPO_ROOT / "raspberrypi" / ".env"
load_dotenv(REPO_ROOT / "raspberrypi" / ".env", override=True)
SETUP_WIFI_SCRIPT = REPO_ROOT / "scripts" / "setup-raspberrypi-wifi.sh"
DEVICE_ID = os.getenv("DEVICE_ID", "myaong-pi-01")
WIFI_JOB_STATUS: dict[str, object] = {
    "state": "idle",
    "ssid": "",
    "message": "",
    "updatedAt": "",
}

ROBOT_COMMANDS = {
    "FORWARD",
    "BACKWARD",
    "LEFT",
    "RIGHT",
    "STOP",
    "CAM_UP",
    "CAM_DOWN",
    "CAM_LEFT",
    "CAM_RIGHT",
    "CAM_CENTER",
}


class RaspberryPiAgent:
    def __init__(self) -> None:
        self.serial = SerialComm()
        self.mqtt_disabled = os.getenv("MQTT_DISABLED", "false").lower() == "true"
        self.mqtt_host = os.getenv("MQTT_BROKER_HOST", "localhost")
        self.mqtt_port = int(os.getenv("MQTT_BROKER_PORT", "1883"))
        self.mqtt_username = os.getenv("MQTT_USERNAME")
        self.mqtt_password = os.getenv("MQTT_PASSWORD")
        self.client_id = os.getenv("MQTT_CLIENT_ID", "ai-myaong-raspberrypi")
        self.reconnect_delay = float(os.getenv("MQTT_RECONNECT_DELAY", "5"))
        self.topics = tuple(
            topic.strip()
            for topic in os.getenv("MQTT_TOPICS", "robot/move,robot/camera").split(",")
            if topic.strip()
        )
        self._client = None
        self._stopping = threading.Event()

    def start(self) -> None:
        try:
            self.serial.connect()
        except Exception as exc:
            print(f"[serial] connection failed, continuing without Arduino serial: {exc}")

        if self.mqtt_disabled:
            print("[raspberrypi] MQTT disabled by MQTT_DISABLED=true")
            try:
                while not self._stopping.is_set():
                    time.sleep(1)
            finally:
                self.serial.close()
            return

        import paho.mqtt.client as mqtt

        client = self._make_mqtt_client(mqtt)
        self._client = client
        if self.mqtt_username:
            client.username_pw_set(self.mqtt_username, self.mqtt_password)

        client.on_connect = self.on_connect
        client.on_disconnect = self.on_disconnect
        client.on_message = self.on_message
        client.reconnect_delay_set(min_delay=1, max_delay=max(2, int(self.reconnect_delay)))
        print(f"[raspberrypi] connecting to MQTT broker {self.mqtt_host}:{self.mqtt_port}")

        try:
            while not self._stopping.is_set():
                try:
                    client.connect(self.mqtt_host, self.mqtt_port, keepalive=30)
                    client.loop_forever(retry_first_connection=True)
                except KeyboardInterrupt:
                    raise
                except Exception as exc:
                    print(f"[raspberrypi] MQTT reconnect failed: {exc}")
                    time.sleep(self.reconnect_delay)
        except KeyboardInterrupt:
            print("[raspberrypi] stopped by user")
        finally:
            client.disconnect()
            self.serial.close()

    def stop(self, *_args) -> None:
        self._stopping.set()
        if self._client:
            self._client.disconnect()

    def _make_mqtt_client(self, mqtt):
        try:
            return mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=self.client_id)
        except AttributeError:
            return mqtt.Client(client_id=self.client_id)

    def on_connect(self, client, _userdata, _flags, reason_code, _properties=None) -> None:
        if not self._is_success(reason_code):
            print(f"[raspberrypi] MQTT connect failed: {reason_code}")
            return

        for topic in self.topics:
            client.subscribe(topic)
            print(f"[raspberrypi] subscribed to {topic}")

    def on_disconnect(self, _client, _userdata, *args) -> None:
        reason_code = args[1] if len(args) >= 2 else args[0] if args else 0
        if not self._is_success(reason_code):
            print(f"[raspberrypi] MQTT disconnected: {reason_code}")

    def on_message(self, _client, _userdata, message) -> None:
        topic = message.topic
        payload_text = message.payload.decode("utf-8").strip()

        if topic == "system/backend/announce":
            try:
                data = json.loads(payload_text)
                url = str(data.get("url") or "").strip().rstrip("/")
                if url:
                    print(f"[mqtt] backend discovered: {url}")
                    MQTT_BACKEND_CACHE["url"] = url
                    os.environ["DESKTOP_BACKEND_URL"] = url
                    set_env_value(PI_ENV, "DESKTOP_BACKEND_URL", url)
            except Exception as exc:
                print(f"[mqtt] backend announce parse error: {exc}")
            return

        command = self._extract_command(message.payload)
        if not command:
            print(f"[raspberrypi] ignored empty command on {topic}")
            return

        if command not in ROBOT_COMMANDS:
            print(f"[raspberrypi] ignored unsupported command on {topic}: {command}")
            return

        print(f"[raspberrypi] MQTT {topic} -> Arduino {command}")
        self.serial.send(command)

    def _extract_command(self, payload_bytes: bytes) -> str | None:
        payload_text = payload_bytes.decode("utf-8").strip()
        if not payload_text:
            return None

        try:
            payload = json.loads(payload_text)
        except json.JSONDecodeError:
            return payload_text

        if isinstance(payload, str):
            return payload.strip() or None

        if not isinstance(payload, dict):
            return None

        command = (
            payload.get("cmd")
            or payload.get("command")
            or payload.get("direction")
            or payload.get("action")
        )
        if command is None:
            return None

        return str(command).strip() or None

    def _is_success(self, reason_code) -> bool:
        try:
            return int(reason_code) == 0
        except (TypeError, ValueError):
            return str(reason_code).lower() in {"0", "success", "normal disconnection"}


def start_wifi_http_server(agent: RaspberryPiAgent) -> None:
    if os.getenv("PI_AGENT_HTTP_DISABLED", "false").lower() == "true":
        return

    host = os.getenv("PI_AGENT_HTTP_HOST", "0.0.0.0")
    port = int(os.getenv("PI_AGENT_HTTP_PORT", "8765"))
    thread = threading.Thread(target=_run_wifi_http_server, args=(host, port, agent), daemon=True)
    thread.start()
    start_backend_registration_loop()


def _run_wifi_http_server(host: str, port: int, agent: RaspberryPiAgent) -> None:
    import uvicorn
    from fastapi import FastAPI, HTTPException

    app = FastAPI(title="Ai-Myaong Raspberry Pi Agent", version="0.1.0")

    @app.get("/api/wifi/scan")
    def wifi_scan():
        try:
            return {"networks": scan_wifi_networks(), "source": "raspberrypi"}
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @app.get("/api/wifi/status")
    def wifi_status():
        return {
            "ssid": current_wifi_ssid(),
            "ip": current_wifi_ip(),
            "source": "raspberrypi",
            "wifiJob": WIFI_JOB_STATUS,
        }

    @app.post("/api/wifi/desktop-backend")
    def save_desktop_backend(body: dict | None = None):
        body = body or {}
        desktop_backend_url = str(body.get("desktopBackendUrl") or body.get("desktop_backend_url") or "").strip().rstrip("/")
        if not desktop_backend_url:
            raise HTTPException(status_code=400, detail="desktopBackendUrl is required.")

        os.environ["DESKTOP_BACKEND_URL"] = desktop_backend_url
        set_env_value(PI_ENV, "DESKTOP_BACKEND_URL", desktop_backend_url)
        print(f"[device] desktop backend URL saved: {desktop_backend_url}")
        return {"ok": True, "desktopBackendUrl": desktop_backend_url}

    @app.post("/api/wifi/connect")
    def wifi_connect(body: dict | None = None):
        body = body or {}
        ssid = str(body.get("ssid", "")).strip()
        password = str(body.get("password", ""))
        mqtt_host = str(body.get("mqttHost") or body.get("mqtt_host") or "auto").strip() or "auto"
        mqtt_port = int(body.get("mqttPort") or body.get("mqtt_port") or 1883)
        esp32_setup_url = str(body.get("esp32SetupUrl") or body.get("esp32_setup_url") or "").strip()
        pi_ap_fallback = bool(body.get("piApFallback") or body.get("pi_ap_fallback") or False)
        desktop_backend_url = str(body.get("desktopBackendUrl") or body.get("desktop_backend_url") or "").strip().rstrip("/")

        if not ssid:
            raise HTTPException(status_code=400, detail="SSID is required.")
        if not SETUP_WIFI_SCRIPT.exists():
            raise HTTPException(status_code=500, detail="Wi-Fi setup script was not found.")

        if desktop_backend_url:
            os.environ["DESKTOP_BACKEND_URL"] = desktop_backend_url
            set_env_value(PI_ENV, "DESKTOP_BACKEND_URL", desktop_backend_url)
            print(f"[device] desktop backend URL saved before Wi-Fi change: {desktop_backend_url}")

        env = os.environ.copy()
        env["MQTT_BROKER_HOST"] = mqtt_host
        env["MQTT_BROKER_PORT"] = str(mqtt_port)
        env["PI_AP_FALLBACK"] = "true" if pi_ap_fallback else "false"
        if esp32_setup_url:
            env["ESP32_SETUP_URL"] = esp32_setup_url

        previous_connection = active_wifi_connection()
        pi_env_backup = PI_ENV.read_text(encoding="utf-8") if PI_ENV.exists() else ""
        update_wifi_job("running", ssid, "Wi-Fi 변경을 시작했습니다.")

        threading.Thread(
            target=run_wifi_setup_job,
            args=(ssid, password, env, previous_connection, pi_env_backup),
            daemon=True,
        ).start()
        return {
            "ok": True,
            "pendingReconnect": True,
            "message": "Wi-Fi change started. Raspberry Pi network may disconnect briefly.",
            "ssid": ssid,
        }

    @app.post("/api/robot/command")
    def robot_command(body: dict | None = None):
        body = body or {}
        command = str(
            body.get("cmd")
            or body.get("command")
            or body.get("direction")
            or body.get("action")
            or ""
        ).strip()

        if not command:
            raise HTTPException(status_code=400, detail="command is required.")
        if command not in ROBOT_COMMANDS:
            raise HTTPException(status_code=400, detail=f"unsupported command: {command}")

        print(f"[raspberrypi] HTTP -> Arduino {command}")
        agent.serial.send(command)
        return {"ok": True, "command": command}

    print(f"[raspberrypi] Wi-Fi HTTP API listening on {host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="warning")


def scan_wifi_networks() -> list[dict[str, object]]:
    iwlist_error = ""
    if _command_exists("iwlist"):
        try:
            networks = _scan_with_iwlist()
            if networks:
                return networks
        except RuntimeError as exc:
            iwlist_error = str(exc)

    if _command_exists("nmcli"):
        return _scan_with_nmcli()

    detail = "iwlist and nmcli were not found."
    if iwlist_error:
        detail = f"iwlist failed: {iwlist_error}"
    raise RuntimeError(f"{detail} Install wireless-tools or NetworkManager on the Raspberry Pi.")


def current_wifi_ssid() -> str:
    if _command_exists("iwgetid"):
        ssid = _command_output(["iwgetid", "-r"])
        if ssid:
            return ssid

    if _command_exists("nmcli"):
        ssid = _command_output(["nmcli", "-t", "-f", "ACTIVE,SSID", "dev", "wifi"]).splitlines()
        for line in ssid:
            if line.startswith("yes:"):
                return line.split(":", 1)[1].replace("\\:", ":")

    return ""


def current_wifi_ip() -> str:
    if _command_exists("nmcli"):
        ip = _command_output(["nmcli", "-g", "IP4.ADDRESS", "device", "show", "wlan0"])
        if ip:
            return ip.splitlines()[0].split("/", 1)[0]

    if _command_exists("ip"):
        output = _command_output(["ip", "-4", "addr", "show", "wlan0"])
        match = re.search(r"\binet\s+([0-9.]+)/", output)
        if match:
            return match.group(1)

    return ""


def _scan_with_iwlist() -> list[dict[str, object]]:
    interface = os.getenv("WIFI_SCAN_INTERFACE", "wlan0").strip() or "wlan0"
    iwlist_path = _command_path("iwlist") or "iwlist"
    commands = [
        ["sudo", "-n", iwlist_path, interface, "scan"],
        [iwlist_path, interface, "scan"],
    ]
    best_networks: list[dict[str, object]] = []
    errors: list[str] = []

    for command in commands:
        if command[0] == "sudo" and not _command_exists("sudo"):
            continue
        result = subprocess.run(
            command,
            text=True,
            capture_output=True,
            timeout=30,
            check=False,
        )
        if result.returncode == 0:
            networks = _parse_iwlist_scan(result.stdout)
            if len(networks) > len(best_networks):
                best_networks = networks
            continue
        errors.append(result.stderr.strip() or result.stdout.strip() or "scan failed")

    if best_networks:
        return best_networks

    raise RuntimeError("; ".join(error for error in errors if error) or "Failed to scan Wi-Fi networks.")


def _parse_iwlist_scan(output: str) -> list[dict[str, object]]:
    cells = re.split(r"\n\s*Cell \d+ - Address:", output)
    networks_by_key: dict[tuple[str, int], dict[str, object]] = {}

    for cell in cells:
        if "ESSID:" not in cell:
            continue

        ssid_match = re.search(r'ESSID:"((?:\\.|[^"])*)"', cell)
        ssid = _unescape_iwlist_ssid(ssid_match.group(1)) if ssid_match else ""

        channel = 0
        channel_match = re.search(r"\(Channel\s+(\d+)\)", cell) or re.search(r"\bChannel:(\d+)", cell)
        if channel_match:
            channel = int(channel_match.group(1))

        frequency = 0.0
        frequency_match = re.search(r"Frequency:([0-9.]+)\s*GHz", cell)
        if frequency_match:
            frequency = float(frequency_match.group(1))

        rssi = 0
        signal_match = re.search(r"Signal level=(-?\d+)", cell)
        quality_match = re.search(r"Quality=(\d+)/(\d+)", cell)
        if signal_match:
            rssi = int(signal_match.group(1))
        elif quality_match:
            quality = int(quality_match.group(1))
            total = max(1, int(quality_match.group(2)))
            rssi = round((quality / total) * 100)

        encryption_match = re.search(r"Encryption key:(on|off)", cell)
        secure = encryption_match is None or encryption_match.group(1) == "on"
        security = _iwlist_security(cell, secure)
        esp32_compatible = _esp32_wifi_compatible(channel, frequency)

        network = {
            "ssid": ssid,
            "rssi": rssi,
            "secure": secure,
            "security": security,
            "channel": channel,
            "frequency": frequency,
            "band": _wifi_band(channel, frequency),
            "esp32Compatible": esp32_compatible,
            "compatible": esp32_compatible,
            "unsupportedReason": "" if esp32_compatible else "ESP32 supports 2.4GHz Wi-Fi only.",
        }

        key = (ssid, channel)
        previous = networks_by_key.get(key)
        if previous is None or int(previous["rssi"]) < rssi:
            networks_by_key[key] = network

    return sorted(networks_by_key.values(), key=lambda item: int(item["rssi"]), reverse=True)


def _scan_with_nmcli() -> list[dict[str, object]]:
    result = subprocess.run(
        ["nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY,CHAN", "dev", "wifi", "list", "--rescan", "yes"],
        text=True,
        capture_output=True,
        timeout=20,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Failed to scan Wi-Fi networks.")

    networks_by_key: dict[tuple[str, int], dict[str, object]] = {}
    for line in result.stdout.splitlines():
        parts = _split_nmcli_line(line, 4)
        if len(parts) < 4:
            continue

        ssid, signal_text, security, channel_text = parts
        if not ssid:
            continue

        try:
            rssi = int(signal_text)
        except ValueError:
            rssi = 0
        try:
            channel = int(channel_text)
        except ValueError:
            channel = 0

        key = (ssid, channel)
        network = {
            "ssid": ssid,
            "rssi": rssi,
            "secure": bool(security and security != "--"),
            "security": "" if security == "--" else security,
            "channel": channel,
            "frequency": 0,
            "band": _wifi_band(channel, 0),
            "esp32Compatible": _esp32_wifi_compatible(channel, 0),
            "compatible": _esp32_wifi_compatible(channel, 0),
            "unsupportedReason": "" if _esp32_wifi_compatible(channel, 0) else "ESP32 supports 2.4GHz Wi-Fi only.",
        }
        previous = networks_by_key.get(key)
        if previous is None or int(previous["rssi"]) < rssi:
            networks_by_key[key] = network

    return sorted(networks_by_key.values(), key=lambda item: int(item["rssi"]), reverse=True)


def _split_nmcli_line(line: str, expected_parts: int) -> list[str]:
    parts: list[str] = []
    current = []
    escaping = False
    for char in line:
        if escaping:
            current.append(char)
            escaping = False
        elif char == "\\":
            escaping = True
        elif char == ":" and len(parts) < expected_parts - 1:
            parts.append("".join(current))
            current = []
        else:
            current.append(char)
    parts.append("".join(current))
    return parts


def _unescape_iwlist_ssid(value: str) -> str:
    return value.replace(r"\"", '"').replace(r"\\", "\\")


def _iwlist_security(cell: str, secure: bool) -> str:
    if not secure:
        return ""

    security: list[str] = []
    if "WPA3" in cell:
        security.append("WPA3")
    if "WPA2" in cell or "IEEE 802.11i" in cell:
        security.append("WPA2")
    if "WPA Version" in cell:
        security.append("WPA")
    return "/".join(dict.fromkeys(security)) or "WEP"


def _wifi_band(channel: int, frequency: float) -> str:
    if 1 <= channel <= 14 or 2.3 <= frequency < 2.6:
        return "2.4GHz"
    if channel >= 32 or 4.9 <= frequency < 6.0:
        return "5GHz"
    if frequency >= 6.0:
        return "6GHz"
    return "unknown"


def _esp32_wifi_compatible(channel: int, frequency: float) -> bool:
    if 1 <= channel <= 14:
        return True
    if frequency:
        return 2.3 <= frequency < 2.6
    return channel == 0


def _command_exists(command: str) -> bool:
    result = subprocess.run(["bash", "-lc", f"command -v {command}"], capture_output=True, text=True)
    return result.returncode == 0


def _command_output(command: list[str]) -> str:
    try:
        result = subprocess.run(command, text=True, capture_output=True, timeout=5, check=False)
    except Exception:
        return ""
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def _command_path(command: str) -> str:
    result = subprocess.run(["bash", "-lc", f"command -v {command}"], capture_output=True, text=True)
    if result.returncode != 0:
        return ""
    return result.stdout.strip().splitlines()[0]


def read_env_values(path: Path, keys: tuple[str, ...]) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key in keys:
            values[key] = value
    return values


def update_wifi_job(state: str, ssid: str = "", message: str = "") -> None:
    WIFI_JOB_STATUS.update(
        {
            "state": state,
            "ssid": ssid,
            "message": message,
            "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        }
    )


def run_wifi_setup_job(
    ssid: str,
    password: str,
    env: dict[str, str],
    previous_connection: str,
    pi_env_backup: str,
) -> None:
    print(f"[wifi] background Wi-Fi setup started: {ssid}")
    try:
        result = subprocess.run(
            ["bash", str(SETUP_WIFI_SCRIPT), ssid, password],
            cwd=REPO_ROOT,
            env=env,
            text=True,
            capture_output=True,
            timeout=90,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        print("[wifi] background Wi-Fi setup timed out.")
        update_wifi_job("failed", ssid, "Wi-Fi 변경 시간이 초과되었습니다.")
        if exc.stdout:
            print(exc.stdout)
        if exc.stderr:
            print(exc.stderr)
        return

    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr)

    if result.returncode != 0:
        print(f"[wifi] background Wi-Fi setup failed: {result.returncode}")
        update_wifi_job("failed", ssid, "Wi-Fi 변경에 실패했습니다.")
        return

    print("[wifi] background Wi-Fi setup completed.")
    network_ok, network_error = validate_network_after_wifi_change()
    if not network_ok:
        print(f"[wifi] network validation failed after Wi-Fi change; rolling back. {network_error}")
        if env.get("ROLLBACK_WIFI_ON_BACKEND_REGISTER_FAILURE", "true").lower() == "true":
            rollback_wifi_after_registration_failure(previous_connection, pi_env_backup)
            update_wifi_job("rolled_back", ssid, f"네트워크 확인 실패로 기존 Wi-Fi로 롤백했습니다. {network_error}")
        else:
            update_wifi_job("failed", ssid, f"네트워크 확인에 실패했습니다. {network_error}")
        return

    registered, register_error = register_to_desktop_backend(retries=10, delay=3)
    # if not registered:
    #     print(f"[wifi] desktop backend registration failed after Wi-Fi change; rolling back. {register_error}")
    #     if env.get("ROLLBACK_WIFI_ON_BACKEND_REGISTER_FAILURE", "true").lower() == "true":
    #         rollback_wifi_after_registration_failure(previous_connection, pi_env_backup)
    #         update_wifi_job("rolled_back", ssid, f"백엔드 재등록 실패로 기존 Wi-Fi로 롤백했습니다. {register_error}")
    #     else:
    #         update_wifi_job("failed", ssid, f"백엔드 재등록에 실패했습니다. {register_error}")
    #     return
    if not registered:
        print("[wifi] backend registration failed, but keeping Wi-Fi connection")
        update_wifi_job("completed_partial", ssid, "Wi-Fi는 연결되었지만 backend 등록 실패")
        return
    update_wifi_job("completed", ssid, "Wi-Fi 변경과 백엔드 재등록이 완료되었습니다.")
    restart_agent_after_wifi_change()


def validate_network_after_wifi_change() -> tuple[bool, str]:
    ip = current_wifi_ip()
    if not ip:
        return False, "wlan0 IP를 확인하지 못했습니다."

    if os.getenv("WIFI_VALIDATE_GATEWAY", "true").lower() == "true":
        gateway = default_gateway()
        if not gateway:
            return False, "기본 게이트웨이를 확인하지 못했습니다."
        if not ping_host(gateway, timeout=3):
            return False, f"게이트웨이({gateway})에 연결할 수 없습니다."

    internet_host = os.getenv("WIFI_VALIDATE_INTERNET_HOST", "").strip()
    if internet_host and not ping_host(internet_host, timeout=4):
        return False, f"인터넷 확인 대상({internet_host})에 연결할 수 없습니다."

    return True, ""


def default_gateway() -> str:
    if not _command_exists("ip"):
        return ""

    return _command_output(["bash", "-lc", "ip route show default 2>/dev/null | awk '{print $3; exit}'"])


def ping_host(host: str, timeout: int = 3) -> bool:
    if not host or not _command_exists("ping"):
        return False

    result = subprocess.run(
        ["ping", "-c", "1", "-W", str(timeout), host],
        text=True,
        capture_output=True,
        timeout=timeout + 2,
        check=False,
    )
    return result.returncode == 0


def active_wifi_connection() -> str:
    if not _command_exists("nmcli"):
        return ""

    return _command_output(
        ["bash", "-lc", "nmcli -t -f NAME,DEVICE connection show --active | awk -F: '$2 == \"wlan0\" { print $1; exit }'"]
    )


def rollback_wifi_after_registration_failure(previous_connection: str, pi_env_backup: str) -> None:
    if pi_env_backup:
        PI_ENV.write_text(pi_env_backup, encoding="utf-8")
        print("[wifi] raspberrypi/.env restored after failed backend registration.")

    if not previous_connection:
        print("[wifi] no previous Wi-Fi connection was saved; rollback skipped.")
        return

    if not _command_exists("nmcli"):
        print("[wifi] nmcli was not found; rollback skipped.")
        return

    timeout = os.getenv("NMCLI_CONNECT_TIMEOUT", "30").strip() or "30"
    print(f"[wifi] rolling back Raspberry Pi Wi-Fi to: {previous_connection}")
    subprocess.run(["nmcli", "device", "disconnect", "wlan0"], text=True, capture_output=True, timeout=10, check=False)
    result = subprocess.run(
        ["nmcli", "--wait", timeout, "connection", "up", previous_connection],
        text=True,
        capture_output=True,
        timeout=int(timeout) + 10,
        check=False,
    )
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr)
    if result.returncode != 0:
        print(f"[wifi] rollback failed: {result.returncode}")


def restart_agent_after_wifi_change() -> None:
    if os.getenv("PI_AGENT_RESTART_AFTER_WIFI", "true").lower() != "true":
        return

    def restart() -> None:
        time.sleep(2)
        print("[raspberrypi] restarting agent after Wi-Fi change")
        os.execv(sys.executable, [sys.executable, *sys.argv])

    threading.Thread(target=restart, daemon=True).start()


def start_backend_registration_loop() -> None:
    def loop() -> None:
        register_to_desktop_backend(retries=5, delay=5)
        while True:
            time.sleep(float(os.getenv("DESKTOP_BACKEND_REGISTER_INTERVAL", "300")))
            register_to_desktop_backend(retries=1, delay=0)

    threading.Thread(target=loop, daemon=True).start()


def register_to_desktop_backend(retries: int = 1, delay: float = 0) -> tuple[bool, str]:
    backend_url = desktop_backend_url()
    if not backend_url:
        print("[device] desktop backend was not found. Set DESKTOP_BACKEND_URL if auto-discovery fails.")
        return False, "desktop backend was not found"

    last_error = ""
    for attempt in range(retries):
        pi_ip = current_wifi_ip() or primary_ip()
        if pi_ip:
            payload = {
                "device_id": DEVICE_ID,
                "ip": pi_ip,
                "role": "raspberrypi",
                "ssid": current_wifi_ssid(),
                "agent_port": int(os.getenv("PI_AGENT_HTTP_PORT", "8765")),
                "stream_port": int(os.getenv("STREAM_PORT", "8080")),
            }
            try:
                body = json.dumps(payload).encode("utf-8")
                request = urllib.request.Request(
                    f"{backend_url}/api/device/register",
                    data=body,
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "Connection": "close",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(request, timeout=5) as response:
                    response_body = response.read().decode("utf-8", "replace")
                response_data = json.loads(response_body) if response_body else {}
                if response_data.get("ok") is not True:
                    last_error = response_body or "backend returned ok=false"
                    continue
                mqtt_required = os.getenv("REQUIRE_BACKEND_MQTT_ON_REGISTER", "false").lower() == "true"
                if mqtt_required and response_data.get("mqttConnected") is False:
                    last_error = "backend MQTT reconnect failed"
                    continue
                print(f"[device] registered Pi IP {pi_ip} to desktop backend {backend_url}")
                return True, ""
            except json.JSONDecodeError as exc:
                last_error = f"invalid backend response: {exc}"
            except urllib.error.HTTPError as exc:
                body = exc.read().decode("utf-8", "replace")
                last_error = f"HTTP {exc.code} {body}"
            except Exception as exc:
                last_error = str(exc)

        if attempt < retries - 1 and delay:
            time.sleep(delay)

    print(f"[device] backend registration failed: {backend_url} {last_error}")

    configured = os.getenv("DESKTOP_BACKEND_URL", "").strip().rstrip("/")
    if configured:
        discovered = discover_desktop_backend()
        if discovered and discovered != configured:
            print(f"[device] desktop backend rediscovered: {discovered}")

    return False, last_error


# 전역 캐시 하나 추가 (파일 상단 아무데나)
MQTT_BACKEND_CACHE = {"url": ""}


def desktop_backend_url() -> str:
    # 1. MQTT cache (최우선)
    if MQTT_BACKEND_CACHE["url"]:
        return MQTT_BACKEND_CACHE["url"]

    # 2. env (수동 설정)
    configured = os.getenv("DESKTOP_BACKEND_URL", "").strip().rstrip("/")
    if configured:
        return configured

    # 3. LAN discovery (scan)
    discovered = discover_desktop_backend()
    if discovered:
        print(f"[device] desktop backend discovered: {discovered}")
        return discovered

    return ""


def discover_desktop_backend() -> str:
    candidates = desktop_backend_candidates()
    if not candidates:
        return ""

    with ThreadPoolExecutor(max_workers=64) as executor:
        futures = {executor.submit(is_backend_url, url): url for url in candidates}
        for future in as_completed(futures):
            if future.result():
                return futures[future]
    return ""


def desktop_backend_candidates() -> list[str]:
    port = os.getenv("DESKTOP_BACKEND_PORT", "8000").strip() or "8000"
    urls: list[str] = []
    for ip in arp_table_ips():
        urls.append(f"http://{ip}:{port}")

    for ip in local_subnet_ips(limit=254):
        urls.append(f"http://{ip}:{port}")

    deduped: list[str] = []
    for url in urls:
        if url not in deduped:
            deduped.append(url)
    return deduped


def is_backend_url(url: str) -> bool:
    try:
        request = urllib.request.Request(url, headers={"Accept": "application/json", "Connection": "close"})
        with urllib.request.urlopen(request, timeout=0.6) as response:
            data = json.loads(response.read().decode("utf-8"))
            return data.get("name") == "Ai-Myaong"
    except Exception:
        return False


def arp_table_ips() -> list[str]:
    try:
        result = subprocess.run(["arp", "-a"], text=True, capture_output=True, timeout=3, check=False)
    except Exception:
        return []
    if result.returncode != 0:
        return []

    ips: list[str] = []
    for token in result.stdout.replace("(", " ").replace(")", " ").split():
        if looks_like_private_ipv4(token) and token not in ips:
            ips.append(token)
    return ips


def local_subnet_ips(limit: int) -> list[str]:
    local_ip = primary_ip()
    if not local_ip:
        return []

    try:
        cidr = os.getenv("DESKTOP_BACKEND_DISCOVERY_CIDR", "").strip() or f"{local_ip}/24"
        network = IPv4Network(cidr, strict=False)
    except ValueError:
        return []

    ips: list[str] = []
    for host in network.hosts():
        ip = str(host)
        if ip != local_ip:
            ips.append(ip)
        if len(ips) >= limit:
            break
    return ips


def looks_like_private_ipv4(value: str) -> bool:
    parts = value.split(".")
    if len(parts) != 4:
        return False
    try:
        octets = [int(part) for part in parts]
    except ValueError:
        return False
    return (
        octets[0] == 10
        or (octets[0] == 172 and 16 <= octets[1] <= 31)
        or (octets[0] == 192 and octets[1] == 168)
    )


def set_env_value(path: Path, key: str, value: str) -> None:
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


def primary_ip() -> str:
    import socket

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except Exception:
        return ""
    finally:
        sock.close()


if __name__ == "__main__":
    agent = RaspberryPiAgent()
    signal.signal(signal.SIGTERM, agent.stop)
    start_wifi_http_server(agent)
    agent.start()
