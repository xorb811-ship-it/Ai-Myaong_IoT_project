from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Identity, Integer, String
from sqlalchemy.orm import relationship

from database.base import Base


class UserCredential(Base):
    __tablename__ = "USER_CREDENTIALS"

    credential_id = Column(Integer, Identity(start=1), primary_key=True)
    user_id = Column(Integer, ForeignKey("USERS.user_id"), nullable=False, unique=True)
    username = Column(String(50), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="credential")
