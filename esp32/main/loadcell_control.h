#pragma once

#include <Arduino.h>
#include "HX711.h"

// Two HX711 load cell channels for dispenser weight tests.
// GPIO34 and GPIO35 are input-only, so they are suitable for HX711 DOUT.
constexpr uint8_t LOADCELL_1_DOUT_PIN = 34;
constexpr uint8_t LOADCELL_1_SCK_PIN = 33;
constexpr uint8_t LOADCELL_2_DOUT_PIN = 35;
constexpr uint8_t LOADCELL_2_SCK_PIN = 22;
constexpr float LOADCELL_DEFAULT_SCALE = -7050.0f;
constexpr unsigned long LOADCELL_PRINT_INTERVAL_MS = 1000;

HX711 loadCell1;
HX711 loadCell2;
float loadCell1Scale = LOADCELL_DEFAULT_SCALE;
float loadCell2Scale = LOADCELL_DEFAULT_SCALE;
unsigned long lastLoadCellPrintMs = 0;

void setupOneLoadCell(HX711& scale, float scaleFactor, const char* label, uint8_t doutPin, uint8_t sckPin) {
  scale.begin(doutPin, sckPin);
  scale.set_scale(scaleFactor);

  if (scale.is_ready()) {
    scale.tare();
    Serial.print("ACK ");
    Serial.print(label);
    Serial.println("_READY tare=done");
  } else {
    Serial.print("WARN ");
    Serial.print(label);
    Serial.println("_NOT_READY");
  }
}

void setupLoadCell() {
  setupOneLoadCell(loadCell1, loadCell1Scale, "LOADCELL1", LOADCELL_1_DOUT_PIN, LOADCELL_1_SCK_PIN);
  setupOneLoadCell(loadCell2, loadCell2Scale, "LOADCELL2", LOADCELL_2_DOUT_PIN, LOADCELL_2_SCK_PIN);
}

void tareOneLoadCell(HX711& scale, const char* label) {
  if (!scale.is_ready()) {
    Serial.print("ERR ");
    Serial.print(label);
    Serial.println("_NOT_READY");
    return;
  }

  scale.tare();
  Serial.print("ACK ");
  Serial.print(label);
  Serial.println("_TARE");
}

void tareLoadCell() {
  tareOneLoadCell(loadCell1, "LOADCELL1");
  tareOneLoadCell(loadCell2, "LOADCELL2");
}

void setOneLoadCellScale(HX711& scale, float& scaleFactor, const char* label, float newScaleFactor) {
  if (newScaleFactor == 0.0f) {
    Serial.println("ERR LOADCELL_SCALE_ZERO");
    return;
  }

  scaleFactor = newScaleFactor;
  scale.set_scale(scaleFactor);
  Serial.print("ACK ");
  Serial.print(label);
  Serial.print("_SCALE ");
  Serial.println(scaleFactor, 4);
}

void setLoadCellScale(float scale) {
  setOneLoadCellScale(loadCell1, loadCell1Scale, "LOADCELL1", scale);
  setOneLoadCellScale(loadCell2, loadCell2Scale, "LOADCELL2", scale);
}

void printOneLoadCellValue(HX711& scale, const char* label, uint8_t samples) {
  if (!scale.is_ready()) {
    Serial.print("ERR ");
    Serial.print(label);
    Serial.println("_NOT_READY");
    return;
  }

  long counts = scale.get_value(samples);
  float units = scale.get_units(samples);
  Serial.print(label);
  Serial.print(" unit=");
  Serial.println(units, 2);
  Serial.print(label);
  Serial.print("_COUNT ");
  Serial.println(counts);
}

void printLoadCellValue() {
  printOneLoadCellValue(loadCell1, "LOADCELL1", 3);
  printOneLoadCellValue(loadCell2, "LOADCELL2", 3);
}

void printOneLoadCellRaw(HX711& scale, const char* label) {
  if (!scale.is_ready()) {
    Serial.print("ERR ");
    Serial.print(label);
    Serial.println("_NOT_READY");
    return;
  }

  Serial.print(label);
  Serial.print("_RAW ");
  Serial.println(scale.read_average(3));
}

void printOneLoadCellCount(HX711& scale, const char* label) {
  if (!scale.is_ready()) {
    Serial.print("ERR ");
    Serial.print(label);
    Serial.println("_NOT_READY");
    return;
  }

  Serial.print(label);
  Serial.print("_COUNT ");
  Serial.println(scale.get_value(3));
}

void printLoadCellRaw() {
  printOneLoadCellRaw(loadCell1, "LOADCELL1");
  printOneLoadCellRaw(loadCell2, "LOADCELL2");
}

void printLoadCellCount() {
  printOneLoadCellCount(loadCell1, "LOADCELL1");
  printOneLoadCellCount(loadCell2, "LOADCELL2");
}

void printLoadCell1Value() {
  printOneLoadCellValue(loadCell1, "LOADCELL1", 3);
}

void printLoadCell2Value() {
  printOneLoadCellValue(loadCell2, "LOADCELL2", 3);
}

void printLoadCell1Raw() {
  printOneLoadCellRaw(loadCell1, "LOADCELL1");
}

void printLoadCell2Raw() {
  printOneLoadCellRaw(loadCell2, "LOADCELL2");
}

void printLoadCell1Count() {
  printOneLoadCellCount(loadCell1, "LOADCELL1");
}

void printLoadCell2Count() {
  printOneLoadCellCount(loadCell2, "LOADCELL2");
}

void tareLoadCell1() {
  tareOneLoadCell(loadCell1, "LOADCELL1");
}

void tareLoadCell2() {
  tareOneLoadCell(loadCell2, "LOADCELL2");
}

void setLoadCell1Scale(float scale) {
  setOneLoadCellScale(loadCell1, loadCell1Scale, "LOADCELL1", scale);
}

void setLoadCell2Scale(float scale) {
  setOneLoadCellScale(loadCell2, loadCell2Scale, "LOADCELL2", scale);
}

void serviceLoadCell() {
  // Periodic serial output is intentionally disabled. MQTT weight publishing
  // and the explicit LOAD/LOAD1/LOAD2 serial commands remain available.
}

void printLoadCellPinout() {
  Serial.println("HX711 load cell 1 pinout:");
  Serial.println("  DOUT/DT -> GPIO34");
  Serial.println("  SCK/CLK -> GPIO33");
  Serial.println("  VCC -> ESP32 3V3");
  Serial.println("  GND -> ESP32 GND");
  Serial.println("HX711 load cell 2 pinout:");
  Serial.println("  DOUT/DT -> GPIO35");
  Serial.println("  SCK/CLK -> GPIO22");
  Serial.println("  VCC -> ESP32 3V3");
  Serial.println("  GND -> ESP32 GND");
}
