import os
import time

from app.runtime_config import runtime_env


class LocalSerialError(RuntimeError):
    pass


class LocalSerial:
    def __init__(self) -> None:
        self.port = runtime_env("SERIAL_PORT", "auto")
        self.baud = int(runtime_env("SERIAL_BAUD", "115200"))
        self.debug = runtime_env("SERIAL_DEBUG", "false").lower() == "true"
        self._serial = None

    def send(self, command: str) -> bool:
        try:
            serial_conn = self._ensure_connected()
            serial_conn.write(f"{command}\n".encode("utf-8"))
            serial_conn.flush()
            if self.debug:
                print(f"[serial:local] -> Arduino {command}")
                self._read_available_output()
            return True
        except Exception as error:
            message = self._format_error(error)
            print(f"[serial:local] command failed: {message}")
            self.close()
            raise LocalSerialError(message) from error

    def close(self) -> None:
        if self._serial and getattr(self._serial, "is_open", False):
            self._serial.close()
            print("[serial:local] disconnected")
        self._serial = None

    def _ensure_connected(self):
        if self._serial and getattr(self._serial, "is_open", False):
            return self._serial

        import serial

        self.port = self._resolve_port()
        self.baud = int(runtime_env("SERIAL_BAUD", str(self.baud)))
        self._serial = serial.Serial(self.port, self.baud, timeout=1)
        print(f"[serial:local] connected to {self.port} @ {self.baud}")
        self._drain_startup_output()
        return self._serial

    def _resolve_port(self) -> str:
        configured = runtime_env("SERIAL_PORT", self.port).strip() or "auto"
        if configured.lower() != "auto":
            return configured

        from serial.tools import list_ports

        ports = list(list_ports.comports())
        preferred_words = ("arduino", "ch340", "wch", "usb serial", "usb-serial", "uno")
        for port in ports:
            text = f"{port.device} {port.description} {port.manufacturer or ''}".lower()
            if any(word in text for word in preferred_words):
                return port.device

        if ports:
            return ports[0].device

        raise FileNotFoundError("Arduino USB serial port was not found. Set SERIAL_PORT=COMx in backend/.env.")

    def _format_error(self, error: Exception) -> str:
        if isinstance(error, PermissionError) or "PermissionError" in repr(error):
            return (
                f"Could not open {self.port}. The port is probably already open in Arduino IDE "
                "Serial Monitor/Plotter or another terminal. Close it and retry."
            )

        return str(error)

    def _drain_startup_output(self) -> None:
        deadline = time.monotonic() + 2.0
        while time.monotonic() < deadline:
            if self._read_available_output():
                deadline = time.monotonic() + 0.2
            time.sleep(0.05)

    def _read_available_output(self) -> bool:
        if not self._serial:
            return False

        saw_output = False
        deadline = time.monotonic() + 0.2
        while time.monotonic() < deadline:
            waiting = getattr(self._serial, "in_waiting", 0)
            if not waiting:
                time.sleep(0.02)
                continue

            line = self._serial.readline().decode("utf-8", "replace").strip()
            if line:
                saw_output = True
                print(f"[serial:local] <- Arduino {line}")

        return saw_output
