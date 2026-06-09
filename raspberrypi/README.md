# Raspberry Pi Agent 사용법

라즈베리파이 에이전트는 MQTT 명령을 받아 Arduino Uno 시리얼 포트로 전달합니다.

```text
backend/app -> MQTT broker -> raspberrypi agent -> Arduino Uno -> pan/tilt servo
```

## 역할

- `robot/move` 토픽 수신
- `robot/camera` 토픽 수신
- 받은 명령을 Arduino로 시리얼 전송
- 예: `CAM_LEFT`, `CAM_RIGHT`, `CAM_UP`, `CAM_DOWN`, `CAM_CENTER`

## 최초 설치

프로젝트 루트에서 실행합니다.

```bash
cd ~/Ai-Myaong_IoT_project
bash ./setup_program/setup-dev-env.sh -Target raspberrypi
```

수동으로 설치하려면:

```bash
cd ~/Ai-Myaong_IoT_project/raspberrypi
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## 환경 설정

설정 파일:

```bash
raspberrypi/.env
```

현재 라즈베리파이가 MQTT broker 역할도 같이 한다면 아래처럼 설정합니다.

```env
MQTT_BROKER_HOST=10.1.82.103
MQTT_BROKER_PORT=1883
SERIAL_PORT=auto
SERIAL_BAUD=115200
SIMULATION_MODE=false
MQTT_DISABLED=false
```

`MQTT_BROKER_HOST`는 MQTT broker가 실행 중인 장비의 IP입니다. 라즈베리파이에서 broker가 실행 중이면 라즈베리파이 IP를 넣으면 됩니다.

## Wi-Fi와 MQTT 주소 같이 변경

라즈베리파이와 ESP32를 같은 Wi-Fi로 맞추고, MQTT broker 주소도 라즈베리파이의 새 Wi-Fi IP로 바꾸려면 프로젝트 루트에서 실행합니다.

```bash
cd ~/Ai-Myaong_IoT_project
bash ./scripts/setup-raspberrypi-wifi.sh "Wi-Fi 이름" "Wi-Fi 비밀번호"
```

이 스크립트는 다음 작업을 합니다.

1. 라즈베리파이를 지정한 Wi-Fi에 연결
2. 라즈베리파이의 현재 `wlan0` IP 자동 확인
3. `raspberrypi/.env`의 `MQTT_BROKER_HOST`를 해당 IP로 변경
4. ESP32 dispenser 스케치의 기본 MQTT host도 같은 IP로 변경
5. ESP32 설정 포털 `http://192.168.4.1`이 연결 가능하면 같은 Wi-Fi/MQTT 설정을 ESP32에도 전송

라즈베리파이 Wi-Fi 변경은 `nmcli`를 우선 사용합니다. `nmcli`가 없으면 `raspi-config`를 시도합니다.

Wi-Fi 변경 실패 시:

- `nmcli` 환경에서는 이전 Wi-Fi 연결로 롤백합니다.
- `raspberrypi/.env`를 변경했다면 백업에서 복구합니다.
- `PI_AP_FALLBACK=true`로 실행한 경우 라즈베리파이가 AP 모드를 열려고 시도합니다.

AP fallback을 켜려면:

```bash
PI_AP_FALLBACK=true bash ./scripts/setup-raspberrypi-wifi.sh "Wi-Fi 이름" "Wi-Fi 비밀번호"
```

기본 AP 이름과 비밀번호:

```env
PI_AP_SSID=AiMyaong_PI_SETUP
PI_AP_PASSWORD=aimyaong1234
```

MQTT host를 자동 감지하지 않고 직접 지정하려면:

```bash
MQTT_BROKER_HOST=10.1.82.103 bash ./scripts/setup-raspberrypi-wifi.sh "Wi-Fi 이름" "Wi-Fi 비밀번호"
```

주의: ESP32 설정 포털에서 Wi-Fi만 따로 바꾸면 라즈베리파이 설정 파일은 자동으로 바뀌지 않습니다. 둘을 같이 바꾸려면 위 스크립트를 기준으로 실행하는 것이 가장 안전합니다.

