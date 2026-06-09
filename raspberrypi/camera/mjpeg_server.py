import os
import sys
import threading
import time
from io import BytesIO
from glob import glob
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from collections.abc import Iterator

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:
    load_dotenv = None

if load_dotenv is not None:
    load_dotenv()

BOUNDARY = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
STREAM_MEDIA_TYPE = "multipart/x-mixed-replace; boundary=frame"
STREAM_PATHS = {"/", "/stream", "/stream.mjpg", "/live.mjpg"}
DEFAULT_FRAME_WAIT_TIMEOUT = 2.0
_picamera2_streamer = None
_picamera2_streamer_lock = threading.Lock()


def create_app():
    from fastapi import FastAPI
    from fastapi.responses import StreamingResponse

    fastapi_app = FastAPI(title="Ai-Myaong MJPEG Camera Stream", version="0.1.0")

    @fastapi_app.get("/stream")
    def stream() -> StreamingResponse:
        return StreamingResponse(frames(), media_type=STREAM_MEDIA_TYPE)

    return fastapi_app


try:
    app = create_app()
except ModuleNotFoundError as error:
    app = None
    print(f"[camera] FastAPI server unavailable: {error}")


def frames() -> Iterator[bytes]:
    backend = os.getenv("CAMERA_BACKEND", "picamera2").strip().lower()
    if backend == "opencv":
        yield from opencv_frames()
        return

    try:
        yield from picamera2_frames()
    except ModuleNotFoundError as error:
        log_picamera2_error(error)
    except Exception as error:
        print(f"[camera] Picamera2 stream failed: {error}")


def picamera2_frames() -> Iterator[bytes]:
    streamer = get_picamera2_streamer()
    yield from streamer.frames()


def get_picamera2_streamer():
    global _picamera2_streamer

    with _picamera2_streamer_lock:
        if _picamera2_streamer is None:
            _picamera2_streamer = Picamera2Streamer()
        return _picamera2_streamer


class Picamera2Streamer:
    def __init__(self) -> None:
        self._condition = threading.Condition()
        self._frame: bytes | None = None
        self._error: Exception | None = None
        self._thread: threading.Thread | None = None
        self._clients = 0
        self._running = False

    def frames(self) -> Iterator[bytes]:
        self._add_client()
        last_frame = None
        wait_timeout = float(os.getenv("CAMERA_FRAME_WAIT_TIMEOUT", str(DEFAULT_FRAME_WAIT_TIMEOUT)))

        try:
            while True:
                with self._condition:
                    has_update = self._condition.wait_for(
                        lambda: self._frame is not last_frame or self._error is not None,
                        timeout=wait_timeout,
                    )
                    if self._error is not None:
                        log_picamera2_error(self._error)
                        return
                    frame = self._frame

                if frame is None:
                    continue

                if has_update:
                    last_frame = frame
                yield BOUNDARY + frame + b"\r\n"
        finally:
            self._remove_client()

    def _add_client(self) -> None:
        with self._condition:
            self._clients += 1
            if self._running:
                return

            self._frame = None
            self._error = None
            self._running = True
            self._thread = threading.Thread(target=self._capture_loop, daemon=True)
            self._thread.start()

    def _remove_client(self) -> None:
        with self._condition:
            self._clients = max(0, self._clients - 1)
            self._condition.notify_all()

    def _capture_loop(self) -> None:
        camera = None
        try:
            Picamera2 = import_picamera2()

            width = int(os.getenv("CAMERA_WIDTH", "640"))
            height = int(os.getenv("CAMERA_HEIGHT", "360"))
            fps = max(1, int(os.getenv("CAMERA_FPS", "15")))
            quality = int(os.getenv("CAMERA_JPEG_QUALITY", "82"))
            frame_delay = 1 / fps
            max_failures = max(1, int(os.getenv("CAMERA_MAX_CAPTURE_FAILURES", "30")))
            capture_failures = 0

            camera = Picamera2()
            camera.options["quality"] = quality
            config = camera.create_video_configuration(
                main={"size": (width, height)},
                controls={"FrameRate": fps},
            )
            camera.configure(config)
            camera.start()
            print(f"[camera] Picamera2 MJPEG stream started at {width}x{height} {fps}fps")

            while True:
                with self._condition:
                    if self._clients == 0 and not self._condition.wait_for(
                        lambda: self._clients > 0, timeout=5
                    ):
                        return

                buffer = BytesIO()
                try:
                    camera.capture_file(buffer, format="jpeg")
                except Exception as error:
                    capture_failures += 1
                    print(
                        f"[camera] Picamera2 capture failed "
                        f"({capture_failures}/{max_failures}): {error}"
                    )
                    if capture_failures >= max_failures:
                        raise
                    time.sleep(min(1.0, frame_delay * 2))
                    continue

                capture_failures = 0

                with self._condition:
                    self._frame = buffer.getvalue()
                    self._condition.notify_all()

                time.sleep(frame_delay)
        except Exception as error:
            with self._condition:
                self._error = error
                self._condition.notify_all()
        finally:
            if camera is not None:
                camera.stop()
                camera.close()
            with self._condition:
                self._running = False
                self._thread = None
                self._condition.notify_all()


