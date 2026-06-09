from datetime import datetime

from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Identity
from sqlalchemy.orm import relationship
from database.base import Base

class EmergencyClip(Base):
    __tablename__ = "EMERGENCY_CLIPS"

    clip_id    = Column(Integer, Identity(start=1), primary_key=True)
    alert_id   = Column(Integer, ForeignKey("ALERTS.alert_id"), nullable=False)
    file_path  = Column(String(500), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    alert = relationship("Alert", back_populates="emergency_clips")
