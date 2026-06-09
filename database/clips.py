from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Identity
from sqlalchemy.orm import relationship
from database.base import Base
from datetime import datetime

class Clip(Base):
    __tablename__ = "CLIPS"

    clip_id    = Column(Integer, Identity(start=1), primary_key=True)
    user_id    = Column(Integer, ForeignKey("USERS.user_id"), nullable=False)
    file_path  = Column(String(500), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="clips")