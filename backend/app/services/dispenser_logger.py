"""디스펜서 로드셀 실측값을 통계 테이블(FEED_LOGS / WATER_LOGS)에 쌓는다.

여기서 기록하는 값은 전부 '실제로 잰 무게'다. 지시한 값이 아니다.

- 배식량: ESP32 가 오거 정지 후 저울이 잠잠해진 시점에 직접 재서 dispenser/dispensed 로
  알려준다. 언제 잠잠해지는지는 그 기기만 알기 때문에 여기서 시간을 추측하지 않는다.
- 음수량: 물통이 저수조 겸 음수대라 펌프를 돌려도 물이 통에서 줄지 않는다(순환).
  물이 실제로 줄어드는 건 고양이가 마셨을 때뿐이라, 물통 무게가 떨어진 만큼을 음수량으로
  쌓는다. 사람이 물을 채우면 무게가 오르는데, 그건 소비가 아니므로 기준선만 올린다.

프론트가 아니라 백엔드에서 기록하는 이유: 자동 배식은 브라우저가 안 켜져 있어도 돌아간다.
"""
import threading

from app.runtime_config import runtime_env
from database.feed_logs import FeedLog
from database.pets import Pet
from database.water_logs import WaterLog


class DispenserLogger:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._water_baseline_ml: float | None = None
        self._owner_pet_id: int | None = None

    def remember_owner(self, pet_id: int) -> None:
        """디스펜서를 조작한 사용자의 펫 = 이 기기의 주인.

        기기↔사용자 매핑 테이블이 없어서, 실제로 이 디스펜서에 명령을 보낸 사람이
        누구인지가 가장 확실한 단서다. 배식을 누른 사람이 곧 그 사료의 주인이고,
        같은 기기의 물을 마시는 것도 그 집 고양이다.
        """
        with self._lock:
            self._owner_pet_id = pet_id

    def on_food_dispensed(self, grams: float | None) -> bool:
        """ESP32 가 잰 1회 배출량을 FEED_LOGS 에 남긴다."""
        if grams is None or grams <= 0:
            return False  # 0g 은 통이 비었거나 오거가 헛돈 것 — 통계에 남길 게 없다
        return self._write(FeedLog, food_amount_g=round(float(grams), 1), feed_type="auto")

    def on_water_weight(self, water_ml: float | None) -> bool:
        """물통 무게 변화를 보고, 줄어든 만큼을 음수량으로 WATER_LOGS 에 남긴다."""
        if water_ml is None:
            return False

        min_drop = float(runtime_env("WATER_CONSUMPTION_MIN_ML", "5"))
        with self._lock:
            if self._water_baseline_ml is None:
                self._water_baseline_ml = water_ml
                return False

            drop = self._water_baseline_ml - water_ml
            if drop < 0:
                # 물을 채웠다 → 기준선을 새 수위로 올리고 끝. 소비가 아니다.
                self._water_baseline_ml = water_ml
                return False
            if drop < min_drop:
                # 아직 잔노이즈 수준. 기준선을 유지해 조금씩 마신 것도 누적되게 둔다.
                return False
            self._water_baseline_ml = water_ml

        return self._write(WaterLog, water_amount_ml=round(drop, 1), water_type="consumed")

    def _write(self, model, **fields) -> bool:
        from database.base import SessionLocal

        if SessionLocal is None:
            return False

        db = SessionLocal()
        try:
            pet = self._resolve_pet(db)
            if pet is None:
                return False
            db.add(model(user_id=pet.user_id, pet_id=pet.pet_id, **fields))
            db.commit()
            return True
        except Exception as error:
            db.rollback()
            print(f"[dispenser:log] write failed: {error}", flush=True)
            return False
        finally:
            db.close()

    def _resolve_pet(self, db):
        """어느 펫의 기록인지. 확실한 단서부터 차례로 본다."""
        # 1. 이 디스펜서에 실제로 명령을 보낸 사용자의 펫. 가장 확실하다.
        with self._lock:
            owner_pet_id = self._owner_pet_id
        if owner_pet_id:
            pet = db.query(Pet).filter(Pet.pet_id == owner_pet_id).first()
            if pet:
                return pet

        # 2. 명시 지정(선택). 기기를 한 번도 안 만진 상태에서 물만 줄어드는 경우 대비.
        configured = runtime_env("DISPENSER_PET_ID", "").strip()
        if configured:
            pet = db.query(Pet).filter(Pet.pet_id == int(configured)).first()
            if pet:
                return pet
            print(f"[dispenser:log] DISPENSER_PET_ID={configured} not found; falling back", flush=True)

        # 3. 첫 펫 — 후방 장애물 알림(robot.py)과 같은 최후 규칙.
        return db.query(Pet).order_by(Pet.pet_id.asc()).first()
