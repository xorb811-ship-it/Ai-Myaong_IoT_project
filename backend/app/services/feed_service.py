from typing import Any
from uuid import uuid4

from app.mqtt.mqtt_client import MqttClient
from app.services.database import Database
from app.services.simulator import DeviceSimulator

WATER_MIN_SECONDS = 30
WATER_MAX_SECONDS = 90


class FeedService:
    def __init__(self, mqtt_client: MqttClient, database: Database, simulator: DeviceSimulator):
        self.mqtt = mqtt_client
        self.database = database
        self.simulator = simulator

    def feed(self, amount: int) -> dict[str, Any]:
        request_id = str(uuid4())
        payload = {"request_id": request_id, "amount": amount}
        self.mqtt.publish("dispenser/feed", payload)
        self.simulator.feed(amount)
        status = self.simulator.update_dispenser_state("feed_running")
        self.database.log_command(request_id, "dispenser_feed", "dispenser/feed", payload, "accepted")
        self.database.log_event("dispenser/status", f"dispenser food request: {amount}", status)
        return {
            "request_id": request_id,
            "status": "accepted",
            "topic": "dispenser/feed",
            "payload": payload,
            "simulated": self.mqtt.simulation_mode,
        }

    def water(
        self,
        seconds: int,
        source: str = "manual",
        user_id: int | None = None,
        pet_id: int | None = None,
    ) -> dict[str, Any]:
        request_id = str(uuid4())
        # amount 도 같이 실어 옛 펌웨어와도 물린다 (그쪽은 이 값을 초로 읽는다).
        seconds = max(WATER_MIN_SECONDS, min(WATER_MAX_SECONDS, int(seconds)))
        payload = {
            "request_id": request_id,
            "seconds": seconds,
            "amount": seconds,
            "source": source,
            "user_id": str(user_id or ""),
            "pet_id": str(pet_id or ""),
        }
        self.mqtt.publish("dispenser/water", payload)
        status = self.simulator.water(seconds)
        self.database.log_command(request_id, "dispenser_water", "dispenser/water", payload, "accepted")
        self.database.log_event("dispenser/status", f"dispenser water request: {seconds}s", status)
        return {
            "request_id": request_id,
            "status": "accepted",
            "topic": "dispenser/water",
            "payload": payload,
            "simulated": self.mqtt.simulation_mode,
        }
