from typing import Optional
from pydantic import BaseModel


class SettingsResponse(BaseModel):
    away_mode: str = "N"
    wifi_ssid: Optional[str] = None
    push_enabled: str = "Y"
    motion_alert: str = "Y"
    stranger_alert: str = "Y"
    feed_alert: str = "N"
    dark_mode: str = "system"
    feed_amount: Optional[float] = None
    water_amount: Optional[float] = None
    feed_schedule: Optional[str] = None
    water_schedule: Optional[str] = None
    robot_serial: Optional[str] = None
    mqtt_host: Optional[str] = None
    esp32_setup_url: Optional[str] = None

    class Config:
        from_attributes = True


class SettingsUpdate(BaseModel):
    away_mode: Optional[str] = None
    wifi_ssid: Optional[str] = None
    wifi_password: Optional[str] = None
    push_enabled: Optional[str] = None
    motion_alert: Optional[str] = None
    stranger_alert: Optional[str] = None
    feed_alert: Optional[str] = None
    dark_mode: Optional[str] = None
    feed_amount: Optional[float] = None
    water_amount: Optional[float] = None
    feed_schedule: Optional[str] = None
    water_schedule: Optional[str] = None
    robot_serial: Optional[str] = None
    mqtt_host: Optional[str] = None
    esp32_setup_url: Optional[str] = None
