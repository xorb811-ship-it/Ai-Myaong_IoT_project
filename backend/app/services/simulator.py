import os
import time
from datetime import datetime, timezone
from typing import Any


class DeviceSimulator:
    def __init__(self) -> None:
        self.connected = True
        self.battery = 85
        self.mode = "simulation"
        self.away_mode = False
        self.last_command: str | None = None
        self.position = {"x": 0, "y": 0, "heading": 0}
        self.camera = {"pan": 90, "tilt": 90}
        self.dispenser = {"food_remaining": 75, "water_remaining": 60, "last_feed_amount": 0}
        self.sensor = {"distance": 30, "motion": False}
        self.sensor_updated_at = 0.0  # 후방 센서값 마지막 수신 시각(monotonic) — staleness 판정용
        # 후방 초음파 노이즈(스파이크) 제거용 중앙값 필터 상태
        self._rear_window: list[int] = []                       # 최근 거리값 버퍼
        self._rear_window_size = max(1, int((os.getenv("REAR_FILTER_WINDOW") or "5").strip() or "5"))
        self._rear_obstacle = False                             # 필터값 기반 장애물 상태(히스테리시스) — UI 표시용
        self._rear_obstacle_immediate = False                   # 생(raw)값 기반 즉시 위험 — 안전 차단용(필터 우회)

    def move(self, command: str) -> dict[str, Any]:
        self.last_command = command
        if command == "FORWARD":
            self._step(1)
        elif command == "BACKWARD":
            self._step(-1)
        elif command == "LEFT":
            self.position["heading"] = (self.position["heading"] - 90) % 360
        elif command == "RIGHT":
            self.position["heading"] = (self.position["heading"] + 90) % 360
        self._drain_battery()
        return self.status()

    def control_camera(self, direction: str) -> dict[str, Any]:
        self.last_command = direction
        step = 10
        if direction == "CAM_UP":
            self.camera["tilt"] = min(180, self.camera["tilt"] + step)
        elif direction == "CAM_DOWN":
            self.camera["tilt"] = max(0, self.camera["tilt"] - step)
        elif direction == "CAM_LEFT":
            self.camera["pan"] = max(0, self.camera["pan"] - step)
        elif direction == "CAM_RIGHT":
            self.camera["pan"] = min(180, self.camera["pan"] + step)
        elif direction == "CAM_CENTER":
            self.camera = {"pan": 90, "tilt": 90}
        self._drain_battery()
        return self.status()

    def set_away_mode(self, on: bool) -> dict[str, Any]:
        self.away_mode = on
        self.last_command = "AWAY_ON" if on else "AWAY_OFF"
        self._drain_battery()
        return self.status()

    def capture(self) -> dict[str, Any]:
        self.last_command = "CAPTURE"
        self._drain_battery()
        return self.status()

    def feed(self, amount: int) -> dict[str, Any]:
        self.last_command = "DISPENSER_FEED"
        self.dispenser["last_feed_amount"] = amount
        self.dispenser["food_remaining"] = max(0, self.dispenser["food_remaining"] - amount)
        self.sensor["motion"] = True
        self._drain_battery()
        return self.status()

    def water(self, amount: int) -> dict[str, Any]:
        self.last_command = "DISPENSER_WATER"
        self.dispenser["water_remaining"] = max(0, self.dispenser["water_remaining"] - amount)
        self.sensor["motion"] = True
        self._drain_battery()
        return self.status()

    def status(self) -> dict[str, Any]:
        return {
            "connected": self.connected,
            "battery": self.battery,
            "mode": self.mode,
            "away_mode": self.away_mode,
            "last_command": self.last_command,
            "position": self.position,
            "camera": self.camera,
            "dispenser": self.dispenser,
            "sensor": self.sensor,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    def update_sensor(
        self,
        *,
        distance_cm: int | None = None,
        rear_obstacle: bool | None = None,
        threshold_cm: int | None = None,
        source: str | None = None,
    ) -> dict[str, Any]:
        now = time.monotonic()
        if threshold_cm is not None:
            self.sensor["rear_obstacle_threshold_cm"] = threshold_cm
        thr = self.sensor.get("rear_obstacle_threshold_cm", 15)

        if distance_cm is not None:
            # 끊겼다 다시 들어오면(>3초 공백) 옛 버퍼는 버리고 새로 시작
            if self.sensor_updated_at and now - self.sensor_updated_at > 3.0:
                self._rear_window.clear()

            # 중앙값 필터: 최근 N개 중 가운데 값 → 가끔 튀는 스파이크(40↔18) 자동 제거
            self._rear_window.append(int(distance_cm))
            if len(self._rear_window) > self._rear_window_size:
                self._rear_window.pop(0)
            filtered = sorted(self._rear_window)[len(self._rear_window) // 2]

            self.sensor["distance"] = filtered
            self.sensor["rear_distance_cm"] = filtered
            self.sensor["rear_distance_raw_cm"] = int(distance_cm)  # 원본(디버깅용)

            # (UI 표시용) 장애물 판정은 '필터값' 기준 재계산 — 노이즈로 경고가 깜빡이지 않게.
            if filtered <= thr:
                self._rear_obstacle = True
            elif filtered >= thr + 5:
                self._rear_obstacle = False
            self.sensor["rear_obstacle"] = self._rear_obstacle

            # (안전 차단용) 즉시 위험은 '생값' 기준 — 첫 근접 reading에 바로 ON, thr+5 이상에서만 OFF.
            # 필터를 우회해 후진 차단을 가장 빠르게 건다(충돌 방지 우선).
            if int(distance_cm) <= thr or rear_obstacle:
                self._rear_obstacle_immediate = True
            elif int(distance_cm) >= thr + 5:
                self._rear_obstacle_immediate = False
            self.sensor["rear_obstacle_immediate"] = self._rear_obstacle_immediate
        elif rear_obstacle is not None:
            # 거리 없이 플래그만 온 경우(예외적)는 그대로 반영
            self._rear_obstacle = rear_obstacle
            self._rear_obstacle_immediate = rear_obstacle
            self.sensor["rear_obstacle"] = rear_obstacle
            self.sensor["rear_obstacle_immediate"] = rear_obstacle

        if source:
            self.sensor["source"] = source
        # 거리값이 실제로 들어온 경우에만 '수신 시각' 갱신 (라이브 여부 판정 근거)
        if distance_cm is not None or rear_obstacle is not None:
            self.sensor_updated_at = now
        return self.status()

    def _drain_battery(self) -> None:
        self.battery = max(0, self.battery - 1)

    def _step(self, direction: int) -> None:
        heading = self.position["heading"] % 360
        if heading == 0:
            self.position["y"] += direction
        elif heading == 90:
            self.position["x"] += direction
        elif heading == 180:
            self.position["y"] -= direction
        elif heading == 270:
            self.position["x"] -= direction
        else:
            self.position["y"] += direction
