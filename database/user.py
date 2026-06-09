from datetime import datetime

from sqlalchemy import Column, DateTime, Identity, Integer, String
from sqlalchemy.orm import relationship

from database.base import Base


class User(Base):
    __tablename__ = "USERS"

    user_id = Column(Integer, Identity(start=1), primary_key=True)
    email = Column(String(100), nullable=False, unique=True)
    nickname = Column(String(50), nullable=True)
    profile_photo_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    credential = relationship("UserCredential", back_populates="user", uselist=False)
    oauth_connections = relationship("UserOAuthConnection", back_populates="user")
    pets = relationship("Pet", back_populates="user")
    alerts = relationship("Alert", back_populates="user")
    clips = relationship("Clip", back_populates="user")
    settings = relationship("Settings", back_populates="user")
    detection_logs = relationship("DetectionLog", back_populates="user")
    feed_logs = relationship("FeedLog", back_populates="user")
    water_logs = relationship("WaterLog", back_populates="user")
    health_reports = relationship("PetHealthReport", back_populates="user")
