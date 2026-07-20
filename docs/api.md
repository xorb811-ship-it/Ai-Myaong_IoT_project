# API

Base URL: `http://localhost:8000`

## Robot

| Method | URL | Body | Description |
| --- | --- | --- | --- |
| `GET` | `/` | - | health check |
| `GET` | `/api/robot/status` | - | robot status |
| `GET` | `/api/robot/dashboard` | - | dashboard snapshot |
| `POST` | `/api/robot/move` | `{"command":"FORWARD"}` | movement command |
| `POST` | `/api/robot/camera` | `{"direction":"CAM_UP"}` | camera pan/tilt |
| `GET` | `/api/stream/url` | - | MJPEG URL |
| `GET` | `/api/stream/simulated.mjpg` | - | simulated MJPEG stream |

## Dispenser

| Method | URL | Body | Description |
| --- | --- | --- | --- |
| `POST` | `/api/dispenser/feed` | `{"amount":1}` | food dispense |
| `POST` | `/api/dispenser/water` | `{"seconds":60}` | timed water pump, 30-90 seconds |
| `POST` | `/api/dispenser/pump/on` | - | start water pump continuously |
| `POST` | `/api/dispenser/pump/off` | - | stop water pump |
| `POST` | `/api/dispenser/pump/speed` | `{"speed":200}` | set water pump PWM speed |
| `POST` | `/api/dispenser/tare` | - | tare both load cells |
| `POST` | `/api/dispenser/weight/request` | - | request immediate weight publish |

## Topics

- robot move: `robot/move`
- robot camera: `robot/camera`
- dispenser food: `dispenser/feed`
- dispenser water: `dispenser/water`
- dispenser pump start: `dispenser/pump/on`
- dispenser pump stop: `dispenser/pump/off`
- dispenser pump speed: `dispenser/pump/speed`
- dispenser load cell tare: `dispenser/tare`
- dispenser weight request: `dispenser/weight/request`
- dispenser status: `dispenser/status`
- dispenser weight: `dispenser/weight`
