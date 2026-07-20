from pydantic import BaseModel, field_validator


class RobotDeviceClaimRequest(BaseModel):
    robot_serial: str

    @field_validator("robot_serial")
    @classmethod
    def normalize_robot_serial(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("Robot serial is required.")
        return normalized


class RobotDeviceGrantMemberRequest(RobotDeviceClaimRequest):
    user_email: str

    @field_validator("user_email")
    @classmethod
    def normalize_user_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("User email is required.")
        return normalized


class RobotDeviceResponse(BaseModel):
    device_id: int
    robot_serial: str
    role: str
    is_active: str


class RobotDeviceListResponse(BaseModel):
    devices: list[RobotDeviceResponse]


class RobotDeviceMemberResponse(BaseModel):
    user_id: int
    email: str
    nickname: str | None = None
    role: str


class RobotDeviceMembersResponse(BaseModel):
    members: list[RobotDeviceMemberResponse]
