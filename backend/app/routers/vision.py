from datetime import date, timedelta
import json
from pathlib import Path
import mimetypes
import os
import subprocess
import sys
from time import time, monotonic
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
import database.clips  # noqa: F401
import database.daily_activity_summaries  # noqa: F401
import database.detection_logs  # noqa: F401
import database.emergency_clips  # noqa: F401
import database.feed_logs  # noqa: F401
import database.oauth2_providers  # noqa: F401
import database.pet_health_reports  # noqa: F401
import database.settings  # noqa: F401
import database.user_credentials  # noqa: F401
import database.user_oauth_connections  # noqa: F401
import database.water_logs  # noqa: F401
from database.alerts import Alert
from database.base import get_db
from database.clips import Clip
from database.daily_activity_summaries import DailyActivitySummary
from database.emergency_clips import EmergencyClip
from database.pets import Pet
from database.settings import Settings
from database.time_utils import kst_iso, now_kst_naive, today_kst
from database.user import User


router = APIRouter(prefix="/api/vision", tags=["vision"])

ACTIVITY_SCORE_MAX = max(1.0, float((os.getenv("ACTIVITY_SCORE_MAX") or "1500").strip() or "1500"))
ACTIVITY_TIME_SLOTS = (
    ("DAWN", "새벽"),
    ("MORNING", "오전"),
    ("AFTERNOON", "오후"),
    ("NIGHT", "밤"),
)
ACTIVITY_STATUS_LABELS = {
    "NO_MOTION": "움직임 없음",
    "LOW": "활동량 낮음",
    "NORMAL": "활동량 보통",
    "ACTIVE": "활발",
    "NO_DATA": "데이터 없음",
}


class DetectionBox(BaseModel):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    w: int = Field(ge=0)
    h: int = Field(ge=0)
    label: str
    confidence: float = Field(ge=0, le=1)


class DetectionPayload(BaseModel):
    frame_width: int = Field(gt=0)
    frame_height: int = Field(gt=0)
    boxes: list[DetectionBox] = []
    source: str | None = None
    status: Literal["ok"] = "ok"


class VisionRecordingRequest(BaseModel):
    on: bool


class VisionEmergencyRequest(BaseModel):
    on: bool


class VisionEventCreate(BaseModel):
    type: Literal[
        "away_person",
        "capture_saved",
        "clip_saved",
        "fall_detected",
        "no_motion",
        "no_motion_warning",
        "no_motion_emergency",
        "seizure_suspected",
    ]
    title: str
    message: str
    source: str | None = None
    storage_path: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)


class VisionEventMediaUpdate(BaseModel):
    storage_path: str = Field(min_length=1, max_length=500)


class VisionActivityCreate(BaseModel):
    activity_score: float = Field(ge=0)
    status: Literal["NO_MOTION", "LOW", "NORMAL", "ACTIVE"]
    detected_seconds: float = Field(ge=0)
    window_seconds: float = Field(gt=0)


class VisionRevealRequest(BaseModel):
    path: str


PROJECT_ROOT = Path(__file__).resolve().parents[3]


def _configured_media_dir() -> Path:
    raw = (os.getenv("VISION_MEDIA_DIR") or "/tmp/aimyaong_vision_media").strip()
    path = Path(raw)
    return path if path.is_absolute() else PROJECT_ROOT / path


UPLOADED_MEDIA_DIR = _configured_media_dir()
ALLOWED_MEDIA_DIRS = [
    PROJECT_ROOT / "desktop" / "opencv" / "captures",
    PROJECT_ROOT / "desktop" / "opencv" / "clips",
    PROJECT_ROOT / "desktop" / "opencv" / "emergency_clips",
    UPLOADED_MEDIA_DIR,
]
ALLOWED_MEDIA_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".webm",
    ".mp4",
    ".mov",
    ".m4v",
}

_latest_detection: dict = {
    "frame_width": 0,
    "frame_height": 0,
    "boxes": [],
    "source": None,
    "status": "empty",
    "updated_at": 0.0,
}

_control_state: dict = {
    "capture_request_id": 0,
    "capture_requested_at": 0.0,
    "recording": False,
    "recording_updated_at": 0.0,
    "emergency_enabled": False,
    "active_user_id": None,
}


