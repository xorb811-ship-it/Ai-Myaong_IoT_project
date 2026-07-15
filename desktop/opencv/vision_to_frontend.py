"""
Lightweight vision worker for frontend overlay work.

Current step:
- Read frames from Raspberry Pi MJPEG stream or local camera.
- Run YOLO object detection.
- Draw only object bounding boxes in a preview window.

Next step:
- Send detected box coordinates to the backend for frontend overlay.
"""

import os
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import requests
from dotenv import load_dotenv
from ultralytics import YOLO


ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
MODEL_PATH = Path(__file__).with_name("yolov8n.pt")
CAPTURE_DIR = Path(__file__).with_name("captures")
CLIP_DIR = Path(__file__).with_name("clips")
EMERGENCY_CLIP_DIR = Path(__file__).with_name("emergency_clips")

load_dotenv(ENV_PATH)
CAPTURE_DIR.mkdir(exist_ok=True)
CLIP_DIR.mkdir(exist_ok=True)
EMERGENCY_CLIP_DIR.mkdir(exist_ok=True)

DEFAULT_CLASS_LABELS = {
    0: "Person",
    15: "Cat",
    16: "Dog",
}

DB_API_TIMEOUT = max(0.5, float(os.getenv("VISION_DB_API_TIMEOUT", "3")))


def env_bool(name, default=False):
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def resolve_capture_source():
    source = os.getenv("MJPEG_STREAM_URL") or os.getenv("CAMERA_SOURCE") or "0"
    source = source.strip()
    return int(source) if source.isdigit() else source


def resolve_backend_url():
    return os.getenv("BACKEND_API_URL", "https://astonishing-wonder-production-a2e3.up.railway.app/").strip().rstrip("/")


def resolve_model_path():
    if MODEL_PATH.exists():
        return str(MODEL_PATH)
    return "yolov8n.pt"


def resolve_class_filter():
    raw = os.getenv("VISION_CLASSES", "0,15,16").strip()
    if not raw:
        return set(DEFAULT_CLASS_LABELS)

    class_ids = set()
    for item in raw.split(","):
        item = item.strip()
        if item:
            class_ids.add(int(item))
    return class_ids


def mjpeg_frame_generator(url):
    while True:
        buffer = b""
        try:
            with requests.get(url, stream=True, timeout=(5, 10)) as response:
                response.raise_for_status()
                for chunk in response.iter_content(chunk_size=4096):
                    if not chunk:
                        continue

                    buffer += chunk
                    start = buffer.find(b"\xff\xd8")
                    end = buffer.find(b"\xff\xd9")

                    if start == -1 or end == -1 or end <= start:
                        continue

                    jpg = buffer[start:end + 2]
                    buffer = buffer[end + 2:]
                    frame = cv2.imdecode(np.frombuffer(jpg, dtype=np.uint8), cv2.IMREAD_COLOR)
                    if frame is not None:
                        yield frame
        except requests.RequestException as error:
            print(f"[Vision] stream lost: {error}", flush=True)
            time.sleep(3)


def opencv_frame_generator(source):
    cap = cv2.VideoCapture(source)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, int(os.getenv("CAMERA_WIDTH", "640")))
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, int(os.getenv("CAMERA_HEIGHT", "360")))

    try:
        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                break
            yield frame
    finally:
        cap.release()


def open_frame_source(source):
    if isinstance(source, str) and source.startswith(("http://", "https://")):
        return mjpeg_frame_generator(source)
    return opencv_frame_generator(source)


def detect_boxes(model, frame, class_filter):
    result = model(frame, verbose=False, conf=float(os.getenv("VISION_CONF", "0.35")))[0]
    boxes = result.boxes if result.boxes is not None else []
    detections = []

    for box in boxes:
        class_id = int(box.cls[0])
        if class_id not in class_filter:
            continue

        x1, y1, x2, y2 = map(int, box.xyxy[0])
        confidence = float(box.conf[0]) if box.conf is not None else 0.0
        detections.append(
            {
                "x": x1,
                "y": y1,
                "w": x2 - x1,
                "h": y2 - y1,
                "label": DEFAULT_CLASS_LABELS.get(class_id, str(class_id)),
                "confidence": confidence,
            }
        )

    return detections


