from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Identity
from sqlalchemy.orm import relationship
from database.base import Base
from datetime import datetime


class WaterLog(Base):
    __tablename__ = "WATER_LOGS"

    water_log_id = Column(Integer, Identity(start=1), primary_key=True)

    user_id = Column(Integer, ForeignKey("USERS.user_id"), nullable=False)
    pet_id = Column(Integer, ForeignKey("PETS.pet_id"), nullable=False)

    water_amount_ml = Column(Float, nullable=False)

    water_type = Column(String(20), nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="water_logs")
    pet = relationship("Pet", back_populates="water_logs")