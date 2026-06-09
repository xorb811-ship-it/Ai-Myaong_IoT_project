import os
import time
from glob import glob


class SerialComm:
    def __init__(self) -> None:
        self.port = os.getenv("SERIAL_PORT", "/dev/ttyUSB0")
        self.baud = int(os.getenv("SERIAL_BAUD", "115200"))
        self.simulation_mode = os.getenv("SIMULATION_MODE", "false").lower() == "true"
        self.debug = os.getenv("SERIAL_DEBUG", "false").lower() == "true"
        self._serial = None

    def connect(self) -> None:
        if self.simulation_mode:
            print("[serial:simulated] robot serial ready")
            return

        import serial

        self.port = self._resolve_port()
        self._serial = serial.Serial(self.port, self.baud, timeout=1)
        print(f"[serial] connected to {self.port} @ {self.baud}")
        self._drain_startup_output()

    def send(self, command: str) -> None:
        if self.simulation_mode or not self._serial:
            print(f"[serial:simulated] -> robot-controller {command}")
            return

        self._serial.write(f"{command}\n".encode("utf-8"))
        self._serial.flush()
        if self.debug:
            print(f"[serial] -> robot-controller {command}")
            self._read_available_output()

    def close(self) -> None:
        if self._serial and self._serial.is_open:
            self._serial.close()
            print("[serial] disconnected")

    def _resolve_port(self) -> str:
        if self.port and self.port.lower() != "auto" and os.path.exists(self.port):
            return self.port

        candidates = []
        candidates.extend(sorted(glob("/dev/serial/by-id/*")))
        candidates.extend(sorted(glob("/dev/ttyACM*")))
        candidates.extend(sorted(glob("/dev/ttyUSB*")))

        if candidates:
            selected = candidates[0]
            print(f"[serial] auto-detected Arduino port: {selected}")
            return selected

        if self.port and self.port.lower() != "auto":
            return self.port

        raise FileNotFoundError("Arduino serial port was not found. Check /dev/ttyACM* or /dev/ttyUSB*.")

    def _drain_startup_output(self) -> None:
        if not self._serial:
            return

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
                print(f"[serial] <- robot-controller {line}")

        return saw_output
