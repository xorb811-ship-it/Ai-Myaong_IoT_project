from sqlalchemy import Column, ForeignKey, Identity, Integer, String, UniqueConstraint

from database.base import Base


class RobotDevice(Base):
    __tablename__ = "ROBOT_DEVICES"

    device_id = Column(Integer, Identity(start=1), primary_key=True)
    robot_serial = Column(String(50), nullable=False, unique=True)
    device_secret = Column(String(255), nullable=False)
    owner_user_id = Column(Integer, ForeignKey("USERS.user_id"), nullable=True)
    is_active = Column(String(1), nullable=False, default="Y")


class RobotDeviceMember(Base):
    __tablename__ = "ROBOT_DEVICE_MEMBERS"
    __table_args__ = (
        UniqueConstraint("device_id", "user_id", name="uq_robot_device_member"),
    )

    member_id = Column(Integer, Identity(start=1), primary_key=True)
    device_id = Column(Integer, ForeignKey("ROBOT_DEVICES.device_id"), nullable=False)
    user_id = Column(Integer, ForeignKey("USERS.user_id"), nullable=False)
    role = Column(String(20), nullable=False)
