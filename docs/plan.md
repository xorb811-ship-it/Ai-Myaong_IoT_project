# Current Architecture Plan

## Core Split

- Remote robot:
  - `desktop/` handles MJPEG reception, OpenCV, and MQTT publishing
  - `raspberrypi/` handles MJPEG streaming and serial bridging
  - `arduino-uno/` handles crawler motors and camera pan/tilt
- Dispenser:
  - `esp32/dispenser/` handles remote food and water control

## Robot Command Flow

1. Raspberry Pi sends MJPEG video to the desktop worker.
2. The desktop worker analyzes frames or receives user intent.
3. The desktop worker publishes `robot/move` and `robot/camera`.
4. Raspberry Pi subscribes to those topics and forwards serial commands.
5. Arduino Uno actuates motors and servos.

## Dispenser Command Flow

1. The web frontend calls the backend dispenser API.
2. The backend publishes `dispenser/feed` or `dispenser/water`.
3. The ESP32 dispenser receives the command and actuates hardware.

## Immediate Next Steps

- Implement the MJPEG frame decoding loop in `desktop/vision/stream_client.py`
- Implement robust MQTT publishing in `desktop/mqtt/publisher.py`
- Implement the final serial protocol in `raspberrypi/comm/serial_comm.py`
- Fill in actual pin mappings and actuator logic in `arduino-uno/AiMyaongRobot/`
