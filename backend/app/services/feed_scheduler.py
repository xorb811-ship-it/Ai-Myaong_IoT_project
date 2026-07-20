"""Automatic feed/water scheduler.

Reads settings.feed_schedule and settings.water_schedule every minute.
When a schedule item matches the current KST HH:MM and is enabled, it sends
the dispenser command and stores one auto log in FEED_LOGS / WATER_LOGS.
"""

import json
import socket
import threading
import time
from datetime import timedelta

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

import database.alerts  # noqa: F401
import database.clips  # noqa: F401
import database.detection_logs  # noqa: F401
import database.emergency_clips  # noqa: F401
import database.oauth2_providers  # noqa: F401
import database.pet_health_reports  # noqa: F401
import database.user  # noqa: F401
import database.user_credentials  # noqa: F401
import database.user_oauth_connections  # noqa: F401
from database.base import SessionLocal
from database.feed_logs import FeedLog
from database.pets import Pet
from database.settings import Settings
from database.time_utils import now_kst_naive
from database.water_logs import WaterLog

_scheduler_lock = threading.Lock()
_scheduler_thread = None
_lock_socket = None
_SCHED_LOCK_PORT = 8771
WATER_SCHEDULE_MIN_SECONDS = 30
WATER_SCHEDULE_MAX_SECONDS = 90


def _parse(raw):
    try:
        arr = json.loads(raw or "[]")
        return arr if isinstance(arr, list) else []
    except Exception:
        return []


def _first_pet_id(db, user_id):
    pet = db.query(Pet).filter(Pet.user_id == user_id).first()
    return pet.pet_id if pet else None


def _minute_window(now=None):
    start = (now or now_kst_naive()).replace(second=0, microsecond=0)
    return start, start + timedelta(minutes=1)


def _normalize_amount(value):
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    return float(int(amount)) if amount.is_integer() else amount


def _normalize_water_seconds(value):
    amount = int(round(_normalize_amount(value)))
    if amount <= 0:
        return 0
    return max(WATER_SCHEDULE_MIN_SECONDS, min(WATER_SCHEDULE_MAX_SECONDS, amount))


def _has_feed_log_this_minute(db, user_id, pet_id, minute_start, minute_end):
    return (
        db.query(FeedLog.feed_id)
        .filter(
            FeedLog.user_id == user_id,
            FeedLog.pet_id == pet_id,
            FeedLog.feed_type == "auto",
            FeedLog.created_at >= minute_start,
            FeedLog.created_at < minute_end,
        )
        .first()
        is not None
    )


def _has_water_log_this_minute(db, user_id, pet_id, minute_start, minute_end):
    return (
        db.query(WaterLog.water_log_id)
        .filter(
            WaterLog.user_id == user_id,
            WaterLog.pet_id == pet_id,
            WaterLog.water_type == "auto",
            WaterLog.created_at >= minute_start,
            WaterLog.created_at < minute_end,
        )
        .first()
        is not None
    )


def _acquire_singleton_lock() -> bool:
    """Allow only one scheduler process on the same PC."""
    global _lock_socket
    if _lock_socket is not None:
        return True

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("127.0.0.1", _SCHED_LOCK_PORT))
        sock.listen(1)
        _lock_socket = sock
        return True
    except OSError:
        sock.close()
        return False


def _iter_unique_settings(db):
    seen_user_ids = set()
    settings_rows = db.query(Settings).order_by(Settings.user_id.asc(), Settings.setting_id.desc()).all()
    for row in settings_rows:
        if row.user_id in seen_user_ids:
            continue
        seen_user_ids.add(row.user_id)
        yield row


def _lock_log_tables(db):
    # Serialize scheduler writes across backend instances sharing the Oracle DB.
    db.execute(text("LOCK TABLE FEED_LOGS, WATER_LOGS IN EXCLUSIVE MODE"))


