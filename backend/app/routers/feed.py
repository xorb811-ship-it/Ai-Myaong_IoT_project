from datetime import timedelta
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.models.command import CommandResponse, FeedRequest, WaterRequest
from database.base import get_db
from database.user import User
from database.pets import Pet
from database.feed_logs import FeedLog
from database.time_utils import kst_iso, now_kst_naive
from database.water_logs import WaterLog

router = APIRouter(prefix="/api/dispenser", tags=["dispenser"])


def _claim_dispenser_owner(request: Request, authorization: Optional[str]) -> None:
    """명령을 보낸 사용자의 펫을 이 디스펜서의 주인으로 기억해둔다.

    ESP32 는 실측 배출량만 알려줄 뿐 '누구 것'인지 모른다. 기기↔사용자 매핑 테이블이
    없어서, 실제로 이 기기에 명령을 보낸 사람이 가장 확실한 단서다.
    인증은 선택 — 토큰이 없거나(스케줄러 등) DB가 없어도 배식 자체는 되어야 한다.
    """
    logger = getattr(request.app.state, "dispenser_logger", None)
    if logger is None or not authorization:
        return
    try:
        from database.base import SessionLocal

        if SessionLocal is None:
            return
        db = SessionLocal()
        try:
            user = _current_user(authorization, db)
            logger.remember_owner(_resolve_pet_id(user, None, db))
        finally:
            db.close()
    except Exception:
        pass  # 주인 판별 실패가 배식을 막아서는 안 된다


@router.post("/feed", response_model=CommandResponse)
def feed(payload: FeedRequest, request: Request, authorization: str = Header(None)):
    _claim_dispenser_owner(request, authorization)
    return request.app.state.feed_service.feed(payload.amount)


@router.post("/water", response_model=CommandResponse)
def water(payload: WaterRequest, request: Request, authorization: str = Header(None)):
    _claim_dispenser_owner(request, authorization)
    return request.app.state.feed_service.water(payload.seconds)


# ── 배식/급수 기록 (기존 FEED_LOGS / WATER_LOGS 테이블에 저장) ──

