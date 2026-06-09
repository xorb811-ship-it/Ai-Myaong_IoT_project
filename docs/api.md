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
| `POST` | `/api/dispenser/water` | `{"amount":1}` | water dispense |

## Topics

- robot move: `robot/move`
- robot camera: `robot/camera`
- dispenser food: `dispenser/feed`
- dispenser water: `dispenser/water`
