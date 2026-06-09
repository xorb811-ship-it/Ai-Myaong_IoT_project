from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Identity
from sqlalchemy.orm import relationship
from database.base import Base
from datetime import datetime

class DetectionLog(Base):
    __tablename__ = "DETECTION_LOGS"

    log_id         = Column(Integer, Identity(start=1), primary_key=True)
    user_id        = Column(Integer, ForeignKey("USERS.user_id"), nullable=False)
    pet_id         = Column(Integer, ForeignKey("PETS.pet_id"),   nullable=False)
    # species        = Column(String(50),  nullable=True)
    pose           = Column(String(50),  nullable=True)
    activity_level = Column(Float,       nullable=True)
    confidence     = Column(Float,       nullable=True)
    created_at     = Column(DateTime,    default=datetime.utcnow)

    user = relationship("User", back_populates="detection_logs")
    pet  = relationship("Pet",  back_populates="detection_logs")