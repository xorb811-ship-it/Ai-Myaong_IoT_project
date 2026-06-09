import json
import os
import shutil
import socket
import subprocess
import threading
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from ipaddress import IPv4Network
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from app.models.command import SharedWifiRequest
from app.runtime_config import read_env_values, runtime_env

router = APIRouter(prefix="/api/network", tags=["network"])

REPO_ROOT = Path(__file__).resolve().parents[3]
PI_ENV = REPO_ROOT / "raspberrypi" / ".env"
SETUP_WIFI_SCRIPT = REPO_ROOT / "scripts" / "setup-raspberrypi-wifi.sh"
BACKEND_ENV = REPO_ROOT / "backend" / ".env"
DESKTOP_ENV = REPO_ROOT / "desktop" / ".env"


@router.get("/status")
def network_status(request: Request):
    pi_status = _pi_agent_status()
    local_wifi_ip = _command_output(["bash", "-lc", "hostname -I | awk '{print $1}'"])
    local_wifi_ssid = _command_output(["bash", "-lc", "iwgetid -r"])
    backend_env = read_env_values(
        BACKEND_ENV,
        ("MQTT_BROKER_HOST", "MQTT_BROKER_PORT", "PI_AGENT_BASE_URL", "CAMERA_STREAM_URL"),
    )
    pi_ip = str(pi_status.get("ip") or "").strip()
    if pi_ip:
        previous_host = backend_env.get("MQTT_BROKER_HOST", "")
        _sync_backend_env_from_pi_ip(str(pi_status["ip"]))
        if previous_host != pi_ip:
            mqtt_client = getattr(request.app.state, "mqtt_client", None)
            if mqtt_client:
                threading.Thread(target=mqtt_client.reconnect_if_config_changed, daemon=True).start()
        backend_env = read_env_values(
            BACKEND_ENV,
            ("MQTT_BROKER_HOST", "MQTT_BROKER_PORT", "PI_AGENT_BASE_URL", "CAMERA_STREAM_URL"),
        )

    return {
        "raspberrypiEnv": read_env_values(
            PI_ENV,
            ("MQTT_BROKER_HOST", "MQTT_BROKER_PORT", "SERIAL_PORT", "MQTT_DISABLED"),
        ),
        "backendEnv": backend_env,
        "wifiIp": pi_status.get("ip") or backend_env.get("MQTT_BROKER_HOST") or local_wifi_ip,
        "wifiSsid": pi_status.get("ssid") or local_wifi_ssid,
        "wifiJob": pi_status.get("wifiJob") or {},
        "source": pi_status.get("source") or "local",
    }


@router.get("/pi-wifi-scan")
def pi_wifi_scan():
    return _pi_agent_json_request("/api/wifi/scan")


@router.post("/pi-wifi-connect")
def pi_wifi_connect(payload: SharedWifiRequest):
    result = _pi_agent_json_request(
        "/api/wifi/connect",
        {
            "ssid": payload.ssid,
            "password": payload.password,
            "mqttHost": payload.mqtt_host,
            "mqttPort": payload.mqtt_port,
            "esp32SetupUrl": payload.esp32_setup_url,
            "piApFallback": payload.pi_ap_fallback,
        },
    )
    _sync_backend_env_from_pi_result(result)
    result["backendEnv"] = read_env_values(
        REPO_ROOT / "backend" / ".env",
        ("MQTT_BROKER_HOST", "MQTT_BROKER_PORT", "PI_AGENT_BASE_URL", "CAMERA_STREAM_URL"),
    )
    return result


@router.post("/shared-wifi")
def configure_shared_wifi(payload: SharedWifiRequest):
    if not SETUP_WIFI_SCRIPT.exists():
        raise HTTPException(status_code=500, detail="Wi-Fi setup script was not found.")
    if shutil.which("bash") is None:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "Wi-Fi setup script can only run on Raspberry Pi/Linux with bash. Use the Raspberry Pi agent endpoint instead.",
                "script": str(SETUP_WIFI_SCRIPT),
            },
        )

    env = os.environ.copy()
    env["MQTT_BROKER_HOST"] = (payload.mqtt_host or "auto").strip() or "auto"
    env["MQTT_BROKER_PORT"] = str(payload.mqtt_port)
    env["PI_AP_FALLBACK"] = "true" if payload.pi_ap_fallback else "false"
    if payload.esp32_setup_url:
        env["ESP32_SETUP_URL"] = payload.esp32_setup_url

    try:
        result = subprocess.run(
            ["bash", str(SETUP_WIFI_SCRIPT), payload.ssid, payload.password],
            cwd=REPO_ROOT,
            env=env,
            text=True,
            capture_output=True,
            timeout=120,
            check=False,
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "bash was not found, so the Wi-Fi setup script could not run.",
                "script": str(SETUP_WIFI_SCRIPT),
            },
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(
            status_code=504,
            detail={
                "message": "Wi-Fi setup timed out.",
                "stdout": exc.stdout or "",
                "stderr": exc.stderr or "",
            },
        ) from exc

    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Wi-Fi setup failed.",
                "stdout": result.stdout,
                "stderr": result.stderr,
            },
        )

    return {
        "ok": True,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "raspberrypiEnv": read_env_values(
            PI_ENV,
            ("MQTT_BROKER_HOST", "MQTT_BROKER_PORT", "SERIAL_PORT", "MQTT_DISABLED"),
        ),
        "backendEnv": read_env_values(
            REPO_ROOT / "backend" / ".env",
            ("MQTT_BROKER_HOST", "MQTT_BROKER_PORT", "PI_AGENT_BASE_URL", "CAMERA_STREAM_URL"),
        ),
    }


