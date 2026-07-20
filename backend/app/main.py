import json
import os
import threading
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.mqtt.mqtt_client import MqttClient
from app.routers import (
    alerts,
    auth,
    device,
    feed,
    health_reports,
    network,
    pets,
    robot,
    robot_devices,
    settings,
    stream,
    vision,
    ws,
)
from app.services.database import Database
from app.services.dispenser_logger import DispenserLogger
from app.services.feed_service import FeedService
from app.services.retention import cleanup_old_records
from app.services.robot_service import RobotService
from app.services.simulator import DeviceSimulator

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

DEFAULT_FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST_DIR", DEFAULT_FRONTEND_DIST)).resolve()


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


app = FastAPI(title="Ai-Myaong Backend", version="0.1.0")

default_cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOW_ORIGINS", ",".join(default_cors_origins)).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"http://(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+):(?:3000|5173)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

database_path = (os.getenv("DATABASE_PATH") or "./backend/aimyaong.sqlite3").strip() or "./backend/aimyaong.sqlite3"
database = Database(database_path)
mqtt_client = MqttClient()
simulator = DeviceSimulator()

app.state.database = database
app.state.mqtt_client = mqtt_client
app.state.simulator = simulator
app.state.robot_service = RobotService(mqtt_client, database, simulator)
app.state.feed_service = FeedService(mqtt_client, database, simulator)


def _handle_sensor_message(payload: dict) -> None:
    # 파이가 뿌리는 후방 센서값을 MQTT로 직접 받는다. HTTP POST(/api/robot/sensor)는
    # announce로 '선택된' 백엔드 한 대만 받지만, 이 경로는 브로커에 붙은 모든 백엔드가
    # 동시에 받는다. 알림 저장은 HTTP 경로에만 남겨 백엔드마다 중복 생성되지 않게 한다.
    simulator.update_sensor(
        distance_cm=payload.get("distance_cm"),
        rear_obstacle=payload.get("rear_obstacle"),
        threshold_cm=payload.get("threshold_cm"),
        source=payload.get("source"),
    )


dispenser_logger = DispenserLogger()
app.state.dispenser_logger = dispenser_logger


def _handle_dispenser_weight_message(payload: dict) -> None:
    # 디스펜서 로드셀(사료통/물통) 무게. 잔여량 표시의 유일한 실제 소스다.
    status = simulator.update_dispenser_weight(
        food_g=payload.get("food_g"),
        water_g=payload.get("water_g"),
        source="esp32-loadcell",
    )
    # 물통 무게가 줄어든 만큼이 곧 고양이가 마신 양이다(순환이라 급수로는 안 줄어든다).
    # 필터를 거친 값으로 판단해야 노이즈로 헛기록이 남지 않는다.
    dispenser_logger.on_water_weight(status["dispenser"].get("water_ml"))


def _handle_dispenser_dispensed_message(payload: dict) -> None:
    # ESP32 가 저울로 직접 잰 1회 배출량. 통계에 남는 유일한 배식량 소스다.
    dispenser_logger.on_food_dispensed(payload.get("food_g"))


def _handle_scheduled_water_event(payload: dict) -> None:
    from database.alerts import Alert
    from database.base import SessionLocal
    from database.water_logs import WaterLog

    if SessionLocal is None:
        return

    event = str(payload.get("event") or "")
    if event not in {"executed", "skipped"}:
        return
    try:
        user_id = int(payload.get("user_id") or 0)
        pet_id = int(payload.get("pet_id") or 0)
    except (TypeError, ValueError):
        return
    if not user_id or not pet_id:
        return

    db = SessionLocal()
    try:
        pending = (
            db.query(WaterLog)
            .filter(
                WaterLog.user_id == user_id,
                WaterLog.pet_id == pet_id,
                WaterLog.water_type == "auto_pending",
            )
            .order_by(WaterLog.created_at.desc(), WaterLog.water_log_id.desc())
            .first()
        )
        if pending:
            pending.water_type = "auto" if event == "executed" else "skipped"

        if event == "skipped":
            amount = int(float(payload.get("amount") or 0))
            message = json.dumps(
                {
                    "title": "예약 급수 시간에 고양이가 감지되지 않았어요",
                    "desc": f"고양이가 10분 동안 감지되지 않아 예약된 급수({amount}초)를 실행하지 않았습니다.",
                    "link": "/activity",
                },
                ensure_ascii=False,
            )
            db.add(
                Alert(
                    user_id=user_id,
                    pet_id=pet_id,
                    alert_type="water_skipped",
                    message=message,
                    is_confirmed="N",
                )
            )
        db.commit()
    except Exception as error:
        db.rollback()
        print(f"[scheduled-water] event handling failed: {error}", flush=True)
    finally:
        db.close()


