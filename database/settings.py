from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Identity
from sqlalchemy.orm import relationship
from database.base import Base
from datetime import datetime

class Settings(Base):
    __tablename__ = "SETTINGS"

    setting_id      = Column(Integer, Identity(start=1), primary_key=True)
    user_id         = Column(Integer, ForeignKey("USERS.user_id"), nullable=False)
    away_mode       = Column(String(1),   default="N")
    wifi_ssid       = Column(String(100), nullable=True)
    wifi_password   = Column(String(255), nullable=True)
    push_enabled    = Column(String(1),   default="Y")
    motion_alert    = Column(String(1),   default="Y")
    stranger_alert  = Column(String(1),   default="Y")
    feed_alert      = Column(String(1),   default="N")
    dark_mode       = Column(String(10),  default="system")
    feed_amount     = Column(Float,       nullable=True)
    water_amount    = Column(Float,       nullable=True)
    feed_schedule   = Column(String(500), nullable=True)
    water_schedule  = Column(String(500), nullable=True)
    robot_serial    = Column(String(50),  nullable=True)
    mqtt_host       = Column(String(100), nullable=True)
    esp32_setup_url = Column(String(255), nullable=True)
    updated_at      = Column(DateTime,    default=datetime.utcnow,
                             onupdate=datetime.utcnow)

    user = relationship("User", back_populates="settings")
