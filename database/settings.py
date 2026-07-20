from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Identity
from sqlalchemy.orm import relationship
from database.base import Base
from datetime import datetime

class Settings(Base):
    __tablename__ = "SETTINGS"

    setting_id      = Column(Integer, Identity(start=1), primary_key=True)
    user_id         = Column(Integer, ForeignKey("USERS.user_id"), nullable=False)
    away_mode       = Column(String(1),   default="N")
    # wifi 정보는 라즈베리파이(wpa_supplicant)/ESP32 가 보관·자동재연결 → DB 저장 불필요해 제거
    push_enabled    = Column(String(1),   default="Y")
    motion_alert    = Column(String(1),   default="Y")
    stranger_alert  = Column(String(1),   default="Y")
    feed_alert      = Column(String(1),   default="N")
    dark_mode       = Column(String(10),  default="system")
    feed_amount     = Column(Float,       default=25)  # 1회 제공량 기본값 (슬라이더 5~50g)
    water_amount    = Column(Float,       default=25)  # 1회 급수량 기본값 (슬라이더 5~50ml)
    feed_schedule   = Column(String(500), nullable=True)
    water_schedule  = Column(String(500), nullable=True)
    robot_serial    = Column(String(50),  nullable=True)
    mqtt_host       = Column(String(100), nullable=True)
    esp32_setup_url = Column(String(255), nullable=True)
    onboarded       = Column(String(1),   default="N")  # 최초 온보딩 안내 완료 여부 (Y/N)
    updated_at      = Column(DateTime,    default=datetime.utcnow,
                             onupdate=datetime.utcnow)

    user = relationship("User", back_populates="settings")
