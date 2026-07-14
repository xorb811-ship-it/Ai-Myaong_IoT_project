from typing import Any, Literal
from pydantic import BaseModel, Field


MoveCommand = Literal["FORWARD", "BACKWARD", "LEFT", "RIGHT", "STOP"]
CameraCommand = Literal["CAM_UP", "CAM_DOWN", "CAM_LEFT", "CAM_RIGHT", "CAM_CENTER"]


class MoveRequest(BaseModel):
    command: MoveCommand


class CameraRequest(BaseModel):
    direction: CameraCommand


class SensorUpdateRequest(BaseModel):
    source: str = "arduino-rear-ultrasonic"
    distance_cm: int | None = Field(default=None, ge=0, le=500)
    rear_obstacle: bool = False
    threshold_cm: int = Field(default=15, ge=1, le=500)
    device_id: str | None = None


class AwayModeRequest(BaseModel):
    on: bool


class FeedRequest(BaseModel):
    amount: int = Field(default=1, ge=1, le=300)


class WaterRequest(BaseModel):
    amount: int = Field(default=1, ge=1, le=300)


class SharedWifiRequest(BaseModel):
    ssid: str = Field(min_length=1)
    password: str = ""
    pi_ap_fallback: bool = False


class CommandResponse(BaseModel):
    request_id: str
    status: str
    topic: str
    payload: dict[str, Any]
    simulated: bool = True


class RobotStatus(BaseModel):
    connected: bool
    battery: int
    mode: str
    away_mode: bool = False
    last_command: str | None = None
    position: dict[str, int]
    camera: dict[str, int]
    dispenser: dict[str, int | bool]
    sensor: dict[str, Any]
    updated_at: str
