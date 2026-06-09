import base64
import os
import threading
import time
from collections.abc import Iterator
from urllib.request import urlopen

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.runtime_config import runtime_env

router = APIRouter(prefix="/api/stream", tags=["stream"])
_camera_lock = threading.Lock()

_FRAME = base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z"
)


@router.get("/url")
def stream_url():
    camera_stream_url = runtime_env("CAMERA_STREAM_URL", "").strip()
    if camera_stream_url and runtime_env("CAMERA_PROXY", "false").lower() != "true":
        return {"url": camera_stream_url, "mode": "external"}

    base_url = runtime_env("STREAM_BASE_URL", "").strip().rstrip("/")
    if base_url.endswith("/api/stream"):
        stream_prefix = base_url
    else:
        stream_prefix = f"{base_url}/api/stream" if base_url else "/api/stream"

    if camera_stream_url or runtime_env("SIMULATION_MODE", "true").lower() != "true":
        return {"url": f"{stream_prefix}/live.mjpg", "mode": "live"}

    if runtime_env("SIMULATION_MODE", "true").lower() == "true":
        return {"url": f"{stream_prefix}/simulated.mjpg", "mode": "simulated"}

    return {"url": f"{stream_prefix}/live.mjpg", "mode": "live"}


@router.get("/live.mjpg")
def live_mjpeg():
    camera_stream_url = runtime_env("CAMERA_STREAM_URL", "").strip()
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