def draw_boxes(frame, detections):
    for item in detections:
        x, y, w, h = item["x"], item["y"], item["w"], item["h"]
        label = f"{item['label']} {item['confidence']:.0%}"

        cv2.rectangle(frame, (x, y), (x + w, y + h), (80, 220, 120), 2)
        cv2.rectangle(frame, (x, max(0, y - 22)), (x + max(96, len(label) * 8), y), (30, 30, 30), -1)
        cv2.putText(frame, label, (x + 6, max(15, y - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (230, 230, 230), 1)


def select_pet_detection(detections):
    pets = [item for item in detections if item["label"] in ("Cat", "Dog")]
    if not pets:
        return None
    return max(pets, key=lambda item: item.get("confidence", 0.0))


def box_center(detection):
    return (
        detection["x"] + detection["w"] / 2,
        detection["y"] + detection["h"] / 2,
    )


class ActivityTracker:
    def __init__(self, backend_url=None):
        self.window_seconds = float(os.getenv("ACTIVITY_WINDOW_SECONDS", "60"))
        self.no_motion_threshold = float(os.getenv("ACTIVITY_NO_MOTION_THRESHOLD", "0.002"))
        self.low_threshold = float(os.getenv("ACTIVITY_LOW_THRESHOLD", "0.01"))
        self.active_threshold = float(os.getenv("ACTIVITY_ACTIVE_THRESHOLD", "0.04"))
        self.min_detected_ratio = float(os.getenv("ACTIVITY_MIN_DETECTED_RATIO", "0.2"))
        self.movement_deadzone = float(os.getenv("ACTIVITY_MOVEMENT_DEADZONE", "0.003"))
        self.activity_score_scale = float(os.getenv("ACTIVITY_SCORE_SCALE", os.getenv("PAW_STEP_SCALE", "50")))
        self.backend_url = backend_url
        self.last_activity_error_at = 0.0
        self.reset()

    def reset(self):
        self.window_started_at = time.time()
        self.last_center = None
        self.last_seen_at = None
        self.movement_scores = []
        self.detected_seconds = 0.0

    def update(self, frame, detections, now):
        if now - self.window_started_at >= self.window_seconds:
            self.print_summary(now)
            self.reset()

        pet = select_pet_detection(detections)
        if pet is None:
            self.last_center = None
            self.last_seen_at = None
            return

        center = box_center(pet)
        if self.last_center is not None:
            h, w = frame.shape[:2]
            diagonal = max((w * w + h * h) ** 0.5, 1.0)
            distance = ((center[0] - self.last_center[0]) ** 2 + (center[1] - self.last_center[1]) ** 2) ** 0.5
            normalized_movement = distance / diagonal
            movement_score = max(0.0, normalized_movement - self.movement_deadzone)
            self.movement_scores.append(movement_score)

        if self.last_seen_at is not None:
            self.detected_seconds += max(0.0, now - self.last_seen_at)

        self.last_center = center
        self.last_seen_at = now

    def print_summary(self, now):
        elapsed = max(now - self.window_started_at, 1.0)
        detected_ratio = self.detected_seconds / elapsed
        movement_sum = sum(self.movement_scores)
        if detected_ratio < self.min_detected_ratio or not self.movement_scores:
            avg = 0.0
            status = "INSUFFICIENT_DATA"
            activity_score = 0
        else:
            avg = movement_sum / len(self.movement_scores)
            status = self.classify(avg)
            activity_score = round(movement_sum * self.activity_score_scale)
            self.post_activity(activity_score, status, self.detected_seconds, elapsed, now)

        print(
            "[Activity] "
            f"avg={avg:.4f} status={status} "
            f"activity_score={activity_score} "
            f"detected={int(self.detected_seconds)}s/{int(elapsed)}s "
            f"samples={len(self.movement_scores)}",
            flush=True,
        )

    def post_activity(self, activity_score, status, detected_seconds, window_seconds, now):
        if not self.backend_url:
            return

        payload = {
            "activity_score": activity_score,
            "status": status,
            "detected_seconds": detected_seconds,
            "window_seconds": window_seconds,
        }
        try:
            response = requests.post(
                f"{self.backend_url}/api/vision/activity",
                json=payload,
                timeout=DB_API_TIMEOUT,
            )
            response.raise_for_status()
        except requests.RequestException as error:
            if now - self.last_activity_error_at > 5:
                print(f"[Vision] Activity post failed: {error}", flush=True)
                self.last_activity_error_at = now

    def classify(self, avg):
        if avg < self.no_motion_threshold:
            return "NO_MOTION"
        if avg < self.low_threshold:
            return "LOW"
        if avg >= self.active_threshold:
            return "ACTIVE"
        return "NORMAL"


class EmergencyTracker:
    def __init__(self, backend_url, source, on_emergency_event=None):
        self.backend_url = backend_url
        self.source = source
        self.on_emergency_event = on_emergency_event
        self.environment_enabled = os.getenv("EMERGENCY_ENABLED", "true").strip().lower() == "true"
        self.enabled = self.environment_enabled
        self.cooldown_seconds = float(os.getenv("EMERGENCY_COOLDOWN_SECONDS", "60"))
        self.missing_grace_seconds = float(os.getenv("EMERGENCY_MISSING_GRACE_SECONDS", "2"))

        self.fall_window_seconds = float(os.getenv("FALL_WINDOW_SECONDS", "0.8"))
        self.fall_drop_ratio = float(os.getenv("FALL_DROP_RATIO", "0.14"))
        self.fall_confirm_seconds = float(os.getenv("FALL_CONFIRM_SECONDS", "2.5"))
        self.fall_still_threshold = float(os.getenv("FALL_STILL_THRESHOLD", "0.004"))
        self.fall_roi_still_threshold = float(os.getenv("FALL_ROI_STILL_THRESHOLD", "0.012"))
        self.fall_scene_motion_threshold = float(os.getenv("FALL_SCENE_MOTION_THRESHOLD", "0.10"))
        self.fall_box_area_change_threshold = float(os.getenv("FALL_BOX_AREA_CHANGE_THRESHOLD", "0.45"))

        legacy_no_motion_seconds = os.getenv("EMERGENCY_NO_MOTION_SECONDS", "600")
        self.no_motion_warning_seconds = float(
            os.getenv("EMERGENCY_NO_MOTION_WARNING_SECONDS", legacy_no_motion_seconds)
        )
        self.no_motion_emergency_seconds = float(
            os.getenv("EMERGENCY_NO_MOTION_EMERGENCY_SECONDS", "900")
        )
        self.no_motion_emergency_seconds = max(
            self.no_motion_emergency_seconds,
            self.no_motion_warning_seconds,
        )
        self.no_motion_center_threshold = float(os.getenv("EMERGENCY_NO_MOTION_CENTER_THRESHOLD", "0.002"))
        self.no_motion_roi_threshold = float(os.getenv("EMERGENCY_NO_MOTION_ROI_THRESHOLD", "0.015"))

        self.seizure_window_seconds = float(os.getenv("SEIZURE_WINDOW_SECONDS", "3"))
        self.seizure_roi_threshold = float(os.getenv("SEIZURE_ROI_MOTION_THRESHOLD", "0.075"))
        self.seizure_center_threshold = float(os.getenv("SEIZURE_CENTER_MOTION_THRESHOLD", "0.012"))
        self.seizure_high_ratio = float(os.getenv("SEIZURE_HIGH_MOTION_RATIO", "0.60"))

        self.center_history = deque()
        self.seizure_history = deque()
        self.last_center = None
        self.last_roi = None
        self.last_scene = None
        self.last_box_area = None
        self.last_seen_at = None
        self.fall_candidate_at = None
        self.fall_still_started_at = None
        self.no_motion_started_at = None
        self.no_motion_warning_fired = False
        self.no_motion_emergency_fired = False
        self.seizure_fired = False
        self.last_fired = {}
        self.last_attempt = {}
        self.last_error_at = 0.0
        self.latest_alert = None
        self.last_center_motion = None
        self.last_roi_motion = None

    def set_remote_enabled(self, enabled):
        next_enabled = self.environment_enabled and bool(enabled)
        if self.enabled == next_enabled:
            return
        self.enabled = next_enabled
        self._reset_observation()
        self.latest_alert = None
        print(f"[Emergency] detection={'ON' if self.enabled else 'OFF'}", flush=True)

    def update(self, frame, detections, now):
        if not self.enabled:
            return

        pet = select_pet_detection(detections)
        if pet is None:
            if self.last_seen_at is None or now - self.last_seen_at > self.missing_grace_seconds:
                self._reset_observation()
            return
        self.last_seen_at = now

        frame_h, frame_w = frame.shape[:2]
        center = box_center(pet)
        normalized_center = (center[0] / max(frame_w, 1), center[1] / max(frame_h, 1))
        box_area = max(1, pet["w"] * pet["h"]) / max(1, frame_w * frame_h)
        box_area_change = None
        if self.last_box_area is not None:
            box_area_change = abs(box_area - self.last_box_area) / max(self.last_box_area, 0.0001)

        center_motion = None
        if self.last_center is not None:
            center_motion = (
                (normalized_center[0] - self.last_center[0]) ** 2
                + (normalized_center[1] - self.last_center[1]) ** 2
            ) ** 0.5

        scene_motion = self._scene_motion(frame)
        roi_motion = self._roi_motion(frame, pet)
        self.last_center_motion = center_motion
        self.last_roi_motion = roi_motion
        self.center_history.append((now, normalized_center[1]))
        while self.center_history and now - self.center_history[0][0] > self.fall_window_seconds:
            self.center_history.popleft()

        self._check_fall(
            now,
            normalized_center[1],
            center_motion,
            roi_motion,
            scene_motion,
            box_area_change,
        )
        self._check_no_motion(now, center_motion, roi_motion)
        self._check_seizure(now, center_motion, roi_motion)
        self.last_center = normalized_center
        self.last_box_area = box_area

    def draw(self, frame, now):
        if not self.latest_alert or now - self.latest_alert["time"] > 5:
            return
        label = self.latest_alert["type"].upper()
        is_warning = self.latest_alert["type"] == "no_motion_warning"
        color = (0, 170, 230) if is_warning else (0, 0, 170)
        prefix = "WARNING" if is_warning else "EMERGENCY"
        cv2.rectangle(frame, (0, 0), (frame.shape[1], 34), color, -1)
        cv2.putText(
            frame,
            f"{prefix}: {label}",
            (10, 23),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.62,
            (255, 255, 255),
            2,
        )

    def _roi_motion(self, frame, pet):
        x = max(0, int(pet["x"]))
        y = max(0, int(pet["y"]))
        x2 = min(frame.shape[1], x + max(1, int(pet["w"])))
        y2 = min(frame.shape[0], y + max(1, int(pet["h"])))
        crop = frame[y:y2, x:x2]
        if crop.size == 0:
            self.last_roi = None
            return None

        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, (64, 64), interpolation=cv2.INTER_AREA)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        motion = None
        if self.last_roi is not None:
            motion = float(np.mean(cv2.absdiff(gray, self.last_roi))) / 255.0
        self.last_roi = gray
        return motion

    def _scene_motion(self, frame):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, (96, 54), interpolation=cv2.INTER_AREA)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        motion = None
        if self.last_scene is not None:
            motion = float(np.mean(cv2.absdiff(gray, self.last_scene))) / 255.0
        self.last_scene = gray
        return motion

    def _check_fall(self, now, center_y, center_motion, roi_motion, scene_motion, box_area_change):
        unstable_scene = (
            scene_motion is not None
            and scene_motion >= self.fall_scene_motion_threshold
        )
        unstable_box = (
            box_area_change is not None
            and box_area_change >= self.fall_box_area_change_threshold
        )
        if unstable_scene or unstable_box:
            self.fall_candidate_at = None
            self.fall_still_started_at = None
            return

        if len(self.center_history) >= 3:
            baseline_y = min(y for _, y in self.center_history)
            if center_y - baseline_y >= self.fall_drop_ratio and self.fall_candidate_at is None:
                self.fall_candidate_at = now
                self.fall_still_started_at = None

        if self.fall_candidate_at is None or center_motion is None or roi_motion is None:
            return
        if now - self.fall_candidate_at > self.fall_confirm_seconds + 2:
            self.fall_candidate_at = None
            self.fall_still_started_at = None
            return

        still_after_drop = (
            center_motion <= self.fall_still_threshold
            and roi_motion <= self.fall_roi_still_threshold
        )
        if still_after_drop:
            if self.fall_still_started_at is None:
                self.fall_still_started_at = now
            elif now - self.fall_still_started_at >= self.fall_confirm_seconds:
                self._fire(
                    "fall_detected",
                    "낙상 감지",
                    "반려동물이 급격히 아래로 이동한 뒤 움직임이 줄었습니다. 상태를 확인해 주세요.",
                    now,
                    confidence=0.85,
                )
                self.fall_candidate_at = None
                self.fall_still_started_at = None
                self.center_history.clear()
        elif center_motion > self.fall_still_threshold * 4 or roi_motion > self.fall_roi_still_threshold * 2:
            self.fall_still_started_at = None

    def _check_no_motion(self, now, center_motion, roi_motion):
        if center_motion is None or roi_motion is None:
            return
        still = (
            center_motion <= self.no_motion_center_threshold
            and roi_motion <= self.no_motion_roi_threshold
        )
        if not still:
            self.no_motion_started_at = None
            self.no_motion_warning_fired = False
            self.no_motion_emergency_fired = False
            return

        if self.no_motion_started_at is None:
            self.no_motion_started_at = now
            return
        elapsed = now - self.no_motion_started_at
        if elapsed >= self.no_motion_warning_seconds and not self.no_motion_warning_fired:
            fired = self._fire(
                "no_motion_warning",
                "장시간 움직임 없음 · 확인 필요",
                f"반려동물이 약 {int(elapsed // 60)}분 동안 거의 움직이지 않았습니다. 상태를 확인해 주세요.",
                now,
                confidence=0.70,
            )
            if fired:
                self.no_motion_warning_fired = True

        if elapsed >= self.no_motion_emergency_seconds and not self.no_motion_emergency_fired:
            fired = self._fire(
                "no_motion_emergency",
                "장시간 미세 움직임 없음 · 긴급 확인",
                f"반려동물의 움직임과 미세 움직임이 약 {int(elapsed // 60)}분 동안 감지되지 않았습니다. 즉시 상태를 확인해 주세요.",
                now,
                confidence=0.88,
            )
            if fired:
                self.no_motion_emergency_fired = True

    def _check_seizure(self, now, center_motion, roi_motion):
        if center_motion is None or roi_motion is None:
            return
        high_internal_motion = (
            roi_motion >= self.seizure_roi_threshold
            and center_motion <= self.seizure_center_threshold
        )
        self.seizure_history.append((now, high_internal_motion))
        while self.seizure_history and now - self.seizure_history[0][0] > self.seizure_window_seconds:
            self.seizure_history.popleft()
        if len(self.seizure_history) < 6:
            return

        span = self.seizure_history[-1][0] - self.seizure_history[0][0]
        high_ratio = sum(1 for _, high in self.seizure_history if high) / len(self.seizure_history)
        if span >= self.seizure_window_seconds * 0.8 and high_ratio >= self.seizure_high_ratio:
            if not self.seizure_fired:
                fired = self._fire(
                    "seizure_suspected",
                    "발작 의심 움직임",
                    "위치 변화는 적지만 몸의 빠른 움직임이 반복 감지되었습니다. 상태를 확인해 주세요.",
                    now,
                    confidence=min(0.95, 0.6 + high_ratio * 0.35),
                )
                if fired:
                    self.seizure_fired = True
        elif high_ratio < 0.2:
            self.seizure_fired = False

    def _fire(self, event_type, title, message, now, confidence=None):
        if now - self.last_fired.get(event_type, 0.0) < self.cooldown_seconds:
            return False
        if now - self.last_attempt.get(event_type, 0.0) < 5:
            return False
        self.last_attempt[event_type] = now
        try:
            event = post_event(
                self.backend_url,
                event_type,
                title,
                message,
                self.source,
                confidence=confidence,
            )
        except requests.RequestException as error:
            if now - self.last_error_at > 5:
                print(f"[Emergency] Event post failed: {error}", flush=True)
                self.last_error_at = now
            return False

        self.last_fired[event_type] = now
        self.latest_alert = {"type": event_type, "time": now}
        if self.on_emergency_event is not None:
            self.on_emergency_event(event_type, event, now)
        print(f"[Emergency] type={event_type} confidence={confidence}", flush=True)
        return True

    def _reset_observation(self):
        self.center_history.clear()
        self.seizure_history.clear()
        self.last_center = None
        self.last_roi = None
        self.last_scene = None
        self.last_box_area = None
        self.last_center_motion = None
        self.last_roi_motion = None
        self.last_seen_at = None
        self.fall_candidate_at = None
        self.fall_still_started_at = None
        self.no_motion_started_at = None
        self.no_motion_warning_fired = False
        self.no_motion_emergency_fired = False
        self.seizure_fired = False