def _current_user(authorization: str | None, db: Session) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증 토큰이 필요합니다.")
    payload = decode_access_token(authorization.split(" ", 1)[1])
    if not payload:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
    user = db.query(User).filter(User.user_id == int(payload["sub"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    return user


def _remember_active_user(user: User, db: Session) -> None:
    _control_state["active_user_id"] = user.user_id
    settings = db.query(Settings).filter(Settings.user_id == user.user_id).first()
    _control_state["emergency_enabled"] = settings is None or settings.motion_alert != "N"

def _resolve_media_path(raw_path: str) -> Path:
    if not raw_path:
        raise HTTPException(status_code=400, detail="media path is required")

    path = Path(raw_path)
    if not path.is_absolute():
        path = PROJECT_ROOT / path

    resolved = path.resolve()
    allowed = False
    for directory in ALLOWED_MEDIA_DIRS:
        try:
            resolved.relative_to(directory.resolve())
            allowed = True
            break
        except ValueError:
            continue

    if not allowed:
        raise HTTPException(status_code=403, detail="media path is not allowed")
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail="media file not found")

    return resolved


def _safe_upload_name(file: UploadFile) -> str:
    suffix = Path(file.filename or "").suffix.lower()
    guessed = mimetypes.guess_extension(file.content_type or "") or suffix
    if guessed == ".jpe":
        guessed = ".jpg"
    extension = guessed if guessed in ALLOWED_MEDIA_EXTENSIONS else suffix
    if extension not in ALLOWED_MEDIA_EXTENSIONS:
        raise HTTPException(status_code=400, detail="unsupported media type")
    return f"{uuid4().hex}{extension}"


def _save_uploaded_media(alert_id: int, file: UploadFile) -> Path:
    target_dir = UPLOADED_MEDIA_DIR / str(alert_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / _safe_upload_name(file)

    with target.open("wb") as output:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)

    if target.stat().st_size <= 0:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="empty media file")

    return target.resolve()


def _attach_media_path_to_alert(
    alert_id: int,
    media_path: Path,
    db: Session,
) -> dict:
    active_user_id = _control_state.get("active_user_id")
    if active_user_id is None:
        raise HTTPException(status_code=409, detail="Active vision user is required.")

    alert = (
        db.query(Alert)
        .filter(Alert.alert_id == alert_id, Alert.user_id == active_user_id)
        .first()
    )
    if not alert or not alert.alert_type.startswith("vision."):
        raise HTTPException(status_code=404, detail="Vision alert not found.")

    resolved_path = _resolve_media_path(str(media_path))
    try:
        message = json.loads(alert.message or "{}")
    except json.JSONDecodeError:
        message = {"desc": alert.message or ""}
    message["media_path"] = str(resolved_path)
    message["storage_path"] = str(resolved_path)
    alert.message = json.dumps(message, ensure_ascii=False)

    event_type = _event_type_from_alert(alert.alert_type)
    if event_type == "away_person":
        clip = (
            db.query(Clip)
            .filter(Clip.user_id == active_user_id, Clip.file_path == str(resolved_path))
            .first()
        )
        if not clip:
            db.add(Clip(user_id=active_user_id, file_path=str(resolved_path)))
    else:
        emergency_clip = (
            db.query(EmergencyClip)
            .filter(EmergencyClip.alert_id == alert.alert_id)
            .first()
        )
        if emergency_clip:
            emergency_clip.file_path = str(resolved_path)
        else:
            db.add(EmergencyClip(alert_id=alert.alert_id, file_path=str(resolved_path)))

    db.commit()
    db.refresh(alert)
    print(
        f"[VisionEvent] media attached alert_id={alert.alert_id} path={resolved_path}",
        flush=True,
    )
    return _alert_to_vision_event(alert)


def _vision_alert_type(event_type: str) -> str:
    return f"vision.{event_type}"


def _event_type_from_alert(alert_type: str) -> str:
    return alert_type.removeprefix("vision.")


def _event_link(event_type: str) -> str:
    vision_events = {
        "away_person",
        "fall_detected",
        "no_motion",
        "no_motion_warning",
        "no_motion_emergency",
        "seizure_suspected",
    }
    return "/vision" if event_type in vision_events else "/activity"


def _activity_time_slot(hour: int) -> str:
    if hour < 6:
        return "DAWN"
    if hour < 12:
        return "MORNING"
    if hour < 18:
        return "AFTERNOON"
    return "NIGHT"


def _activity_percent(score: float | None) -> int | None:
    if score is None:
        return None
    return min(100, max(0, round((float(score) / ACTIVITY_SCORE_MAX) * 100)))


def _activity_status(percent: int | None) -> str:
    if percent is None:
        return "NO_DATA"
    if percent < 10:
        return "NO_MOTION"
    if percent < 40:
        return "LOW"
    if percent < 70:
        return "NORMAL"
    return "ACTIVE"


def _activity_point(label: str, rows: list[DailyActivitySummary]) -> dict:
    detected_minutes = sum(row.detected_minutes or 0 for row in rows)
    if not rows or detected_minutes <= 0:
        return {
            "label": label,
            "activity_percent": None,
            "avg_activity_level": None,
            "status": "NO_DATA",
            "status_label": ACTIVITY_STATUS_LABELS["NO_DATA"],
            "detected_minutes": 0,
        }

    weighted_score = sum(
        float(row.avg_activity_level or 0) * (row.detected_minutes or 0)
        for row in rows
    ) / detected_minutes
    percent = _activity_percent(weighted_score)
    status = _activity_status(percent)
    return {
        "label": label,
        "activity_percent": percent,
        "avg_activity_level": round(weighted_score, 2),
        "status": status,
        "status_label": ACTIVITY_STATUS_LABELS[status],
        "detected_minutes": detected_minutes,
    }


def _month_range(month: str | None) -> tuple[date, date]:
    if not month:
        today = today_kst()
        year = today.year
        month_num = today.month
    else:
        try:
            year_text, month_text = month.split("-", 1)
            year = int(year_text)
            month_num = int(month_text)
            if month_num < 1 or month_num > 12:
                raise ValueError
        except ValueError as error:
            raise HTTPException(status_code=400, detail="month must use YYYY-MM format") from error

    start = date(year, month_num, 1)
    if month_num == 12:
        end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(year, month_num + 1, 1) - timedelta(days=1)
    return start, end


def _single_pet(db: Session, user_id: int | None = None) -> Pet:
    query = db.query(Pet)
    if user_id is not None:
        query = query.filter(Pet.user_id == user_id)
    pet = query.order_by(Pet.pet_id.asc()).first()
    if not pet:
        raise HTTPException(status_code=400, detail="Pet is required before saving vision events.")
    return pet


def _alert_to_vision_event(alert: Alert) -> dict:
    try:
        data = json.loads(alert.message or "{}")
    except json.JSONDecodeError:
        data = {"desc": alert.message or ""}

    event_type = _event_type_from_alert(alert.alert_type)
    created_at_text = kst_iso(alert.created_at or now_kst_naive())

    return {
        "id": alert.alert_id,
        "type": event_type,
        "title": data.get("title") or alert.alert_type,
        "message": data.get("desc") or data.get("message") or "",
        "source": data.get("source"),
        "storage_path": data.get("media_path") or data.get("storage_path"),
        "confidence": data.get("confidence"),
        "created_at": created_at_text,
    }


def _log_vision_event(alert: Alert, payload: VisionEventCreate) -> None:
    media = payload.storage_path or "-"
    print(
        f"[VisionEvent] type={payload.type} alert_id={alert.alert_id} "
        f"pet_id={alert.pet_id} media={media}",
        flush=True,
    )


def _active_pet(db: Session) -> Pet:
    active_user_id = _control_state.get("active_user_id")
    if active_user_id is None:
        raise HTTPException(status_code=409, detail="Active vision user is required before saving vision data.")
    return _single_pet(db, active_user_id)


@router.post("/detections")
def update_detections(payload: DetectionPayload):
    global _latest_detection
    _latest_detection = {
        **payload.model_dump(),
        "updated_at": time(),
    }
    return {"ok": True, "boxes": len(payload.boxes)}


@router.get("/detections/latest")
def latest_detections(request: Request):
    # 후방 초음파 센서값을 함께 실어 프론트가 실시간 후방 거리/경고를 표시할 수 있게 한다.
    # (파이 → POST /api/robot/sensor 가 simulator.sensor 에 저장해 둔 값)
    sim = request.app.state.simulator
    sensor = sim.status().get("sensor", {})
    # staleness: 마지막 센서 수신이 너무 오래됐으면 '끊김'으로 보고 값을 비운다.
    # (아두이노가 1초마다 거리를 보내므로 5초 무신호면 라이브가 아님)
    STALE_AFTER_SEC = 5.0
    last_at = getattr(sim, "sensor_updated_at", 0.0)
    age = monotonic() - last_at if last_at else None
    fresh = last_at > 0 and age is not None and age <= STALE_AFTER_SEC
    return {
        **_latest_detection,
        "rear_sensor": {
            # 라이브일 때만 실제 값을 노출, 끊기면 None → 프론트가 '대기' 표시 & 경고 자동 해제
            "distance_cm": sensor.get("rear_distance_cm") if fresh else None,
            "rear_obstacle": bool(sensor.get("rear_obstacle", False)) if fresh else False,
            # 후진 차단/자동정지용 '즉시 위험'(생값 기준, 필터 우회) — 안전 신호
            "rear_obstacle_immediate": bool(sensor.get("rear_obstacle_immediate", False)) if fresh else False,
            "threshold_cm": sensor.get("rear_obstacle_threshold_cm", 15),
            "fresh": bool(fresh),
            "age_sec": round(age, 1) if age is not None else None,
        },
    }


@router.post("/capture")
def request_capture(authorization: str = Header(None), db: Session = Depends(get_db)):
    user = _current_user(authorization, db)
    _remember_active_user(user, db)
    _control_state["capture_request_id"] += 1
    _control_state["capture_requested_at"] = time()
    return {
        "ok": True,
        "capture_request_id": _control_state["capture_request_id"],
    }


@router.post("/recording")
def set_recording(payload: VisionRecordingRequest, authorization: str = Header(None), db: Session = Depends(get_db)):
    user = _current_user(authorization, db)
    _remember_active_user(user, db)
    _control_state["recording"] = payload.on
    _control_state["recording_updated_at"] = time()
    return {"ok": True, "recording": _control_state["recording"]}


@router.post("/emergency")
def set_emergency_detection(
    payload: VisionEmergencyRequest,
    authorization: str = Header(None),
    db: Session = Depends(get_db),
):
    user = _current_user(authorization, db)
    settings = db.query(Settings).filter(Settings.user_id == user.user_id).first()
    if not settings:
        settings = Settings(user_id=user.user_id)
        db.add(settings)

    settings.motion_alert = "Y" if payload.on else "N"
    db.commit()
    _control_state["active_user_id"] = user.user_id
    _control_state["emergency_enabled"] = payload.on
    return {"ok": True, "emergency_enabled": payload.on}


@router.get("/control")
def get_control_state(request: Request):
    status = request.app.state.simulator.status()
    return {
        **_control_state,
        "away_mode": bool(status.get("away_mode")),
    }


@router.post("/events")
def create_event(payload: VisionEventCreate, db: Session = Depends(get_db)):
    pet = _active_pet(db)
    message = {
        "title": payload.title,
        "desc": payload.message,
        "source": payload.source,
        "media_path": payload.storage_path,
        "storage_path": payload.storage_path,
        "confidence": payload.confidence,
        "link": _event_link(payload.type),
    }
    alert = Alert(
        user_id=pet.user_id,
        pet_id=pet.pet_id,
        alert_type=_vision_alert_type(payload.type),
        message=json.dumps(message, ensure_ascii=False),
        is_confirmed="N",
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    _log_vision_event(alert, payload)
    return _alert_to_vision_event(alert)


@router.post("/events/{alert_id}/media")
def attach_event_media(
    alert_id: int,
    payload: VisionEventMediaUpdate,
    db: Session = Depends(get_db),
):
    resolved_path = _resolve_media_path(payload.storage_path)
    return _attach_media_path_to_alert(alert_id, resolved_path, db)


@router.post("/events/{alert_id}/media/upload")
def upload_event_media(
    alert_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    saved_path = _save_uploaded_media(alert_id, file)
    return _attach_media_path_to_alert(alert_id, saved_path, db)


@router.post("/activity")
def save_activity(payload: VisionActivityCreate, db: Session = Depends(get_db)):
    pet = _active_pet(db)
    now_kst = now_kst_naive()
    summary_date = now_kst.date()
    time_slot = _activity_time_slot(now_kst.hour)
    detected_minutes = max(1, int((payload.detected_seconds + 59) // 60))

    row = (
        db.query(DailyActivitySummary)
        .filter(
            DailyActivitySummary.pet_id == pet.pet_id,
            DailyActivitySummary.summary_date == summary_date,
            DailyActivitySummary.time_slot == time_slot,
        )
        .first()
    )

    if row:
        previous_minutes = row.detected_minutes or 0
        total_minutes = previous_minutes + detected_minutes
        previous_score = row.avg_activity_level or 0.0
        row.avg_activity_level = (
            (previous_score * previous_minutes) + (payload.activity_score * detected_minutes)
        ) / max(total_minutes, 1)
        row.detected_minutes = total_minutes
        row.status = _activity_status(_activity_percent(row.avg_activity_level))
    else:
        row = DailyActivitySummary(
            user_id=pet.user_id,
            pet_id=pet.pet_id,
            summary_date=summary_date,
            time_slot=time_slot,
            avg_activity_level=payload.activity_score,
            status=_activity_status(_activity_percent(payload.activity_score)),
            detected_minutes=detected_minutes,
        )
        db.add(row)

    db.commit()
    db.refresh(row)
    return {
        "ok": True,
        "summary_id": row.summary_id,
        "user_id": row.user_id,
        "pet_id": row.pet_id,
        "summary_date": row.summary_date.isoformat(),
        "time_slot": row.time_slot,
        "avg_activity_level": row.avg_activity_level,
        "status": row.status,
        "detected_minutes": row.detected_minutes,
    }


@router.get("/activity/stats")
def activity_stats(
    period: Literal["day", "week", "month"] = Query("day"),
    month: str | None = Query(None),
    authorization: str = Header(None),
    db: Session = Depends(get_db),
):
    user = _current_user(authorization, db)
    _remember_active_user(user, db)
    pet = _single_pet(db, user.user_id)
    if period == "month":
        start_date, end_date = _month_range(month)
    else:
        end_date = today_kst()
        days = 1 if period == "day" else 7
        start_date = end_date - timedelta(days=days - 1)
    rows = (
        db.query(DailyActivitySummary)
        .filter(
            DailyActivitySummary.user_id == user.user_id,
            DailyActivitySummary.pet_id == pet.pet_id,
            DailyActivitySummary.summary_date >= start_date,
            DailyActivitySummary.summary_date <= end_date,
        )
        .order_by(DailyActivitySummary.summary_date.asc())
        .all()
    )

    if period == "day":
        points = [
            _activity_point(
                label,
                [row for row in rows if row.time_slot == slot],
            )
            for slot, label in ACTIVITY_TIME_SLOTS
        ]
    else:
        weekday_labels = ("월", "화", "수", "목", "금", "토", "일")
        points = []
        if period == "month":
            days = (end_date - start_date).days + 1
        for offset in range(days):
            target_date = start_date + timedelta(days=offset)
            label = (
                weekday_labels[target_date.weekday()]
                if period == "week"
                else f"{target_date.month}/{target_date.day}"
            )
            points.append(
                _activity_point(
                    label,
                    [row for row in rows if row.summary_date == target_date],
                )
            )

    measured = [point for point in points if point["activity_percent"] is not None]
    average_percent = (
        round(sum(point["activity_percent"] for point in measured) / len(measured))
        if measured
        else None
    )
    status = _activity_status(average_percent)
    return {
        "period": period,
        "month": start_date.strftime("%Y-%m") if period == "month" else None,
        "score_max": ACTIVITY_SCORE_MAX,
        "average_percent": average_percent,
        "status": status,
        "status_label": ACTIVITY_STATUS_LABELS[status],
        "points": points,
    }


@router.get("/events/recent")
def recent_events(limit: int = 20, authorization: str = Header(None), db: Session = Depends(get_db)):
    user = _current_user(authorization, db)
    _remember_active_user(user, db)
    limit = max(1, min(limit, 100))
    rows = (
        db.query(Alert)
        .filter(Alert.user_id == user.user_id, Alert.alert_type.like("vision.%"))
        .order_by(Alert.created_at.desc(), Alert.alert_id.desc())
        .limit(limit)
        .all()
    )
    return {"events": [_alert_to_vision_event(row) for row in rows]}


@router.get("/media")
def get_media(path: str = Query(...)):
    resolved = _resolve_media_path(path)
    media_type = mimetypes.guess_type(resolved.name)[0]
    return FileResponse(resolved, media_type=media_type)


@router.post("/reveal")
def reveal_media(payload: VisionRevealRequest):
    resolved = _resolve_media_path(payload.path)

    if os.name == "nt":
        subprocess.Popen(["explorer", f"/select,{resolved}"])
    else:
        opener = "open" if sys.platform == "darwin" else "xdg-open"
        subprocess.Popen([opener, str(resolved.parent)])

    return {"ok": True, "path": str(resolved)}
