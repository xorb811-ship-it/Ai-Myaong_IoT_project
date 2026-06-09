from typing import Any
from uuid import uuid4

from app.mqtt.mqtt_client import MqttClient
from app.services.database import Database
from app.services.simulator import DeviceSimulator


class FeedService:
    def __init__(self, mqtt_client: MqttClient, database: Database, simulator: DeviceSimulator):
        self.mqtt = mqtt_client
        self.database = database
        self.simulator = simulator

    def feed(self, amount: int) -> dict[str, Any]:
        request_id = str(uuid4())
        payload = {"request_id": request_id, "amount": amount}
        self.mqtt.publish("dispenser/feed", payload)
        status = self.simulator.feed(amount)
        self.database.log_command(request_id, "dispenser_feed", "dispenser/feed", payload, "accepted")
        self.database.log_event("dispenser/status", f"dispenser food request: {amount}", status)
        return {
            "request_id": request_id,
            "status": "accepted",
            "topic": "dispenser/feed",
            "payload": payload,
            "simulated": self.mqtt.simulation_mode,
        }

    def water(self, amount: int) -> dict[str, Any]:
        request_id = str(uuid4())
        payload = {"request_id": request_id, "amount": amount}
        self.mqtt.publish("dispenser/water", payload)
        status = self.simulator.water(amount)
        self.database.log_command(request_id, "dispenser_water", "dispenser/water", payload, "accepted")
        self.database.log_event("dispenser/status", f"dispenser water request: {amount}", status)
        return {
            "request_id": request_id,
            "status": "accepted",
            "topic": "dispenser/water",
            "payload": payload,
            "simulated": self.mqtt.simulation_mode,
        }