def post_detections(backend_url, source, frame, detections):
    h, w = frame.shape[:2]
    payload = {
        "frame_width": w,
        "frame_height": h,
        "source": str(source),
        "boxes": detections,
    }
    requests.post(f"{backend_url}/api/vision/detections", json=payload, timeout=0.5)


def fetch_control_state(backend_url):
    response = requests.get(f"{backend_url}/api/vision/control", timeout=0.5)
    response.raise_for_status()
    return response.json()


def post_event(backend_url, event_type, title, message, source=None, storage_path=None, confidence=None):
    event_text = {
        "capture_saved": (
            "캡처 저장됨",
            "현재 카메라 화면을 이미지로 저장했어요.",
        ),
        "away_person": (
            "외출 모드 중 사람 감지",
            "외출 모드 상태에서 사람이 감지되었어요.",
        ),
        "clip_saved": (
            "클립 저장 완료",
            "영상 클립 저장을 완료했어요.",
        ),
    }
    if event_type in event_text:
        title, message = event_text[event_type]

    payload = {
        "type": event_type,
        "title": title,
        "message": message,
        "source": str(source) if source is not None else None,
        "storage_path": str(storage_path) if storage_path is not None else None,
        "confidence": confidence,
    }
    response = requests.post(
        f"{backend_url}/api/vision/events",
        json=payload,
        timeout=DB_API_TIMEOUT,
    )
    response.raise_for_status()
    return response.json()