def _current_user(authorization: Optional[str], db: Session) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증 토큰이 필요합니다.")
    payload = decode_access_token(authorization.split(" ", 1)[1])
    if not payload:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
    user = db.query(User).filter(User.user_id == int(payload["sub"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    return user


def _resolve_pet_id(user: User, pet_id: Optional[int], db: Session) -> int:
    # pet_id 가 주어지면 본인 펫인지 확인, 없으면 첫 펫으로
    if pet_id:
        pet = db.query(Pet).filter(Pet.pet_id == pet_id, Pet.user_id == user.user_id).first()
    else:
        pet = db.query(Pet).filter(Pet.user_id == user.user_id).first()
    if not pet:
        raise HTTPException(status_code=400, detail="등록된 반려동물이 없어 기록할 수 없습니다.")
    return pet.pet_id


def _minute_window():
    start = now_kst_naive().replace(second=0, microsecond=0)
    return start, start + timedelta(minutes=1)


def _find_auto_feed_log_this_minute(db: Session, user_id: int, pet_id: int):
    minute_start, minute_end = _minute_window()
    return (
        db.query(FeedLog)
        .filter(
            FeedLog.user_id == user_id,
            FeedLog.pet_id == pet_id,
            FeedLog.feed_type == "auto",
            FeedLog.created_at >= minute_start,
            FeedLog.created_at < minute_end,
        )
        .first()
    )


def _find_auto_water_log_this_minute(db: Session, user_id: int, pet_id: int):
    minute_start, minute_end = _minute_window()
    return (
        db.query(WaterLog)
        .filter(
            WaterLog.user_id == user_id,
            WaterLog.pet_id == pet_id,
            WaterLog.water_type == "auto",
            WaterLog.created_at >= minute_start,
            WaterLog.created_at < minute_end,
        )
        .first()
    )


class FeedLogCreate(BaseModel):
    amount_g: float
    feed_type: str = "manual"   # manual | auto | quick
    pet_id: Optional[int] = None


class WaterLogCreate(BaseModel):
    amount_ml: float
    water_type: str = "manual"
    pet_id: Optional[int] = None


class PumpSpeedRequest(BaseModel):
    speed: int


class PresenceConfigRequest(BaseModel):
    enabled: bool


def _publish_dispenser_command(request: Request, topic: str, payload: dict):
    request_id = str(uuid4())
    message = {"request_id": request_id, **payload}
    mqtt_client = request.app.state.mqtt_client
    mqtt_client.publish(topic, message)
    return {
        "request_id": request_id,
        "status": "accepted",
        "topic": topic,
        "payload": message,
        "simulated": mqtt_client.simulation_mode,
    }


@router.post("/feed-log")
def create_feed_log(body: FeedLogCreate, authorization: str = Header(None), db: Session = Depends(get_db)):
    user = _current_user(authorization, db)
    pet_id = _resolve_pet_id(user, body.pet_id, db)
    if body.feed_type == "auto":
        existing = _find_auto_feed_log_this_minute(db, user.user_id, pet_id)
        if existing:
            return {
                "feed_id": existing.feed_id,
                "pet_id": existing.pet_id,
                "food_amount_g": existing.food_amount_g,
                "feed_type": existing.feed_type,
            }

    log = FeedLog(
        user_id=user.user_id,
        pet_id=pet_id,
        food_amount_g=body.amount_g,
        feed_type=body.feed_type,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {
        "feed_id": log.feed_id,
        "pet_id": log.pet_id,
        "food_amount_g": log.food_amount_g,
        "feed_type": log.feed_type,
    }


@router.post("/water-log")
def create_water_log(body: WaterLogCreate, authorization: str = Header(None), db: Session = Depends(get_db)):
    user = _current_user(authorization, db)
    pet_id = _resolve_pet_id(user, body.pet_id, db)
    if body.water_type == "auto":
        existing = _find_auto_water_log_this_minute(db, user.user_id, pet_id)
        if existing:
            return {
                "water_log_id": existing.water_log_id,
                "pet_id": existing.pet_id,
                "water_amount_ml": existing.water_amount_ml,
                "water_type": existing.water_type,
            }

    log = WaterLog(
        user_id=user.user_id,
        pet_id=pet_id,
        water_amount_ml=body.amount_ml,
        water_type=body.water_type,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {
        "water_log_id": log.water_log_id,
        "pet_id": log.pet_id,
        "water_amount_ml": log.water_amount_ml,
        "water_type": log.water_type,
    }


@router.post("/stop", response_model=CommandResponse)
def stop_dispenser(request: Request):
    """긴급 정지 — 사료 오거와 물 펌프를 즉시 끈다.

    인증을 걸지 않는다. 사료가 쏟아지는 중에 토큰이 만료됐다는 이유로 못 멈추면 안 된다.
    되돌릴 수 있는 동작이고(다시 배식하면 된다) 잘못 눌러도 피해가 없다.
    중간에 멈춰도 ESP32 가 '실제로 나간 양'을 재서 알리므로 통계는 정확하게 남는다.
    """
    result = _publish_dispenser_command(request, "dispenser/stop", {})
    request.app.state.simulator.update_dispenser_state("stopped")
    request.app.state.mqtt_client.publish(
        "dispenser/weight/request",
        {"request_id": str(uuid4()), "source": "stop"},
    )
    return result


@router.post("/pump/off", response_model=CommandResponse)
def pump_off(request: Request):
    result = _publish_dispenser_command(request, "dispenser/pump/off", {})
    request.app.state.simulator.update_dispenser_state("water_stopped")
    return result


@router.post("/pump/on", response_model=CommandResponse)
def pump_on(request: Request):
    """Start the water pump continuously; it remains on until /pump/off."""
    result = _publish_dispenser_command(request, "dispenser/pump/on", {})
    request.app.state.simulator.update_dispenser_state("water_pump_on")
    return result


@router.post("/pump/speed", response_model=CommandResponse)
def pump_speed(payload: PumpSpeedRequest, request: Request):
    speed = max(0, min(255, int(payload.speed)))
    return _publish_dispenser_command(request, "dispenser/pump/speed", {"amount": speed, "speed": speed})


@router.post("/tare", response_model=CommandResponse)
def tare_loadcells(request: Request):
    return _publish_dispenser_command(request, "dispenser/tare", {})


@router.post("/tare/food", response_model=CommandResponse)
def tare_food_loadcell(request: Request):
    return _publish_dispenser_command(request, "dispenser/tare/food", {})


@router.post("/tare/water", response_model=CommandResponse)
def tare_water_loadcell(request: Request):
    return _publish_dispenser_command(request, "dispenser/tare/water", {})


@router.post("/presence", response_model=CommandResponse)
def configure_presence_gate(payload: PresenceConfigRequest, request: Request):
    request_id = str(uuid4())
    message = {"request_id": request_id, "enabled": payload.enabled}
    mqtt_client = request.app.state.mqtt_client
    mqtt_client.publish("dispenser/presence/config", message, retain=True)
    return {
        "request_id": request_id,
        "status": "accepted",
        "topic": "dispenser/presence/config",
        "payload": message,
        "simulated": mqtt_client.simulation_mode,
    }


@router.post("/weight/request", response_model=CommandResponse)
def request_weight(request: Request):
    return _publish_dispenser_command(request, "dispenser/weight/request", {})


@router.get("/logs")
def list_logs(days: int = 400, authorization: str = Header(None), db: Session = Depends(get_db)):
    """현재 유저의 배식/급수 기록을 서울 시간으로 반환."""
    user = _current_user(authorization, db)
    since = now_kst_naive() - timedelta(days=days)

    feeds = (
        db.query(FeedLog)
        .filter(FeedLog.user_id == user.user_id, FeedLog.created_at >= since)
        .order_by(FeedLog.created_at.asc())
        .all()
    )
    waters = (
        db.query(WaterLog)
        .filter(
            WaterLog.user_id == user.user_id,
            WaterLog.created_at >= since,
            WaterLog.water_type == "consumed",
        )
        .order_by(WaterLog.created_at.asc())
        .all()
    )

    return {
        "feed": [
            {"amount_g": f.food_amount_g, "feed_type": f.feed_type, "created_at": kst_iso(f.created_at)}
            for f in feeds
        ],
        "water": [
            {"amount_ml": w.water_amount_ml, "water_type": w.water_type, "created_at": kst_iso(w.created_at)}
            for w in waters
        ],
    }
