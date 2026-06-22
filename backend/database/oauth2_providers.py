from sqlalchemy import Column, Identity, Integer, String
from sqlalchemy.orm import relationship

from database.base import Base


class OAuth2Provider(Base):
    __tablename__ = "OAUTH2_PROVIDERS"

    provider_id = Column(Integer, Identity(start=1), primary_key=True)
    provider_name = Column(String(50), nullable=False, unique=True)

    connections = relationship("UserOAuthConnection", back_populates="provider")
