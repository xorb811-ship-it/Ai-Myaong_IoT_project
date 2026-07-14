import base64
import os
import socket
import subprocess
import threading
import time
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor, as_completed
from ipaddress import IPv4Network
from urllib.parse import urlparse
from urllib.request import urlopen

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.runtime_config import runtime_env

router = APIRouter(prefix="/api/stream", tags=["stream"])
_camera_lock = threading.Lock()
_camera_url_cache = {"url": "", "checked_at": 0.0}
_CAMERA_CACHE_TTL_SECONDS = 30

_FRAME = base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z"
)


@router.get("/url")
def stream_url():
    stream_prefix = _stream_prefix()
    camera_stream_url = _resolve_camera_stream_url()
    if camera_stream_url and runtime_env("CAMERA_PROXY", "false").lower() != "true":
        return {"url": camera_stream_url, "mode": "external", "source": "auto"}

    if camera_stream_url or runtime_env("SIMULATION_MODE", "true").lower() != "true":
        return {"url": f"{stream_prefix}/live.mjpg", "mode": "live", "source": "proxy"}

    if runtime_env("SIMULATION_MODE", "true").lower() == "true":
        return {"url": f"{stream_prefix}/simulated.mjpg", "mode": "simulated", "source": "simulated"}

    return {"url": f"{stream_prefix}/live.mjpg", "mode": "live", "source": "proxy"}


@router.get("/live.mjpg")
def live_mjpeg():
    camera_stream_url = _resolve_camera_stream_url()
    if camera_stream_url:
        return StreamingResponse(
            _proxy_mjpeg(camera_stream_url),
            media_type="multipart/x-mixed-replace; boundary=frame",
        )

    return StreamingResponse(
        _opencv_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@router.get("/simulated.mjpg")
def simulated_mjpeg():
    return StreamingResponse(_frame_generator(), media_type="multipart/x-mixed-replace; boundary=frame")


def _frame_generator() -> Iterator[bytes]:
    while True:
        yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + _FRAME + b"\r\n"
        time.sleep(0.25)


def _proxy_mjpeg(url: str) -> Iterator[bytes]:
    with urlopen(url, timeout=10) as response:
        while True:
            chunk = response.read(8192)
            if not chunk:
                break
            yield chunk


def _stream_prefix() -> str:
    base_url = runtime_env("STREAM_BASE_URL", "").strip().rstrip("/")
    if base_url.endswith("/api/stream"):
        return base_url
    return f"{base_url}/api/stream" if base_url else "/api/stream"


def _resolve_camera_stream_url() -> str:
    now = time.time()
    cached_url = str(_camera_url_cache.get("url") or "")
    checked_at = float(_camera_url_cache.get("checked_at") or 0)
    if cached_url and now - checked_at < _CAMERA_CACHE_TTL_SECONDS and _is_url_port_open(cached_url):
        return cached_url

    for url in _camera_url_candidates():
        if _is_url_port_open(url):
            _camera_url_cache["url"] = url
            _camera_url_cache["checked_at"] = now
            return url

    _camera_url_cache["url"] = ""
    _camera_url_cache["checked_at"] = now
    return ""


def _camera_url_candidates() -> list[str]:
    stream_port = runtime_env("STREAM_PORT", "8081").strip() or "8081"
    urls: list[str] = []

    configured_url = runtime_env("CAMERA_STREAM_URL", "").strip()
    if configured_url:
      urls.append(configured_url)

    pi_agent_host = _host_from_url(runtime_env("PI_AGENT_BASE_URL", ""))
    if pi_agent_host:
        urls.append(f"http://{pi_agent_host}:{stream_port}/stream.mjpg")

    mqtt_host = runtime_env("MQTT_BROKER_HOST", "").strip().strip('"').strip("'")
    if mqtt_host and _looks_like_private_ipv4(mqtt_host):
        urls.append(f"http://{mqtt_host}:{stream_port}/stream.mjpg")

    urls.append(f"http://raspberrypi.local:{stream_port}/stream.mjpg")

    discovered_url = _discover_camera_url(stream_port)
    if discovered_url:
        urls.append(discovered_url)

    deduped: list[str] = []
    for url in urls:
        if url and url not in deduped:
            deduped.append(url)
    return deduped


def _discover_camera_url(port: str) -> str:
    if runtime_env("CAMERA_AUTO_DISCOVER", "true").lower() == "false":
        return ""

    ips = _arp_table_ips() or _local_subnet_ips(limit=254)
    with ThreadPoolExecutor(max_workers=64) as executor:
        futures = {executor.submit(_is_host_port_open, ip, int(port), 0.35): ip for ip in ips}
        for future in as_completed(futures):
            ip = futures[future]
            try:
                if future.result():
                    return f"http://{ip}:{port}/stream.mjpg"
            except Exception:
                pass
    return ""


def _is_url_port_open(url: str) -> bool:
    parsed = urlparse(url)
    host = parsed.hostname
    if not host:
        return False
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    return _is_host_port_open(host, port, 0.7)


def _is_host_port_open(host: str, port: int, timeout: float) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


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
    candidates: list[str] = []
    for local_ip in _local_private_ips():
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


def _host_from_url(url: str) -> str:
    value = url.strip()
    if not value:
        return ""
    if "://" in value:
        value = value.split("://", 1)[1]
    return value.split("/", 1)[0].split(":", 1)[0]


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


def _opencv_mjpeg() -> Iterator[bytes]:
    try:
        import cv2
    except ImportError:
        yield from _frame_generator()
        return

    source = runtime_env("CAMERA_SOURCE", "0").strip()
    capture_source = int(source) if source.isdigit() else source
    if isinstance(capture_source, int) and hasattr(cv2, "CAP_AVFOUNDATION"):
        capture = cv2.VideoCapture(capture_source, cv2.CAP_AVFOUNDATION)
    else:
        capture = cv2.VideoCapture(capture_source)

    if not capture.isOpened():
        yield from _frame_generator()
        return

    width = int(runtime_env("CAMERA_WIDTH", "640"))
    height = int(runtime_env("CAMERA_HEIGHT", "360"))
    fps = max(1, int(runtime_env("CAMERA_FPS", "10")))
    frame_delay = 1 / fps
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    capture.set(cv2.CAP_PROP_FPS, fps)

    if not _camera_lock.acquire(blocking=False):
        yield from _frame_generator()
        capture.release()
        return

    try:
        missed_frames = 0
        while True:
            ok, frame = capture.read()
            if not ok:
                missed_frames += 1
                if missed_frames > 30:
                    yield from _frame_generator()
                    return
                time.sleep(0.05)
                continue

            missed_frames = 0
            ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
            if not ok:
                continue

            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + encoded.tobytes() + b"\r\n"
            time.sleep(frame_delay)
    finally:
        capture.release()
        _camera_lock.release()
