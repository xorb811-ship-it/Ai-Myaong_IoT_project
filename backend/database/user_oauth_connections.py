from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Identity, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from database.base import Base


class UserOAuthConnection(Base):
    __tablename__ = "USER_OAUTH_CONNECTIONS"
    __table_args__ = (
        UniqueConstraint("provider_id", "provider_user_id", name="uq_oauth_provider_user"),
        UniqueConstraint("user_id", "provider_id", name="uq_user_oauth_provider"),
    )

    connection_id = Column(Integer, Identity(start=1), primary_key=True)
    user_id = Column(Integer, ForeignKey("USERS.user_id"), nullable=False)
    provider_id = Column(Integer, ForeignKey("OAUTH2_PROVIDERS.provider_id"), nullable=False)
    provider_user_id = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="oauth_connections")
    provider = relationship("OAuth2Provider", back_populates="connections")
