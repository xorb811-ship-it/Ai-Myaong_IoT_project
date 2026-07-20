import json
import urllib.error
import urllib.request
from typing import Any
from uuid import uuid4

from app.core.device_hmac import signed_message
from app.mqtt.mqtt_client import MqttClient
from app.runtime_config import runtime_env
from app.services.database import Database
from app.services.local_serial import LocalSerial, LocalSerialError
from app.services.simulator import DeviceSimulator


class RobotService:
    def __init__(self, mqtt_client: MqttClient, database: Database, simulator: DeviceSimulator):
        self.mqtt = mqtt_client
        self.database = database
        self.simulator = simulator
        self.local_serial = LocalSerial()

    def move(self, command: str) -> dict[str, Any]:
        request_id = str(uuid4())
        topic = "ai-myaong/robot/move"
        payload = {"request_id": request_id, "cmd": command}
        self._send_robot_command(topic, payload)
        status = self.simulator.move(command)
        self.database.log_command(request_id, "move", topic, payload, "accepted")
        self.database.log_event("robot/status", f"robot move command handled: {command}", status)
        return self._response(request_id, topic, payload)

    def camera(self, direction: str) -> dict[str, Any]:
        request_id = str(uuid4())
        topic = "ai-myaong/robot/pantilt"
        payload = {"request_id": request_id, "cmd": direction}
        self._send_robot_command(topic, payload)
        status = self.simulator.control_camera(direction)
        self.database.log_command(request_id, "camera", topic, payload, "accepted")
        self.database.log_event("robot/status", f"camera command handled: {direction}", status)
        return self._response(request_id, topic, payload)

    def away_mode(self, on: bool) -> dict[str, Any]:
        request_id = str(uuid4())
        topic = "robot/away-mode"
        command = "AWAY_ON" if on else "AWAY_OFF"
        payload = {"request_id": request_id, "cmd": command, "on": on}
        self._send_robot_command(topic, payload)
        status = self.simulator.set_away_mode(on)
        self.database.log_command(request_id, "away_mode", topic, payload, "accepted")
        self.database.log_event("robot/status", f"away mode command handled: {command}", status)
        return self._response(request_id, topic, payload)

    def capture(self) -> dict[str, Any]:
        request_id = str(uuid4())
        topic = "robot/capture"
        payload = {"request_id": request_id, "cmd": "CAPTURE"}
        self._send_robot_command(topic, payload)
        status = self.simulator.capture()
        self.database.log_command(request_id, "capture", topic, payload, "accepted")
        self.database.log_event("robot/status", "capture command handled", status)
        return self._response(request_id, topic, payload)

    def reboot(self) -> dict[str, Any]:
        request_id = str(uuid4())
        topic = "ai-myaong/robot/system"
        payload = {"request_id": request_id, "cmd": "REBOOT"}
        self._send_robot_command(topic, payload)
        status = self.simulator.status()
        self.database.log_command(request_id, "reboot", topic, payload, "accepted")
        self.database.log_event("robot/status", "reboot command handled", status)
        return self._response(request_id, topic, payload)

    def power(self, on: bool) -> dict[str, Any]:
        request_id = str(uuid4())
        topic = "ai-myaong/robot/system"
        command = "POWER_ON" if on else "POWER_OFF"
        payload = {"request_id": request_id, "cmd": command, "on": on}
        self._send_robot_command(topic, payload)
        status = self.simulator.status()
        self.database.log_command(request_id, "power", topic, payload, "accepted")
        self.database.log_event("robot/status", f"power command handled: {command}", status)
        return self._response(request_id, topic, payload)

    def status(self) -> dict[str, Any]:
        return self.simulator.status()

    def dashboard(self) -> dict[str, Any]:
        return {
            "status": self.simulator.status(),
            "commands": self.database.recent_commands(),
            "events": self.database.recent_events(),
        }

    def _response(self, request_id: str, topic: str, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "request_id": request_id,
            "status": "accepted",
            "topic": topic,
            "payload": payload,
            "simulated": self.mqtt.simulation_mode,
        }

    def _send_robot_command(self, topic: str, payload: dict[str, Any]) -> bool:
        payload = self._signed_payload_if_configured(payload)
        transport = runtime_env("ROBOT_COMMAND_TRANSPORT", "mqtt").strip().lower()
        if transport in {"local_serial", "serial", "usb"}:
            command_payload = payload.get("payload") if isinstance(payload.get("payload"), dict) else payload
            command = str(command_payload.get("cmd") or "").strip()
            if not command:
                print(f"[serial:local] empty command payload: {payload}")
                return False
            try:
                return self.local_serial.send(command)
            except LocalSerialError:
                raise

        if transport in {"pi_http", "http", "direct"}:
            return self._send_to_pi_agent(payload)

        return self.mqtt.publish(topic, payload)

    def _signed_payload_if_configured(self, payload: dict[str, Any]) -> dict[str, Any]:
        robot_serial = (
            runtime_env("ROBOT_SERIAL", "")
            or runtime_env("DEVICE_SERIAL", "")
            or runtime_env("DEVICE_ID", "")
        ).strip().upper()
        device_secret = (
            runtime_env("ROBOT_DEVICE_SECRET", "")
            or runtime_env("DEVICE_SECRET", "")
        ).strip()
        if not robot_serial or not device_secret:
            return payload
        return signed_message(device_secret, robot_serial, payload)

    def _send_to_pi_agent(self, payload: dict[str, Any]) -> bool:
        base_url = runtime_env("PI_AGENT_BASE_URL", "").strip().rstrip("/")
        if not base_url:
            print(f"[robot:pi-http] PI_AGENT_BASE_URL is empty; command not sent: {payload}")
            return False

        request = urllib.request.Request(
            f"{base_url}/api/robot/command",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=2) as response:
                response.read()
            print(f"[robot:pi-http] {base_url}/api/robot/command {payload}")
            return True
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            print(f"[robot:pi-http] command rejected HTTP {error.code}: {detail}")
        except Exception as error:
            print(f"[robot:pi-http] command failed: {error}")

        return False
