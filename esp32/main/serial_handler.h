#pragma once

#include "loadcell_control.h"
#include "motor_control.h"
#include "presence_control.h"
#include "servo_control.h"
#include "water_pump_control.h"

void printHelp() {
  Serial.println("Commands:");
  Serial.println("  FORWARD, BACKWARD, STOP");
  Serial.println("  LEFT is an alias for BACKWARD, RIGHT is an alias for FORWARD");
  Serial.println("  SPEED 0-255");
  Serial.println("  WATER/PUMP_ON continuous, PUMP_OFF, PUMP_MS 1-90000 timed");
  Serial.println("  PUMP_SPEED 0-255");
  Serial.println("  LOAD, LOAD1, LOAD2, LOAD_RAW, LOAD1_RAW, LOAD2_RAW");
  Serial.println("  LOAD_COUNT, LOAD1_COUNT, LOAD2_COUNT");
  Serial.println("  LOAD_TARE, LOAD1_TARE, LOAD2_TARE, LOAD_SCALE value");
  Serial.println("  LOAD1_SCALE value, LOAD2_SCALE value");
  Serial.println("  PINOUT");
  Serial.println("  WIFI_SETUP opens the Wi-Fi/MQTT setup portal");
  Serial.println("  NET_STATUS prints Wi-Fi and MQTT status");
  Serial.println("  PRESENCE_STATUS prints PIR sensor state");
  Serial.println("  PRESENCE_WATER_TEST seconds waits for PIR, then runs the pump");
  Serial.println("  PING");
  Serial.println("  CAM_UP, CAM_DOWN, CAM_LEFT, CAM_RIGHT, CAM_CENTER, FEED");
}

void executeSerialCommand(String command) {
  command.trim();

  if (command.length() == 0) return;

  if (command == "FORWARD") moveForward();
  else if (command == "BACKWARD") moveBackward();
  else if (command == "LEFT") turnLeft();
  else if (command == "RIGHT") turnRight();
  else if (command == "STOP") stopMotors();
  else if (command.startsWith("SPEED ")) {
    setMotorSpeed(command.substring(6).toInt());
    Serial.print("ACK SPEED ");
    Serial.println(motorSpeed);
  }
  else if (command == "WATER") startWaterPump();
  else if (command == "PUMP_ON") startWaterPump();
  else if (command == "PUMP_OFF") {
    stopWaterPump();
    Serial.println("ACK WATER_PUMP_OFF");
  }
  else if (command.startsWith("PUMP_MS ")) startWaterPumpFor(command.substring(8).toInt());
  else if (command.startsWith("PUMP_SPEED ")) setWaterPumpSpeed(command.substring(11).toInt());
  else if (command == "PUMP_REVERSE_TEST") reverseWaterPumpPinsForTest();
  else if (command == "PINOUT") {
    printMotorPinout();
    printWaterPumpPinout();
    printLoadCellPinout();
  }
  else if (command == "LOAD") printLoadCellValue();
  else if (command == "LOAD1") printLoadCell1Value();
  else if (command == "LOAD2") printLoadCell2Value();
  else if (command == "LOAD_RAW") printLoadCellRaw();
  else if (command == "LOAD1_RAW") printLoadCell1Raw();
  else if (command == "LOAD2_RAW") printLoadCell2Raw();
  else if (command == "LOAD_COUNT") printLoadCellCount();
  else if (command == "LOAD1_COUNT") printLoadCell1Count();
  else if (command == "LOAD2_COUNT") printLoadCell2Count();
  else if (command == "LOAD_TARE") tareLoadCell();
  else if (command == "LOAD1_TARE") tareLoadCell1();
  else if (command == "LOAD2_TARE") tareLoadCell2();
  else if (command.startsWith("LOAD_SCALE ")) setLoadCellScale(command.substring(11).toFloat());
  else if (command.startsWith("LOAD1_SCALE ")) setLoadCell1Scale(command.substring(12).toFloat());
  else if (command.startsWith("LOAD2_SCALE ")) setLoadCell2Scale(command.substring(12).toFloat());
  else if (command == "PING") Serial.println("ACK PONG");
  else if (command == "WIFI_SETUP") startWifiSetupPortal();
  else if (command == "NET_STATUS") printNetworkStatus();
  else if (command == "PRESENCE_STATUS") printPresenceStatus();
  else if (command.startsWith("PRESENCE_WATER_TEST ")) {
    int seconds = command.substring(20).toInt();
    if (seconds < 30 || seconds > 90) {
      Serial.println("ERR PRESENCE_WATER_TEST_RANGE 30-90");
    } else {
      requestScheduledWater(seconds, "serial-test", "", "");
      Serial.println(scheduledWaterPending
          ? "ACK PRESENCE_WATER_TEST WAITING_FOR_DETECTION"
          : "ACK PRESENCE_WATER_TEST STARTED");
    }
  }
  else if (command == "HELP") printHelp();
  else if (command == "CAM_UP") cameraUp();
  else if (command == "CAM_DOWN") cameraDown();
  else if (command == "CAM_LEFT") cameraLeft();
  else if (command == "CAM_RIGHT") cameraRight();
  else if (command == "CAM_CENTER") cameraCenter();
  else if (command == "FEED") feedOnce();
  else {
    Serial.print("ERR UNKNOWN ");
    Serial.println(command);
  }
}

void handleSerialCommand() {
  static char commandBuffer[64];
  static uint8_t commandLength = 0;

  while (Serial.available() > 0) {
    char input = static_cast<char>(Serial.read());

    if (input == '\r') {
      continue;
    }

    if (input == '\n') {
      commandBuffer[commandLength] = '\0';
      executeSerialCommand(String(commandBuffer));
      commandLength = 0;
      continue;
    }

    if (commandLength < sizeof(commandBuffer) - 1) {
      commandBuffer[commandLength++] = input;
    } else {
      commandLength = 0;
      Serial.println("ERR COMMAND_TOO_LONG");
    }
  }
}