def _command_output(command: list[str]) -> str:
    try:
        result = subprocess.run(
            command,
            text=True,
            capture_output=True,
            timeout=5,
            check=False,
        )
    except Exception:
        return ""

    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def _sync_backend_env_from_pi_result(result: dict) -> None:
    raspberrypi_env = result.get("raspberrypiEnv") or {}
    mqtt_host = str(raspberrypi_env.get("MQTT_BROKER_HOST") or "").strip()
    if not mqtt_host:
        return

    mqtt_port = str(raspberrypi_env.get("MQTT_BROKER_PORT") or "1883").strip() or "1883"
    pi_agent_port = str(raspberrypi_env.get("PI_AGENT_HTTP_PORT") or runtime_env("PI_AGENT_HTTP_PORT", "8765")).strip() or "8765"
    stream_port = runtime_env("STREAM_PORT", "8080").strip() or "8080"
    _set_env_value(BACKEND_ENV, "MQTT_BROKER_HOST", mqtt_host)
    _set_env_value(BACKEND_ENV, "MQTT_BROKER_PORT", mqtt_port)
    _set_env_value(BACKEND_ENV, "PI_AGENT_BASE_URL", f"http://{mqtt_host}:{pi_agent_port}")
    _set_env_value(BACKEND_ENV, "CAMERA_STREAM_URL", f"http://{mqtt_host}:{stream_port}/stream.mjpg")
    _set_env_value(DESKTOP_ENV, "MQTT_BROKER_HOST", mqtt_host)
    _set_env_value(DESKTOP_ENV, "MQTT_BROKER_PORT", mqtt_port)
    _set_env_value(DESKTOP_ENV, "MJPEG_STREAM_URL", f"http://{mqtt_host}:{stream_port}/stream.mjpg")


def _sync_backend_env_from_pi_ip(pi_ip: str) -> None:
    if not pi_ip:
        return

    mqtt_port = runtime_env("MQTT_BROKER_PORT", "1883").strip() or "1883"
    pi_agent_port = runtime_env("PI_AGENT_HTTP_PORT", "8765").strip() or "8765"
    stream_port = runtime_env("STREAM_PORT", "8080").strip() or "8080"
    _set_env_value(BACKEND_ENV, "MQTT_BROKER_HOST", pi_ip)
    _set_env_value(BACKEND_ENV, "MQTT_BROKER_PORT", mqtt_port)
    _set_env_value(BACKEND_ENV, "PI_AGENT_BASE_URL", f"http://{pi_ip}:{pi_agent_port}")
    _set_env_value(BACKEND_ENV, "CAMERA_STREAM_URL", f"http://{pi_ip}:{stream_port}/stream.mjpg")
    _set_env_value(DESKTOP_ENV, "MQTT_BROKER_HOST", pi_ip)
    _set_env_value(DESKTOP_ENV, "MQTT_BROKER_PORT", mqtt_port)
    _set_env_value(DESKTOP_ENV, "MJPEG_STREAM_URL", f"http://{pi_ip}:{stream_port}/stream.mjpg")


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


