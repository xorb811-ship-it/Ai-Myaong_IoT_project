import json
from typing import Any

try:
    import paho.mqtt.client as mqtt
except ImportError:  # pragma: no cover
    mqtt = None


class RobotCommandPublisher:
    def __init__(self, host: str, port: int) -> None:
        self.host = host
        self.port = port
        self.client = None

        if mqtt is not None:
            self.client = mqtt.Client()
            self.client.connect(host, port, 60)

    def publish_move(self, command: str) -> None:
        self._publish("robot/move", {"command": command})

    def publish_camera(self, direction: str) -> None:
        self._publish("robot/camera", {"direction": direction})

    def _publish(self, topic: str, payload: dict[str, Any]) -> None:
        if self.client is None:
            print(f"[desktop mqtt simulation] {topic} -> {payload}")
            return

        self.client.publish(topic, json.dumps(payload))

    def close(self) -> None:
        if self.client is not None:
            self.client.disconnect()