def _run_once(feed_service, hhmm):
    if SessionLocal is None:
        return

    db = SessionLocal()
    try:
        minute_start, minute_end = _minute_window()
        handled_feed = set()
        handled_water = set()
        _lock_log_tables(db)

        for settings in _iter_unique_settings(db):
            pet_id = None

            for item in _parse(settings.feed_schedule):
                if item.get("on", True) is False or str(item.get("time")) != hhmm:
                    continue

                amount = _normalize_amount(item.get("amount"))
                if amount <= 0:
                    continue

                if pet_id is None:
                    pet_id = _first_pet_id(db, settings.user_id)
                if not pet_id:
                    continue

                feed_key = (settings.user_id, pet_id, minute_start)
                if feed_key in handled_feed:
                    continue
                if _has_feed_log_this_minute(db, settings.user_id, pet_id, minute_start, minute_end):
                    continue

                handled_feed.add(feed_key)
                # 이 행은 '그 분에 이미 배식했다'는 중복 방지 기록이다(_has_feed_log_this_minute).
                # 실제 배식량은 ESP32 가 오거 정지 후 저울로 재서 dispenser/dispensed 로 알리고,
                # DispenserLogger 가 그 실측값을 FEED_LOGS 에 따로 쌓는다. 여기서 지시값(amount)을
                # 같이 적으면 배식 1회에 행이 2개 생겨 통계가 2배로 뜬다.
                # 지시값은 어차피 허구다 — 펌웨어는 amount×250ms 로 오거를 돌릴 뿐이라
                # 25g 을 지시해도 실제로 몇 g 이 나갔는지는 저울만 안다.
                db.add(
                    FeedLog(
                        user_id=settings.user_id,
                        pet_id=pet_id,
                        food_amount_g=0,
                        feed_type="auto",
                        created_at=minute_start,
                    )
                )
                db.flush()
                if feed_service:
                    try:
                        feed_service.feed(int(round(amount)))
                    except Exception:
                        pass

            for item in _parse(settings.water_schedule):
                if item.get("on", True) is False or str(item.get("time")) != hhmm:
                    continue

                amount = _normalize_water_seconds(item.get("amount"))
                if amount <= 0:
                    continue

                if pet_id is None:
                    pet_id = _first_pet_id(db, settings.user_id)
                if not pet_id:
                    continue

                water_key = (settings.user_id, pet_id, minute_start)
                if water_key in handled_water:
                    continue
                if _has_water_log_this_minute(db, settings.user_id, pet_id, minute_start, minute_end):
                    continue

                handled_water.add(water_key)
                # 스케줄의 amount 는 '펌프를 몇 초 돌릴지'다(ml 이 아니다). 물통이 저수조 겸
                # 음수대라 펌프를 돌려도 물이 통 밖으로 나가지 않아 급수량 ml 이 성립하지 않는다.
                # 그래서 이 행은 '그 분에 이미 급수했다'는 중복 방지 기록으로만 쓰고,
                # 양은 0 으로 둔다 — 초를 ml 칸에 적으면 통계·최근활동이 "물 10ml" 라고 거짓말한다.
                # 실제로 마신 양은 물통 무게가 줄어든 만큼을 water_type='consumed' 로 따로 쌓는다.
                db.add(
                    WaterLog(
                        user_id=settings.user_id,
                        pet_id=pet_id,
                        water_amount_ml=0,
                        water_type="auto_pending",
                        created_at=minute_start,
                    )
                )
                db.flush()
                if feed_service:
                    try:
                        result = feed_service.water(
                            amount,
                            source="auto",
                            user_id=settings.user_id,
                            pet_id=pet_id,
                        )
                        print(
                            f"[FeedScheduler] scheduled water sent "
                            f"user={settings.user_id} pet={pet_id} "
                            f"amount={amount} request={result.get('request_id')}",
                            flush=True,
                        )
                    except Exception as error:
                        print(f"[FeedScheduler] scheduled water send failed: {error}", flush=True)

        db.commit()
    except IntegrityError:
        db.rollback()
    except Exception as error:
        db.rollback()
        print(f"[FeedScheduler] run failed at {hhmm}: {error}", flush=True)
    finally:
        db.close()


def start_feed_scheduler(feed_service=None):
    """Start one background scheduler thread per process and one per local PC."""
    global _scheduler_thread

    with _scheduler_lock:
        if _scheduler_thread is not None and _scheduler_thread.is_alive():
            return _scheduler_thread
        if not _acquire_singleton_lock():
            return None

        def loop():
            last = None
            while True:
                hhmm = now_kst_naive().strftime("%H:%M")
                if hhmm != last:
                    last = hhmm
                    try:
                        _run_once(feed_service, hhmm)
                    except Exception:
                        pass
                time.sleep(20)

        _scheduler_thread = threading.Thread(target=loop, daemon=True, name="feed-scheduler")
        _scheduler_thread.start()
        return _scheduler_thread
