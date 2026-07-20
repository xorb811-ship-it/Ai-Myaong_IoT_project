import hashlib
import hmac
import json
import time
from typing import Any


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sign_payload(secret: str, robot_serial: str, timestamp: int, payload: dict[str, Any]) -> str:
    message = f"{robot_serial}.{timestamp}.{canonical_json(payload)}"
    return hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()


def signed_message(secret: str, robot_serial: str, payload: dict[str, Any], timestamp: int | None = None) -> dict[str, Any]:
    signed_at = int(timestamp or time.time())
    return {
        "robot_serial": robot_serial,
        "timestamp": signed_at,
        "payload": payload,
        "signature": sign_payload(secret, robot_serial, signed_at, payload),
    }


def verify_signed_message(
    message: dict[str, Any],
    secret: str,
    expected_robot_serial: str | None = None,
    max_age_seconds: int = 300,
) -> bool:
    robot_serial = str(message.get("robot_serial") or "").strip().upper()
    signature = str(message.get("signature") or "").strip()
    payload = message.get("payload")

    if expected_robot_serial and robot_serial != expected_robot_serial.strip().upper():
        return False
    if not robot_serial or not signature or not isinstance(payload, dict):
        return False

    try:
        timestamp = int(message.get("timestamp"))
    except (TypeError, ValueError):
        return False

    if max_age_seconds > 0 and abs(int(time.time()) - timestamp) > max_age_seconds:
        return False

    expected = sign_payload(secret, robot_serial, timestamp, payload)
    return hmac.compare_digest(signature, expected)
