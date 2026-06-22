from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey, Identity, Date, String
from sqlalchemy.orm import relationship
from database.base import Base
from datetime import datetime

class PetHealthReport(Base):
    __tablename__ = "PET_HEALTH_REPORTS"

    report_id    = Column(Integer, Identity(start=1), primary_key=True)
    user_id      = Column(Integer, ForeignKey("USERS.user_id"), nullable=False)
    pet_id       = Column(Integer, ForeignKey("PETS.pet_id"),   nullable=False)
    period_start = Column(Date, nullable=True)
    period_end   = Column(Date, nullable=True)
    input_summary_json = Column(Text, nullable=True)
    llm_result   = Column(Text,     nullable=True)
    risk_level   = Column(String(20), nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="health_reports")
    pet  = relationship("Pet",  back_populates="health_reports")
