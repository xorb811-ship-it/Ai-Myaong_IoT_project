#include "motor_control.h"
#include "serial_handler.h"
#include "servo_control.h"

void setup() {
  Serial.begin(115200);
  setupMotors();
  setupServos();
}

void loop() {
  handleSerialCommand();
}
