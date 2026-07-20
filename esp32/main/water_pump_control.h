#pragma once

#include <Arduino.h>

// One-direction water pump control through a logic-level N-channel MOSFET.
// GPIO32 drives the MOSFET gate through a small resistor.
constexpr uint8_t WATER_PUMP_GATE_PIN = 32;
constexpr uint8_t WATER_PUMP_DEFAULT_SPEED = 200;
constexpr unsigned long WATER_PUMP_DEFAULT_RUN_MS = 1000;
constexpr unsigned long WATER_PUMP_MAX_RUN_MS = 90000;
// 물통이 저수조 겸 음수대라 펌프를 돌려도 물이 통 밖으로 나가지 않는다(순환).
// 'ml 급수'가 성립하지 않아 '몇 초 돌릴지'로만 지시한다.
constexpr unsigned long WATER_PUMP_MS_PER_SECOND = 1000;
constexpr unsigned long WATER_PUMP_MIN_RUN_MS = 300;

unsigned long waterPumpStopAt = 0;
uint8_t waterPumpSpeed = WATER_PUMP_DEFAULT_SPEED;
bool waterPumpRunning = false;

void stopWaterPump();

void setupWaterPump() {
  pinMode(WATER_PUMP_GATE_PIN, OUTPUT);
  stopWaterPump();
}

void runWaterPumpOutput() {
  analogWrite(WATER_PUMP_GATE_PIN, waterPumpSpeed);
}

void startWaterPump() {
  waterPumpStopAt = 0;
  waterPumpRunning = true;
  runWaterPumpOutput();

  Serial.print("ACK WATER_PUMP_ON continuous speed=");
  Serial.println(waterPumpSpeed);
}

void startWaterPumpFor(unsigned long runMs) {
  unsigned long safeRunMs = constrain(runMs, 1UL, WATER_PUMP_MAX_RUN_MS);
  waterPumpStopAt = millis() + safeRunMs;
  waterPumpRunning = true;
  runWaterPumpOutput();

  Serial.print("ACK WATER_PUMP_ON ");
  Serial.print(safeRunMs);
  Serial.print("ms speed=");
  Serial.print(waterPumpSpeed);
  Serial.println();
}

unsigned long waterRunMsForSeconds(int seconds) {
  long safeSeconds = constrain(seconds, 30, 90);
  unsigned long runMs = static_cast<unsigned long>(safeSeconds) * WATER_PUMP_MS_PER_SECOND;
  return constrain(runMs, WATER_PUMP_MIN_RUN_MS, WATER_PUMP_MAX_RUN_MS);
}

void dispenseWaterSeconds(int seconds) {
  unsigned long runMs = waterRunMsForSeconds(seconds);
  waterPumpStopAt = millis() + runMs;
  waterPumpRunning = true;
  runWaterPumpOutput();

  Serial.print("ACK WATER_PUMP_ON seconds=");
  Serial.print(seconds);
  Serial.print(" run_ms=");
  Serial.print(runMs);
  Serial.print(" speed=");
  Serial.println(waterPumpSpeed);
}

void setWaterPumpSpeed(int speed) {
  waterPumpSpeed = constrain(speed, 0, 255);
  Serial.print("ACK WATER_PUMP_SPEED ");
  Serial.println(waterPumpSpeed);
}

void reverseWaterPumpPinsForTest() {
  Serial.println("ERR WATER_PUMP_REVERSE_UNSUPPORTED_MOSFET");
}

void stopWaterPump() {
  analogWrite(WATER_PUMP_GATE_PIN, 0);
  waterPumpStopAt = 0;
  waterPumpRunning = false;
}

void serviceWaterPump() {
  if (waterPumpStopAt != 0 && static_cast<long>(millis() - waterPumpStopAt) >= 0) {
    stopWaterPump();
    Serial.println("ACK WATER_PUMP_OFF");
  }
}

void printWaterPumpPinout() {
  Serial.println("Water pump MOSFET pinout:");
  Serial.println("  MOSFET gate -> GPIO32 through 100-220 ohm resistor");
  Serial.println("  MOSFET source -> GND");
  Serial.println("  MOSFET drain -> water pump negative wire");
  Serial.println("  Water pump positive wire -> pump power +");
  Serial.println("  ESP32 GND -> pump power GND shared");
  Serial.println("  Flyback diode cathode(stripe) -> pump power +");
  Serial.println("  Flyback diode anode -> MOSFET drain / pump negative");
}
