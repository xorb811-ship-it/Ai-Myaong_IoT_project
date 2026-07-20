import json
import socket
import threading
import time
from typing import Any, Callable

from app.runtime_config import runtime_env


class MqttClient:
    def __init__(self) -> None:
        self.host = "localhost"
        self.port = 8883
        self.username = ""
        self.password = ""
        self.use_tls = False
        self.tcp_nodelay = True
        self.config_check_interval = 1.0
        self.simulation_mode = True
        self.connected = False
        self._client = None
        self._connect_event = threading.Event()
        self._lock = threading.RLock()
        self._last_config_check_at = 0.0
        self._handlers: dict[str, Callable[[dict[str, Any]], None]] = {}
        self._refresh_config()

    def on_topic(
        self,
        topic: str,
        handler: Callable[[dict[str, Any]], None],
        skip_retained: bool = False,
    ) -> None:
        """토픽 수신 핸들러 등록. 등록된 토픽은 접속할 때마다 자동으로 구독한다.

        skip_retained: 브로커에 retain 된 값을 무시한다. retain 은 '마지막에 이랬다'는
        기록이라 접속하자마자 배달되는데, '지금 구동 중인가' 같은 순간 상태에 쓰면
        몇 시간 전 값을 현재로 착각한다. 그런 토픽에만 켠다.
        """
        self._handlers[topic] = (handler, skip_retained)

    def start(self) -> None:
        with self._lock:
            self._refresh_config()
            self._close_client()
            self._connect_event.clear()
            if self.simulation_mode:
                print("[mqtt:simulated] SIMULATION_MODE=true; MQTT publish is disabled")
                self.connected = True
                self._connect_event.set()
                return

            try:
                import paho.mqtt.client as mqtt

                self._client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
                self._client.connect_timeout = 3
                self._client.on_connect = self._on_connect
                self._client.on_disconnect = self._on_disconnect
                self._client.on_message = self._on_message
                if self.username:
                    self._client.username_pw_set(self.username, self.password or None)
                if self.use_tls:
                    self._client.tls_set()
                self._client.connect(self.host, self.port, keepalive=30)
                self._client.loop_start()
            except Exception as error:
                print(f"[mqtt] connect failed {self.host}:{self.port} - {error}")
                self._client = None
                self.connected = False
                self._connect_event.clear()
                return

        if not self._connect_event.wait(timeout=5):
            self.connected = False
            print(f"[mqtt] connect pending {self.host}:{self.port}; publish will retry")

    def stop(self) -> None:
        with self._lock:
            self._close_client()
            self.connected = False
            self._connect_event.clear()

    def publish(self, topic: str, payload: dict[str, Any], retain: bool = False) -> bool:
        self._restart_if_config_changed()
        message = json.dumps(payload, ensure_ascii=False)
        if self.simulation_mode:
            print(f"[mqtt:simulated] {topic} {message}")
            return True

        if not self._client or not self.connected:
            print(f"[mqtt] not connected; reconnecting before publish {topic}")
            self.start()

        if not self._client or not self.connected:
            print(f"[mqtt:unavailable] {topic} {message}")
            return False

        result = self._client.publish(topic, message, retain=retain)
        if result.rc != 0:
            print(f"[mqtt] publish failed rc={result.rc} {topic} {message}")
        return result.rc == 0

    def reconnect_if_config_changed(self) -> bool:
        self._restart_if_config_changed()
        return self.connected

    def _refresh_config(self) -> tuple[str, int, bool]:
        self.host = runtime_env("MQTT_BROKER_HOST", "localhost")
        self.port = int(runtime_env("MQTT_BROKER_PORT", "1883"))
        self.username = runtime_env("MQTT_USERNAME", "")
        self.password = runtime_env("MQTT_PASSWORD", "")
        self.use_tls = runtime_env("MQTT_USE_TLS", "false").lower() == "true"
        self.tcp_nodelay = runtime_env("MQTT_TCP_NODELAY", "true").lower() == "true"
        self.config_check_interval = float(runtime_env("MQTT_CONFIG_CHECK_INTERVAL", "1"))
        self.simulation_mode = runtime_env("SIMULATION_MODE", "true").lower() == "true"
        self._last_config_check_at = time.monotonic()
        return self.host, self.port, self.simulation_mode

    def _restart_if_config_changed(self) -> None:
        now = time.monotonic()
        if self.connected and now - self._last_config_check_at < self.config_check_interval:
            return
        self._last_config_check_at = now

        previous = (self.host, self.port, self.username, self.password, self.use_tls, self.simulation_mode)
        current = (
            runtime_env("MQTT_BROKER_HOST", "localhost"),
            int(runtime_env("MQTT_BROKER_PORT", "1883")),
            runtime_env("MQTT_USERNAME", ""),
            runtime_env("MQTT_PASSWORD", ""),
            runtime_env("MQTT_USE_TLS", "false").lower() == "true",
            runtime_env("SIMULATION_MODE", "true").lower() == "true",
        )
        if current == previous:
            if not self.connected and not current[5]:
                print(f"[mqtt] disconnected from {self.host}:{self.port}; reconnecting")
                self.start()
            return

        print(f"[mqtt] config changed {self._display_config(previous)} -> {self._display_config(current)}; reconnecting")
        self.stop()
        self.host, self.port, self.username, self.password, self.use_tls, self.simulation_mode = current
        self.start()

    def _close_client(self) -> None:
        if not self._client:
            return

        client = self._client
        self._client = None
        try:
            client.loop_stop()
            client.disconnect()
        except Exception as error:
            print(f"[mqtt] disconnect cleanup failed: {error}")

    def _display_config(self, config: tuple[str, int, str, str, bool, bool]) -> tuple[str, int, str, str, bool, bool]:
        host, port, username, password, use_tls, simulation_mode = config
        masked_password = "***" if password else ""
        return host, port, username, masked_password, use_tls, simulation_mode

    def _subscribe_topics(self) -> None:
        if not self._client:
            return

        raw_topics = runtime_env("MQTT_SUBSCRIBE_TOPICS", "").strip()
        env_topics = [item.strip() for item in raw_topics.split(",") if item.strip()]
        # 핸들러가 등록된 토픽은 .env 설정 없이도 구독한다.
        topics = dict.fromkeys(list(self._handlers) + env_topics)
        if not topics:
            return

        for topic in topics:
            result = self._client.subscribe(topic)
            rc = result[0] if isinstance(result, tuple) else getattr(result, "rc", 0)
            if rc == 0:
                print(f"[mqtt] subscribed: {topic}")
            else:
                print(f"[mqtt] subscribe failed rc={rc}: {topic}")

    def _on_message(self, _client, _userdata, message) -> None:
        entry = self._handlers.get(message.topic)
        if not entry:
            return

        handler, skip_retained = entry
        if skip_retained and message.retain:
            return

        try:
            payload = json.loads(message.payload.decode("utf-8"))
        except Exception as error:
            print(f"[mqtt] payload parse failed {message.topic}: {error}")
            return

        try:
            handler(payload)
        except Exception as error:
            print(f"[mqtt] handler failed {message.topic}: {error}")

    def _on_connect(self, _client, _userdata, _flags, reason_code, _properties=None) -> None:
        if self._is_success(reason_code):
            self.connected = True
            self._connect_event.set()
            self._set_tcp_nodelay()
            print(f"[mqtt] connected to {self.host}:{self.port}")
            self._subscribe_topics()
            return

        self.connected = False
        self._connect_event.clear()
        self._connect_event.set()
        print(f"[mqtt] connect rejected {self.host}:{self.port} reason={reason_code}")

    def _on_disconnect(self, _client, _userdata, _disconnect_flags=None, reason_code=None, _properties=None) -> None:
        self.connected = False
        self._connect_event.clear()
        if not self.simulation_mode:
            print(f"[mqtt] disconnected from {self.host}:{self.port} reason={reason_code}")

    def _is_success(self, reason_code) -> bool:
        try:
            return int(reason_code) == 0
        except (TypeError, ValueError):
            return str(reason_code).lower() in {"0", "success", "normal disconnection"}

    def _set_tcp_nodelay(self) -> None:
        if not self.tcp_nodelay or not self._client:
            return

        try:
            mqtt_socket = self._client.socket()
            if mqtt_socket:
                mqtt_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except Exception as error:
            print(f"[mqtt] TCP_NODELAY setup skipped: {error}")
