#include "loadcell_control.h"
#include "motor_control.h"
#include "presence_control.h"
#include "mqtt_control.h"
#include "serial_handler.h"
#include "servo_control.h"
#include "water_pump_control.h"

void setup() {
  Serial.begin(115200);
  setupMotors();
  setupServos();
  setupWaterPump();
  setupLoadCell();
  setupPresenceSensor();
  printMotorPinout();
  printWaterPumpPinout();
  printLoadCellPinout();
  printHelp();
  setupMqttControl();
}

void loop() {
  handleSerialCommand();
  loopMqttControl();
  serviceMotors();
  serviceWaterPump();
  serviceLoadCell();
  servicePresenceSensor();
}
