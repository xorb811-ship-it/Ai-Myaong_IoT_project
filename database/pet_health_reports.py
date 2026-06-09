from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey, Identity
from sqlalchemy.orm import relationship
from database.base import Base
from datetime import datetime

class PetHealthReport(Base):
    __tablename__ = "PET_HEALTH_REPORTS"

    report_id    = Column(Integer, Identity(start=1), primary_key=True)
    user_id      = Column(Integer, ForeignKey("USERS.user_id"), nullable=False)
    pet_id       = Column(Integer, ForeignKey("PETS.pet_id"),   nullable=False)
    llm_result   = Column(Text,     nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="health_reports")
    pet  = relationship("Pet",  back_populates="health_reports")