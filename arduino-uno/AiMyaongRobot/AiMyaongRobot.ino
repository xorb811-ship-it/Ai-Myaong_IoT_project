#include "command_handler.h"
#include "motor_control.h"
#include "servo_control.h"

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(50);
  setupMotors();
  setupServos();
  Serial.println("AiMyaongRobot ready");
}

void loop() {
  processIncomingCommands();
}
