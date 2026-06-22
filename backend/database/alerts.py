from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Identity
from sqlalchemy.orm import relationship
from database.base import Base
from datetime import datetime

class Alert(Base):
    __tablename__ = "ALERTS"

    alert_id     = Column(Integer, Identity(start=1), primary_key=True)
    user_id      = Column(Integer, ForeignKey("USERS.user_id"), nullable=False)
    pet_id       = Column(Integer, ForeignKey("PETS.pet_id"),   nullable=False)
    alert_type   = Column(String(50),  nullable=False)
    message      = Column(String(2000), nullable=True)
    is_confirmed = Column(String(1),   default="N")
    created_at   = Column(DateTime,    default=datetime.utcnow)

    user = relationship("User", back_populates="alerts")
    pet  = relationship("Pet",  back_populates="alerts")
    emergency_clips = relationship("EmergencyClip", back_populates="alert")