def post_event_media(backend_url, alert_id, storage_path):
    path = Path(storage_path)
    if path.exists() and path.is_file():
        with path.open("rb") as file_obj:
            response = requests.post(
                f"{backend_url}/api/vision/events/{alert_id}/media/upload",
                files={"file": (path.name, file_obj)},
                timeout=max(10, DB_API_TIMEOUT),
            )
        response.raise_for_status()
        return response.json()

    response = requests.post(
        f"{backend_url}/api/vision/events/{alert_id}/media",
        json={"storage_path": str(storage_path)},
        timeout=DB_API_TIMEOUT,
    )
    response.raise_for_status()
    return response.json()


def save_capture(frame):
    path = CAPTURE_DIR / f"capture_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
    ok = cv2.imwrite(str(path), frame)
    if not ok:
        print(f"[Vision] Capture save failed: {path}")
        return None
    print(f"[Vision] Capture saved: {path}")
    return path


class ClipRecorder:
    def __init__(self):
        self.writer = None
        self.path = None
        self.started_at = None

    @property
    def recording(self):
        return self.writer is not None

    def start(self, frame):
        if self.recording:
            return None

        h, w = frame.shape[:2]
        fps = float(os.getenv("VISION_RECORD_FPS", os.getenv("CAMERA_FPS", "10")))
        self.started_at = datetime.now()

        timestamp = self.started_at.strftime("%Y%m%d_%H%M%S")
        candidates = [
            ("webm", "VP80"),
            ("webm", "VP90"),
            ("mp4", "avc1"),
            ("mp4", "mp4v"),
        ]

        for ext, codec in candidates:
            path = CLIP_DIR / f"clip_{timestamp}.{ext}"
            writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*codec), fps, (w, h))
            if writer.isOpened():
                self.path = path
                self.writer = writer
                print(f"[Vision] Clip recording started: {self.path} ({codec})")
                return self.path
            writer.release()

        print("[Vision] Clip writer failed: no compatible codec")
        self.writer = None
        self.path = None
        self.started_at = None
        return None

    def write(self, frame):
        if self.writer is not None:
            self.writer.write(frame)

    def stop(self):
        if self.writer is None:
            return None

        path = self.path
        started_at = self.started_at
        ended_at = datetime.now()
        duration_seconds = int((ended_at - started_at).total_seconds()) if started_at else 0
        self.writer.release()
        print(f"[Vision] Clip saved: {path}")
        self.writer = None
        self.path = None
        self.started_at = None
        return {
            "path": path,
            "started_at": started_at,
            "ended_at": ended_at,
            "duration_seconds": duration_seconds,
        }


