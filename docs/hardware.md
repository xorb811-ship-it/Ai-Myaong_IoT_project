# Hardware Notes

## Raspberry Pi

- subscribes to `robot/move` and `robot/camera`
- serves MJPEG camera stream
- forwards robot commands to the robot controller over serial
- set `raspberrypi/.env` with `SIMULATION_MODE=false` for real MQTT-to-serial control
- default serial bridge uses `SERIAL_PORT=/dev/ttyUSB0` and `SERIAL_BAUD=115200`

## Robot Controller

- receives low-level robot commands from Raspberry Pi
- drives crawler motors
- drives camera pan/tilt servos

## ESP32 Dispenser

- separate device from the robot
- receives `dispenser/feed` and `dispenser/water`
- controls food and water actuators
