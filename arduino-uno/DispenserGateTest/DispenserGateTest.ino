#include <Servo.h>

// Temporary dispenser funnel slide-gate test.
// Wiring: servo signal -> D9, servo GND -> Arduino/external supply GND.
constexpr uint8_t SERVO_PIN = 9;
// Continuous-rotation servo control. Pulse width controls direction/speed,
// not angle. Adjust STOP_PULSE_US slightly if the servo creeps at rest.
constexpr int STOP_PULSE_US = 1500;
constexpr int OPEN_PULSE_US = 1600;
constexpr int CLOSE_PULSE_US = 1400;
constexpr unsigned long OPEN_MOVE_TIME_MS = 450;
// Return a little longer to compensate for reverse-speed and mechanism drag.
constexpr unsigned long CLOSE_MOVE_TIME_MS = 500;
constexpr unsigned long DEFAULT_OPEN_TIME_MS = 1500;

Servo gateServo;
bool gateOpen = false;

void stopGateServo() {
  gateServo.writeMicroseconds(STOP_PULSE_US);
}

void moveGateFor(int pulseWidthUs, unsigned long moveTimeMs) {
  gateServo.writeMicroseconds(pulseWidthUs);
  delay(moveTimeMs);
  stopGateServo();
}

void openGate() {
  moveGateFor(OPEN_PULSE_US, OPEN_MOVE_TIME_MS);
  gateOpen = true;
  Serial.println("ACK GATE_OPEN");
}

void closeGate() {
  moveGateFor(CLOSE_PULSE_US, CLOSE_MOVE_TIME_MS);
  gateOpen = false;
  Serial.println("ACK GATE_CLOSED");
}

void runCycle(unsigned long openTimeMs = DEFAULT_OPEN_TIME_MS) {
  openGate();
  delay(openTimeMs);
  closeGate();
  Serial.println("ACK GATE_CYCLE_DONE");
}

void printHelp() {
  Serial.println("Dispenser slide-gate test commands:");
  Serial.println("  OPEN    - open the gate");
  Serial.println("  CLOSE   - close the gate");
  Serial.println("  TOGGLE  - switch gate state");
  Serial.println("  CYCLE   - open for 1.5 seconds, then close");
  Serial.println("  STATUS  - print current state and angle");
}

void handleCommand(String command) {
  command.trim();
  command.toUpperCase();

  if (command == "OPEN") {
    openGate();
  } else if (command == "CLOSE") {
    closeGate();
  } else if (command == "TOGGLE") {
    gateOpen ? closeGate() : openGate();
  } else if (command == "CYCLE" || command == "TEST") {
    runCycle();
  } else if (command == "STATUS") {
    Serial.print("GATE state=");
    Serial.println(gateOpen ? "OPEN" : "CLOSED");
  } else if (command == "HELP") {
    printHelp();
  } else if (command.length() > 0) {
    Serial.println("ERR UNKNOWN_COMMAND");
  }
}

void setup() {
  Serial.begin(115200);
  gateServo.attach(SERVO_PIN);
  stopGateServo();
  delay(500);
  Serial.println("ACK DISPENSER_GATE_READY state=CLOSED pin=D9");
  printHelp();
}

void loop() {
  if (Serial.available() > 0) {
    handleCommand(Serial.readStringUntil('\n'));
  }
}
