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
        # 잔여량은 로드셀 실측값(food_g / water_ml)만 쓴다. 가짜 기본값을 두면 센서가
        # 없을 때 그 숫자가 그대로 화면에 나와 거짓말이 된다.
        self.dispenser: dict[str, Any] = {"last_feed_amount": 0}
        self.sensor = {"distance": 30, "motion": False}
        self.sensor_updated_at = 0.0  # 후방 센서값 마지막 수신 시각(monotonic) — staleness 판정용
        # 후방 초음파 노이즈(스파이크) 제거용 중앙값 필터 상태
        self._rear_window: list[int] = []                       # 최근 거리값 버퍼
        self._rear_window_size = max(1, int((os.getenv("REAR_FILTER_WINDOW") or "5").strip() or "5"))
        self._rear_obstacle = False                             # 필터값 기반 장애물 상태(히스테리시스) — UI 표시용
        self._rear_obstacle_immediate = False                   # 생(raw)값 기반 즉시 위험 — 안전 차단용(필터 우회)
        # 디스펜서 로드셀(사료/물). 물은 1g = 1ml 이라 그램값을 그대로 ml로 쓴다.
        # 채널을 따로 추적한다 — 한쪽 로드셀만 붙어 있거나 한쪽만 고장 나는 경우가 정상이라,
        # 안 붙은 채널을 '0' 으로 표시하면 가득 찬 통을 비었다고 거짓말하게 된다.
        self._food_weight_updated_at = 0.0                      # 마지막 수신 시각(monotonic)
        self._water_weight_updated_at = 0.0
        self._food_window: list[float] = []                     # 로드셀도 초음파처럼 튀므로 중앙값 필터
        self._water_window: list[float] = []
        self._weight_window_size = max(1, int(os.getenv("WEIGHT_FILTER_WINDOW", "5")))
        # 게이지 100% 의 기준. 여기만 쓰인다 — 표시 숫자(g/ml)와 여유/보충 판정은
        # 실측 무게 그대로라 이 값과 무관하다.
        # 물통 자체는 300ml 보다 크지만 운용상 그 이상 채우지 않아 300 을 기준으로 잡는다.
        self._food_capacity_g = max(1.0, float(os.getenv("DISPENSER_FOOD_CAPACITY_G", "300")))
        self._water_capacity_ml = max(1.0, float(os.getenv("DISPENSER_WATER_CAPACITY_ML", "300")))
        self._weight_stale_sec = float(os.getenv("DISPENSER_WEIGHT_STALE_SEC", "10"))
        # 디스펜서 구동 상태 — ESP32 가 dispenser/status 로 알려준다. 앱의 '정지' 버튼은
        # 이 값으로만 뜬다. 프론트가 시간을 추측하지 않도록(펌웨어 상수 복제) 기기가 직접 알린다.
        self._dispenser_state: str | None = None
        self._dispenser_state_at = 0.0
        # 오거 최대 8초, 펌프 최대 10초. 그보다 오래 '구동 중'이면 기기가 죽었거나 상태를
        # 놓친 것이라 idle 로 본다 — 정지 버튼이 영영 안 사라지는 것보다 낫다.
        self._feed_busy_max_sec = float(os.getenv("DISPENSER_FEED_BUSY_MAX_SEC", "13"))
        self._water_busy_max_sec = float(os.getenv("DISPENSER_WATER_BUSY_MAX_SEC", "95"))

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
        # 잔여량은 깎지 않는다 — 로드셀이 실제로 줄어든 무게를 알려준다.
        self.sensor["motion"] = True
        self._drain_battery()
        return self.status()

    def water(self, seconds: int) -> dict[str, Any]:
        self.last_command = "DISPENSER_WATER"
        self.dispenser["last_water_seconds"] = seconds
        # 잔여량은 깎지 않는다 — 순환 구조라 펌프를 돌려도 물이 통에서 줄지 않고,
        # 실제로 줄어드는 건 고양이가 마셨을 때다. 그건 로드셀이 알려준다.
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
            "dispenser": self._dispenser_view(),
            "sensor": self.sensor,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    def _dispenser_view(self) -> dict[str, Any]:
        # 무게는 '지금 살아있는 값'일 때만 잔여량으로 쓸 수 있다. 끊긴 옛 값을 그대로
        # 보여주면 하드코딩과 다를 게 없으므로, 오래됐으면 *_fresh=False 로 내려
        # UI가 '값 없음'을 표시하게 한다.
        view = dict(self.dispenser)
        now = time.monotonic()
        view["food_fresh"] = (
            self._food_weight_updated_at > 0
            and now - self._food_weight_updated_at <= self._weight_stale_sec
        )
        view["water_fresh"] = (
            self._water_weight_updated_at > 0
            and now - self._water_weight_updated_at <= self._weight_stale_sec
        )
        # 지금 사료/물이 나오는 중인지. 앱의 '정지' 버튼이 이 값으로 뜨고 진다.
        view["busy"] = self._dispenser_busy()
        view["state"] = self._dispenser_state
        return view

    # ESP32 가 구동 중일 때 알리는 상태값. 그 외(online/tare_done/...)는 구동과 무관하다.
    _BUSY_STATES = {"feed_running", "water_running", "water_pump_on"}

    def update_dispenser_state(self, state: str | None) -> dict[str, Any]:
        """ESP32 의 dispenser/status 를 반영한다."""
        if not state:
            return self.status()
        self._dispenser_state = state
        self._dispenser_state_at = time.monotonic()
        return self.status()

    def _dispenser_busy(self) -> bool:
        if self._dispenser_state == "water_pump_on":
            # Manual pump ON is continuous and must remain active until an OFF status arrives.
            return True
        if self._dispenser_state not in self._BUSY_STATES:
            return False
        # 구동 상태가 너무 오래 붙어 있으면 종료 신호를 놓친 것으로 본다.
        max_sec = self._water_busy_max_sec if self._dispenser_state == "water_running" else self._feed_busy_max_sec
        return time.monotonic() - self._dispenser_state_at <= max_sec

    def update_dispenser_weight(
        self,
        *,
        food_g: float | None = None,
        water_g: float | None = None,
        source: str | None = None,
    ) -> dict[str, Any]:
        now = time.monotonic()
        # 끊겼다 다시 들어오면 옛 버퍼는 버리고 새로 시작 (후방 센서와 같은 규칙)
        if food_g is not None:
            if self._food_weight_updated_at and now - self._food_weight_updated_at > 5.0:
                self._food_window.clear()
            grams = self._filtered_weight(self._food_window, food_g)
            self.dispenser["food_g"] = round(grams, 1)
            self.dispenser["food_percent"] = self._weight_percent(grams, self._food_capacity_g)
            self._food_weight_updated_at = now
        if water_g is not None:
            # 물은 밀도가 1이라 1g = 1ml. 별도 유량계 없이 그램값을 그대로 ml로 쓴다.
            if self._water_weight_updated_at and now - self._water_weight_updated_at > 5.0:
                self._water_window.clear()
            grams = self._filtered_weight(self._water_window, water_g)
            self.dispenser["water_ml"] = round(grams, 1)
            self.dispenser["water_percent"] = self._weight_percent(grams, self._water_capacity_ml)
            self._water_weight_updated_at = now
        if source and (food_g is not None or water_g is not None):
            self.dispenser["weight_source"] = source
        return self.status()

    def _filtered_weight(self, window: list[float], value: float) -> float:
        window.append(float(value))
        if len(window) > self._weight_window_size:
            window.pop(0)
        median = sorted(window)[len(window) // 2]
        # 로드셀은 tare 드리프트로 음수가 나올 수 있다. '남은 양'에 음수는 뜻이 없어 0으로 깎는다.
        return max(0.0, median)

    @staticmethod
    def _weight_percent(grams: float, capacity: float) -> int:
        return max(0, min(100, round(grams / capacity * 100)))

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
