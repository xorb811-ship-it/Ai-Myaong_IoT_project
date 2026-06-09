from pathlib import Path
import os

from dotenv import load_dotenv

from mqtt.publisher import RobotCommandPublisher
from vision.stream_client import MjpegStreamClient


def main() -> None:
    env_path = Path(__file__).resolve().parent / ".env"
    load_dotenv(env_path)

    stream_url = os.getenv("MJPEG_STREAM_URL", "http://127.0.0.1:8080/stream.mjpg")
    broker_host = os.getenv("MQTT_BROKER_HOST", "127.0.0.1")
    broker_port = int(os.getenv("MQTT_BROKER_PORT", "1883"))

    stream_client = MjpegStreamClient(stream_url)
    publisher = RobotCommandPublisher(broker_host, broker_port)

    print("Desktop worker starting")
    print(f"  MJPEG stream: {stream_client.stream_url}")
    print(f"  MQTT broker: {broker_host}:{broker_port}")
    print("OpenCV loop is not implemented yet. This scaffold is ready for the next step.")

    publisher.close()


if __name__ == "__main__":
    main()
