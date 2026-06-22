from datetime import date

from sqlalchemy import Column, Date, Float, ForeignKey, Identity, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from database.base import Base


class DailyActivitySummary(Base):
    __tablename__ = "DAILY_ACTIVITY_SUMMARIES"
    __table_args__ = (
        UniqueConstraint("pet_id", "summary_date", name="uq_daily_activity_pet_date"),
    )

    summary_id = Column(Integer, Identity(start=1), primary_key=True)
    user_id = Column(Integer, ForeignKey("USERS.user_id"), nullable=False)
    pet_id = Column(Integer, ForeignKey("PETS.pet_id"), nullable=False)
    summary_date = Column(Date, nullable=False, default=date.today)
    avg_activity_level = Column(Float, nullable=True)
    status = Column(String(30), nullable=False)
    detected_minutes = Column(Integer, nullable=True)

    user = relationship("User", back_populates="daily_activity_summaries")
    pet = relationship("Pet", back_populates="daily_activity_summaries")