class EmergencyClipRecorder:
    EVENT_TYPES = {"fall_detected", "seizure_suspected", "no_motion_emergency"}

    def __init__(
        self,
        backend_url,
        event_types=None,
        output_dir=EMERGENCY_CLIP_DIR,
        filename_prefix="emergency",
        log_prefix="EmergencyClip",
    ):
        self.backend_url = backend_url
        self.event_types = set(event_types or self.EVENT_TYPES)
        self.output_dir = Path(output_dir)
        self.filename_prefix = filename_prefix
        self.log_prefix = log_prefix
        self.pre_seconds = max(0.0, float(os.getenv("EMERGENCY_CLIP_PRE_SECONDS", "5")))
        self.post_seconds = max(1.0, float(os.getenv("EMERGENCY_CLIP_POST_SECONDS", "8")))
        self.record_fps = max(
            1.0,
            float(os.getenv("EMERGENCY_CLIP_FPS", os.getenv("VISION_RECORD_FPS", "10"))),
        )
        self.jpeg_quality = min(
            95,
            max(40, int(os.getenv("EMERGENCY_CLIP_JPEG_QUALITY", "80"))),
        )
        self.buffer = deque()
        self.active = None
        self.last_sample_at = None
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="emergency-clip")

    def add_frame(self, frame, now):
        interval = 1.0 / self.record_fps
        if self.last_sample_at is not None and now - self.last_sample_at + 1e-6 < interval:
            return

        ok, encoded = cv2.imencode(
            ".jpg",
            frame,
            [cv2.IMWRITE_JPEG_QUALITY, self.jpeg_quality],
        )
        if not ok:
            return

        self.last_sample_at = now
        packet = (now, encoded.tobytes())
        self.buffer.append(packet)
        while self.buffer and now - self.buffer[0][0] > self.pre_seconds:
            self.buffer.popleft()

        if self.active is None:
            return
        if now > self.active["triggered_at"]:
            self.active["frames"].append(packet[1])
        if now >= self.active["ends_at"]:
            self._finalize()

    def start(self, event_type, event, now):
        if event_type not in self.event_types:
            return
        if self.active is not None:
            print(
                f"[{self.log_prefix}] skipped overlapping event type={event_type}",
                flush=True,
            )
            return

        alert_id = event.get("id") if isinstance(event, dict) else None
        if not alert_id:
            print(f"[{self.log_prefix}] alert id is missing; recording skipped", flush=True)
            return

        self.active = {
            "alert_id": int(alert_id),
            "event_type": event_type,
            "triggered_at": now,
            "ends_at": now + self.post_seconds,
            "frames": [packet for _, packet in self.buffer],
        }
        print(
            f"[{self.log_prefix}] recording type={event_type} "
            f"pre={self.pre_seconds:g}s post={self.post_seconds:g}s",
            flush=True,
        )

    def stop(self):
        if self.active is not None:
            self._finalize()
        self.executor.shutdown(wait=True)

    def _finalize(self):
        active = self.active
        self.active = None
        if not active or not active["frames"]:
            return
        self.executor.submit(self._save_and_attach, active)

    def _save_and_attach(self, active):
        path = self._write_clip(active["event_type"], active["frames"])
        if path is None:
            return
        try:
            post_event_media(self.backend_url, active["alert_id"], path)
            print(
                f"[{self.log_prefix}] saved alert_id={active['alert_id']} path={path}",
                flush=True,
            )
        except requests.RequestException as error:
            print(
                f"[{self.log_prefix}] media attach failed alert_id={active['alert_id']}: {error}",
                flush=True,
            )

    def _write_clip(self, event_type, encoded_frames):
        first = cv2.imdecode(np.frombuffer(encoded_frames[0], dtype=np.uint8), cv2.IMREAD_COLOR)
        if first is None:
            return None
        height, width = first.shape[:2]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        candidates = [
            ("webm", "VP80"),
            ("webm", "VP90"),
            ("mp4", "avc1"),
            ("mp4", "mp4v"),
        ]

        for extension, codec in candidates:
            path = self.output_dir / f"{self.filename_prefix}_{timestamp}_{event_type}.{extension}"
            writer = cv2.VideoWriter(
                str(path),
                cv2.VideoWriter_fourcc(*codec),
                self.record_fps,
                (width, height),
            )
            if not writer.isOpened():
                writer.release()
                continue

            try:
                for encoded in encoded_frames:
                    frame = cv2.imdecode(
                        np.frombuffer(encoded, dtype=np.uint8),
                        cv2.IMREAD_COLOR,
                    )
                    if frame is None:
                        continue
                    if frame.shape[1] != width or frame.shape[0] != height:
                        frame = cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)
                    writer.write(frame)
            finally:
                writer.release()
            return path

        print(f"[{self.log_prefix}] writer failed: no compatible codec", flush=True)
        return None


