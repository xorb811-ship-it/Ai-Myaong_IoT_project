import os
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
    settings,
    stream,
    vision,
    ws,
)
from app.services.database import Database
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

app.include_router(robot.router)
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
    try:
        cleanup_old_records()
    except Exception as error:
        print(f"[Retention] cleanup skipped: {error}", flush=True)

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