프론트엔드의 `라즈베리파이 + ESP32 같이 적용` 버튼도 같은 스크립트를 백엔드 API로 실행합니다. 따라서 이 기능은 백엔드가 라즈베리파이에서 실행 중일 때 라즈베리파이 Wi-Fi를 바꿀 수 있습니다.

## 실행

보통은 프로젝트 루트에서 이 파일 하나만 실행하면 됩니다.

```bash
cd ~/Ai-Myaong_IoT_project
bash ./scripts/start-raspberrypi.sh
```

이 스크립트는 다음 순서로 동작합니다.

1. `1883` 포트에 MQTT broker가 이미 켜져 있는지 확인
2. broker가 없으면 `mosquitto`를 임시로 실행
3. `raspberrypi/main.py` 에이전트 실행
4. MQTT 메시지를 받아 Arduino로 전달

MQTT broker만 따로 수동 실행하고 싶을 때는:

```bash
bash ./scripts/start-mqtt-broker.sh
```

## 정상 로그

에이전트가 정상 실행되면 다음과 비슷한 로그가 나옵니다.

```text
[serial] connected to /dev/ttyUSB0 @ 115200
[raspberrypi] connecting to MQTT broker 10.1.82.103:1883
[raspberrypi] subscribed to robot/move
[raspberrypi] subscribed to robot/camera
```

앱에서 팬틸트 버튼을 누르면:

```text
[raspberrypi] MQTT robot/camera -> Arduino CAM_LEFT
[serial] -> robot-controller CAM_LEFT
```

## MQTT 수신 테스트

라즈베리파이에서 전체 MQTT 메시지를 확인하려면:

```bash
mosquitto_sub -h 10.1.82.103 -p 1883 -t '#' -v
```

다른 터미널에서 테스트 발행:

```bash
mosquitto_pub -h 10.1.82.103 -p 1883 -t robot/camera -m CAM_LEFT
```

정상 수신 예:

```text
robot/camera CAM_LEFT
```

## Arduino 시리얼 포트 확인

Arduino가 연결된 포트를 확인합니다.

```bash
ls /dev/ttyUSB* /dev/ttyACM*
```

Arduino Uno는 보통 `/dev/ttyACM0`, CH340 계열 호환 보드는 보통 `/dev/ttyUSB0`로 잡힙니다.
기본 설정은 자동 탐색입니다.

```env
SERIAL_PORT=auto
SERIAL_BAUD=115200
```

직접 고정하려면, 예를 들어 `/dev/ttyACM0`가 나왔을 때 `.env`를 이렇게 바꿉니다.

```env
SERIAL_PORT=/dev/ttyACM0
```

`/dev/ttyUSB0` 또는 `/dev/ttyACM0`가 아무것도 안 나오면 Arduino USB 연결을 다시 확인해야 합니다.

## 자주 나는 문제

### `ConnectionRefusedError: [Errno 111] Connection refused`

MQTT broker가 꺼져 있거나 `MQTT_BROKER_HOST`, `MQTT_BROKER_PORT`가 맞지 않는 상태입니다.

확인:

```bash
systemctl status mosquitto
ss -ltnp | grep 1883
```

프로젝트 스크립트로 broker까지 같이 띄우려면:

```bash
bash ./scripts/start-raspberrypi.sh
```

### `could not open port /dev/ttyUSB0`

Arduino 시리얼 포트가 없거나 이름이 바뀐 상태입니다.

확인:

```bash
ls /dev/ttyUSB* /dev/ttyACM*
```

나온 포트에 맞춰 `raspberrypi/.env`의 `SERIAL_PORT`를 수정합니다.

### MQTT 메시지는 오는데 팬틸트가 안 움직임

MQTT broker는 정상입니다. 이 경우는 라즈베리파이 에이전트 실행 상태나 Arduino 시리얼 연결을 확인합니다.

```bash
bash ./scripts/start-raspberrypi.sh
```

팬틸트 버튼을 누를 때 아래 로그가 나와야 합니다.

```text
[raspberrypi] MQTT robot/camera -> Arduino CAM_LEFT
[serial] -> robot-controller CAM_LEFT
```