def log_picamera2_error(error: Exception) -> None:
    if isinstance(error, ModuleNotFoundError):
        if error.name == "picamera2":
            print(
                "[camera] Picamera2 is not installed for this Python. "
                "Install it on Raspberry Pi with: sudo apt install -y python3-picamera2"
            )
            return
        if error.name and error.name.startswith("libcamera"):
            print(
                "[camera] libcamera Python bindings are missing for this Python. "
                "Install them on Raspberry Pi with: sudo apt install -y python3-libcamera"
            )
            return
        print(f"[camera] Picamera2 dependency is missing: {error}")
        return

    print(f"[camera] Picamera2 stream failed: {error}")


def import_picamera2():
    add_system_camera_paths()

    try:
        from picamera2 import Picamera2

        return Picamera2
    except ModuleNotFoundError:
        raise


def add_system_camera_paths() -> None:
    candidate_paths = {
        "/usr/lib/python3/dist-packages",
        "/usr/local/lib/python3/dist-packages",
        *glob("/usr/lib/python3.*/dist-packages"),
        *glob("/usr/local/lib/python3.*/dist-packages"),
        *glob("/usr/lib/python3.*/site-packages"),
        *glob("/usr/local/lib/python3.*/site-packages"),
        *glob("/usr/lib/*-linux-gnu/python3/dist-packages"),
        *glob("/usr/lib/*-linux-gnu/python3.*/dist-packages"),
        *glob("/usr/local/lib/*-linux-gnu/python3/dist-packages"),
        *glob("/usr/local/lib/*-linux-gnu/python3.*/dist-packages"),
    }
    for path in candidate_paths:
        if os.path.isdir(path) and path not in sys.path:
            sys.path.append(path)


def opencv_frames() -> Iterator[bytes]:
    try:
        import cv2
    except ImportError:
        print("[camera] OpenCV is not installed; install python3-opencv or use Picamera2.")
        return

    source = os.getenv("CAMERA_SOURCE", "0").strip()
    capture_source = int(source) if source.isdigit() else source
    width = int(os.getenv("CAMERA_WIDTH", "640"))
    height = int(os.getenv("CAMERA_HEIGHT", "360"))
    fps = max(1, int(os.getenv("CAMERA_FPS", "15")))
    quality = int(os.getenv("CAMERA_JPEG_QUALITY", "82"))
    frame_delay = 1 / fps
    wait_timeout = float(os.getenv("CAMERA_FRAME_WAIT_TIMEOUT", str(DEFAULT_FRAME_WAIT_TIMEOUT)))
    max_failures = max(1, int(os.getenv("CAMERA_MAX_CAPTURE_FAILURES", "30")))
    last_frame: bytes | None = None
    missed_frames = 0

    capture = cv2.VideoCapture(capture_source)
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    capture.set(cv2.CAP_PROP_FPS, fps)

    if not capture.isOpened():
        print(f"[camera] could not open camera source: {source}")
        return

    print(f"[camera] OpenCV MJPEG stream started from {source} at {width}x{height} {fps}fps")

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                missed_frames += 1
                if missed_frames >= max_failures:
                    print(f"[camera] OpenCV capture failed {missed_frames} times; stopping stream.")
                    return
                if last_frame is not None:
                    yield BOUNDARY + last_frame + b"\r\n"
                    time.sleep(wait_timeout)
                    continue
                time.sleep(0.05)
                continue

            missed_frames = 0
            ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
            if ok:
                last_frame = encoded.tobytes()
                yield BOUNDARY + last_frame + b"\r\n"
            time.sleep(frame_delay)
    finally:
        capture.release()


class MjpegHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path not in STREAM_PATHS:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        self.send_response(HTTPStatus.OK)
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Content-Type", STREAM_MEDIA_TYPE)
        self.end_headers()

        try:
            for frame in frames():
                self.wfile.write(frame)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            return

    def log_message(self, format: str, *args) -> None:
        print(f"[camera] {self.address_string()} - {format % args}")


def run_http_server() -> None:
    port = int(os.getenv("STREAM_PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), MjpegHandler)
    print(f"[camera] MJPEG stream server running on http://0.0.0.0:{port}/stream")
    server.serve_forever()


if __name__ == "__main__":
    run_http_server()
