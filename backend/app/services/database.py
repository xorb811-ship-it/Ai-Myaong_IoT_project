import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class Database:
    def __init__(self, path: str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def init(self) -> None:
        with self.connect() as db:
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS command_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id TEXT NOT NULL,
                    command_type TEXT NOT NULL,
                    topic TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    result TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS device_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )

    def log_command(
        self,
        request_id: str,
        command_type: str,
        topic: str,
        payload: dict[str, Any],
        result: str,
    ) -> None:
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO command_logs
                (request_id, command_type, topic, payload, result, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    request_id,
                    command_type,
                    topic,
                    json.dumps(payload, ensure_ascii=False),
                    result,
                    now_iso(),
                ),
            )

    def log_event(self, event_type: str, message: str, payload: dict[str, Any]) -> None:
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO device_events (event_type, message, payload, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (event_type, message, json.dumps(payload, ensure_ascii=False), now_iso()),
            )

    def recent_commands(self, limit: int = 8) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT request_id, command_type, topic, payload, result, created_at
                FROM command_logs
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [row_to_dict(row) for row in rows]

    def recent_events(self, limit: int = 8) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT event_type, message, payload, created_at
                FROM device_events
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [row_to_dict(row) for row in rows]


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    data = dict(row)
    if "payload" in data:
        data["payload"] = json.loads(data["payload"])
    return data


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