def main():
    source = resolve_capture_source()
    backend_url = resolve_backend_url()
    class_filter = resolve_class_filter()
    flip_horizontal = env_bool("VISION_FLIP_HORIZONTAL", False)
    model = YOLO(resolve_model_path())
    frame_source = open_frame_source(source)

    print(f"[Vision] Source: {source}")
    print(f"[Vision] Backend: {backend_url}")
    print(f"[Vision] Classes: {sorted(class_filter)}")
    print(f"[Vision] Flip horizontal: {flip_horizontal}")
    print("[Vision] Press Q or ESC to exit.")

    last_post_error_at = 0.0
    last_control_error_at = 0.0
    last_control_poll_at = 0.0
    last_capture_requested_at = 0.0
    control_baseline_loaded = False
    recording_requested = False
    away_mode = False
    last_away_person_event_at = 0.0
    last_event_error_at = 0.0
    recorder = ClipRecorder()
    emergency_clip_recorder = EmergencyClipRecorder(backend_url)
    away_clip_recorder = EmergencyClipRecorder(
        backend_url,
        event_types={"away_person"},
        output_dir=CLIP_DIR,
        filename_prefix="away",
        log_prefix="AwayClip",
    )
    activity_tracker = ActivityTracker(backend_url)
    emergency_tracker = EmergencyTracker(
        backend_url,
        source,
        on_emergency_event=emergency_clip_recorder.start,
    )

    try:
        for frame in frame_source:
            if flip_horizontal:
                frame = cv2.flip(frame, 1)
            raw_frame = frame.copy()
            now = time.time()
            emergency_clip_recorder.add_frame(raw_frame, now)
            away_clip_recorder.add_frame(raw_frame, now)

            if now - last_control_poll_at >= 0.25:
                last_control_poll_at = now
                try:
                    control = fetch_control_state(backend_url)
                    capture_requested_at = float(control.get("capture_requested_at") or 0)
                    if not control_baseline_loaded:
                        last_capture_requested_at = capture_requested_at
                        control_baseline_loaded = True
                    elif capture_requested_at > last_capture_requested_at:
                        capture_path = save_capture(raw_frame)
                        if capture_path:
                            try:
                                event = post_event(
                                    backend_url,
                                    "capture_saved",
                                    "캡처 저장됨",
                                    "현재 카메라 화면을 이미지로 저장했어요.",
                                    source,
                                )
                                if event.get("id"):
                                    post_event_media(backend_url, event["id"], capture_path)
                            except requests.RequestException as error:
                                if now - last_event_error_at > 5:
                                    print(f"[Vision] Event post failed: {error}")
                                    last_event_error_at = now
                        last_capture_requested_at = capture_requested_at
                    recording_requested = bool(control.get("recording"))
                    away_mode = bool(control.get("away_mode"))
                    emergency_tracker.set_remote_enabled(
                        bool(control.get("emergency_enabled", True))
                    )
                except requests.RequestException as error:
                    if now - last_control_error_at > 5:
                        print(f"[Vision] Control poll failed: {error}")
                        last_control_error_at = now

            if recording_requested and not recorder.recording:
                recorder.start(raw_frame)
            elif not recording_requested and recorder.recording:
                clip = recorder.stop()
                if clip:
                    start_text = clip["started_at"].strftime("%H:%M:%S") if clip["started_at"] else "--:--:--"
                    end_text = clip["ended_at"].strftime("%H:%M:%S")
                    duration = clip["duration_seconds"]
                    minutes = duration // 60
                    seconds = duration % 60
                    duration_text = f"{minutes}분 {seconds}초" if minutes else f"{seconds}초"
                    try:
                        event = post_event(
                            backend_url,
                            "clip_saved",
                            "클립 저장 완료",
                            f"영상 촬영 {start_text} 시작, {end_text} 종료. 총 {duration_text} 녹화했어요.",
                            source,
                        )
                        if event.get("id"):
                            post_event_media(backend_url, event["id"], clip["path"])
                    except requests.RequestException as error:
                        if now - last_event_error_at > 5:
                            print(f"[Vision] Event post failed: {error}")
                            last_event_error_at = now

            recorder.write(raw_frame)

            detections = detect_boxes(model, frame, class_filter)
            activity_tracker.update(frame, detections, now)
            emergency_tracker.update(raw_frame, detections, now)
            if away_mode:
                person = next((item for item in detections if item["label"] == "Person"), None)
                if person and now - last_away_person_event_at >= float(os.getenv("AWAY_PERSON_EVENT_COOLDOWN", "10")):
                    try:
                        event = post_event(
                            backend_url,
                            "away_person",
                            "외출 모드 중 사람 감지",
                            "외출 모드 상태에서 사람이 감지됐어요.",
                            source,
                            confidence=person.get("confidence"),
                        )
                        away_clip_recorder.start("away_person", event, now)
                        last_away_person_event_at = now
                    except requests.RequestException as error:
                        if now - last_event_error_at > 5:
                            print(f"[Vision] Event post failed: {error}")
                            last_event_error_at = now
            try:
                post_detections(backend_url, source, frame, detections)
            except requests.RequestException as error:
                now = cv2.getTickCount() / cv2.getTickFrequency()
                if now - last_post_error_at > 5:
                    print(f"[Vision] Detection post failed: {error}")
                    last_post_error_at = now

            draw_boxes(frame, detections)
            emergency_tracker.draw(frame, now)

            cv2.imshow("Frontend Object Detection Preview", frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
    finally:
        recorder.stop()
        emergency_clip_recorder.stop()
        away_clip_recorder.stop()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