def _pi_agent_json_request(path: str, payload: dict | None = None) -> dict:
    timeout = 35 if path == "/api/wifi/scan" else 8 if payload is not None else 5
    body = None
    method = "GET"
    headers = {"Accept": "application/json", "Connection": "close"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        method = "POST"
        headers["Content-Type"] = "application/json"

    candidate_urls = _reachable_pi_agent_urls() if path == "/api/wifi/scan" else _pi_agent_candidate_urls()
    errors: list[dict[str, str]] = []
    for pi_agent_base_url in candidate_urls:
        request = urllib.request.Request(
            f"{pi_agent_base_url}{path}",
            data=body,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                data = json.loads(response.read().decode("utf-8"))
                _remember_pi_agent_url(pi_agent_base_url)
                if path == "/api/wifi/scan":
                    _send_desktop_backend_url_to_pi(pi_agent_base_url)
                if isinstance(data, dict) and data.get("ip"):
                    _sync_backend_env_from_pi_ip(str(data["ip"]))
                return data
        except urllib.error.HTTPError as exc:
            detail_text = exc.read().decode("utf-8", "replace")
            try:
                detail = json.loads(detail_text)
            except json.JSONDecodeError:
                detail = detail_text or exc.reason
            raise HTTPException(status_code=exc.code, detail=detail) from exc
        except Exception as exc:
            errors.append({"baseUrl": pi_agent_base_url, "error": str(exc)})

    raise HTTPException(
        status_code=502,
        detail={
            "message": "Raspberry Pi Wi-Fi API is not reachable.",
            "tried": errors,
        },
    )


def _pi_agent_candidate_urls() -> list[str]:
    port = runtime_env("PI_AGENT_HTTP_PORT", "8765").strip() or "8765"
    urls: list[str] = []

    configured_url = runtime_env("PI_AGENT_BASE_URL", "").strip()
    if configured_url:
        urls.append(configured_url.rstrip("/"))

    host = runtime_env("MQTT_BROKER_HOST", "").strip()
    if host:
        urls.append(f"http://{host}:{port}")

    urls.append(f"http://raspberrypi.local:{port}")
    urls.extend(_discover_pi_agent_urls(port))

    deduped: list[str] = []
    for url in urls:
        if url and url not in deduped:
            deduped.append(url)
    return deduped


def _desktop_backend_url_for_pi() -> str:
    configured_url = runtime_env("BACKEND_PUBLIC_URL", "").strip().rstrip("/")
    if configured_url:
        return configured_url

    host = _primary_private_ip()
    port = runtime_env("BACKEND_PUBLIC_PORT", "8000").strip() or "8000"
    return f"http://{host}:{port}" if host else ""


def _send_desktop_backend_url_to_pi(pi_agent_base_url: str) -> None:
    desktop_backend_url = _desktop_backend_url_for_pi()
    if not desktop_backend_url:
        return

    body = json.dumps({"desktopBackendUrl": desktop_backend_url}).encode("utf-8")
    request = urllib.request.Request(
        f"{pi_agent_base_url}/api/wifi/desktop-backend",
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json", "Connection": "close"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=1.5) as response:
            response.read()
    except Exception:
        pass


def _primary_private_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        return ip if _looks_like_private_ipv4(ip) else ""
    except Exception:
        for ip in _local_private_ips():
            return ip
        return ""
    finally:
        sock.close()


def _reachable_pi_agent_urls() -> list[str]:
    reachable: list[str] = []
    for url in _pi_agent_candidate_urls():
        if _is_pi_agent_reachable(url):
            reachable.append(url)
    return reachable or _pi_agent_candidate_urls()


def _is_pi_agent_reachable(base_url: str) -> bool:
    request = urllib.request.Request(
        f"{base_url}/api/wifi/status",
        headers={"Accept": "application/json", "Connection": "close"},
    )
    try:
        with urllib.request.urlopen(request, timeout=0.6) as response:
            data = json.loads(response.read().decode("utf-8"))
            return data.get("source") == "raspberrypi"
    except Exception:
        return False


def _discover_pi_agent_urls(port: str) -> list[str]:
    ips = _arp_table_ips()
    if not ips:
        ips = _local_subnet_ips(limit=254)

    discovered: list[str] = []
    with ThreadPoolExecutor(max_workers=64) as executor:
        futures = {
            executor.submit(_probe_pi_agent_ip, ip, port): ip
            for ip in ips
        }
        for future in as_completed(futures):
            url = future.result()
            if url:
                discovered.append(url)
                _remember_pi_agent_url(url)
                break
    return discovered


def _probe_pi_agent_ip(ip: str, port: str) -> str:
    url = f"http://{ip}:{port}"
    return url if _is_pi_agent_reachable(url) else ""


def _arp_table_ips() -> list[str]:
    try:
        result = subprocess.run(
            ["arp", "-a"],
            text=True,
            capture_output=True,
            timeout=3,
            check=False,
        )
    except Exception:
        return []
    if result.returncode != 0:
        return []

    ips: list[str] = []
    for token in result.stdout.replace("(", " ").replace(")", " ").split():
        if _looks_like_private_ipv4(token) and token not in ips:
            ips.append(token)
    return ips


def _local_subnet_ips(limit: int) -> list[str]:
    local_ips = _local_private_ips()
    candidates: list[str] = []
    for local_ip in local_ips:
        try:
            network = IPv4Network(f"{local_ip}/24", strict=False)
        except ValueError:
            continue
        for host in network.hosts():
            ip = str(host)
            if ip != local_ip and ip not in candidates:
                candidates.append(ip)
            if len(candidates) >= limit:
                return candidates
    return candidates


def _local_private_ips() -> list[str]:
    ips: list[str] = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if _looks_like_private_ipv4(ip) and ip not in ips:
                ips.append(ip)
    except Exception:
        pass
    return ips


def _looks_like_private_ipv4(value: str) -> bool:
    parts = value.split(".")
    if len(parts) != 4:
        return False
    try:
        octets = [int(part) for part in parts]
    except ValueError:
        return False
    if any(octet < 0 or octet > 255 for octet in octets):
        return False
    return (
        octets[0] == 10
        or (octets[0] == 172 and 16 <= octets[1] <= 31)
        or (octets[0] == 192 and octets[1] == 168)
    )


def _remember_pi_agent_url(url: str) -> None:
    _set_env_value(BACKEND_ENV, "PI_AGENT_BASE_URL", url)


def _pi_agent_status() -> dict:
    try:
        return _pi_agent_json_request("/api/wifi/status")
    except HTTPException:
        return {}