def _handle_dispenser_status_message(payload: dict) -> None:
    # 디스펜서가 지금 사료/물을 내보내는 중인지. 앱의 '긴급 정지' 버튼이 이 값으로 뜬다.
    # 기기만 정확히 아는 정보라, 프론트가 배출 시간을 추측하지 않도록 여기서 받는다.
    simulator.update_dispenser_state(payload.get("state"))


mqtt_client.on_topic("ai-myaong/robot/sensor", _handle_sensor_message)
mqtt_client.on_topic("dispenser/weight", _handle_dispenser_weight_message)
mqtt_client.on_topic("dispenser/dispensed", _handle_dispenser_dispensed_message)
mqtt_client.on_topic("dispenser/water/event", _handle_scheduled_water_event)
# retain 된 상태는 무시한다. dispenser/status 는 retain 이라 접속하자마자 마지막 값이
# 배달되는데, 그게 몇 시간 전 feed_running 이면 백엔드가 '지금 배식 중'으로 착각해
# 재시작할 때마다 정지 버튼이 유령처럼 뜬다. 구동 여부는 '지금 오는' 신호로만 판단한다.
mqtt_client.on_topic("dispenser/status", _handle_dispenser_status_message, skip_retained=True)

app.include_router(robot.router)
app.include_router(robot_devices.router)
app.include_router(feed.router)
app.include_router(stream.router)
app.include_router(ws.router)
app.include_router(network.router)
app.include_router(auth.router)
app.include_router(pets.router)
app.include_router(health_reports.router)
app.include_router(settings.router)
app.include_router(alerts.router)
app.include_router(device.router)
app.include_router(vision.router)

if (FRONTEND_DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")


@app.on_event("startup")
def startup() -> None:
    database.init()

    def run_retention_cleanup() -> None:
        try:
            cleanup_old_records()
        except Exception as error:
            print(f"[Retention] cleanup skipped: {error}", flush=True)

    threading.Thread(target=run_retention_cleanup, daemon=True, name="retention-cleanup").start()

    mqtt_client.start()

    from app.services.backend_announcer import start_backend_announcer

    start_backend_announcer(mqtt_client)
    database.log_event("system", "FastAPI server started", simulator.status())

    if env_bool("FEED_SCHEDULER_ENABLED", False):
        from app.services.feed_scheduler import start_feed_scheduler

        thread = start_feed_scheduler(app.state.feed_service)
        if thread is None:
            print("[FeedScheduler] skipped: another local scheduler is already running", flush=True)
        else:
            print("[FeedScheduler] started", flush=True)
    else:
        print("[FeedScheduler] disabled by FEED_SCHEDULER_ENABLED", flush=True)

@app.on_event("shutdown")
def shutdown() -> None:
    mqtt_client.stop()


@app.get("/api/health")
def health():
    return {"name": "Ai-Myaong", "status": "ok", "simulation": mqtt_client.simulation_mode}


@app.get("/{full_path:path}")
def serve_frontend(full_path: str):
    index_file = FRONTEND_DIST / "index.html"
    if not index_file.is_file():
        if full_path == "":
            return health()
        raise HTTPException(status_code=404, detail="Frontend build was not found")

    requested_file = (FRONTEND_DIST / full_path).resolve()
    if (
        full_path
        and FRONTEND_DIST in requested_file.parents
        and requested_file.is_file()
    ):
        return FileResponse(requested_file)

    return FileResponse(index_file)
