import database.alerts
import database.clips
import database.detection_logs
import database.emergency_clips
import database.feed_logs
import database.pet_health_reports
import database.oauth2_providers
import database.user_credentials
import database.user_oauth_connections
import database.water_logs
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.models.settings import SettingsResponse, SettingsUpdate
from database.base import get_db
from database.user import User
from database.settings import Settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


def get_current_user_id(authorization: str = Header(None)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증 토큰이 없습니다.")
    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
    return int(payload["sub"])


@router.get("", response_model=SettingsResponse)
def get_settings(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    settings = db.query(Settings).filter(Settings.user_id == user_id).first()
    if not settings:
        settings = Settings(user_id=user_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.put("", response_model=SettingsResponse)
def update_settings(
    body: SettingsUpdate,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    settings = db.query(Settings).filter(Settings.user_id == user_id).first()
    if not settings:
        settings = Settings(user_id=user_id)
        db.add(settings)
        db.flush()

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(settings, field, value)

    db.commit()
    db.refresh(settings)
    return settings
