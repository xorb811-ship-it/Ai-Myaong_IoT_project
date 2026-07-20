#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include "HX711.h"

// Two HX711 load cell channels for dispenser weight tests.
// GPIO34 and GPIO35 are input-only, so they are suitable for HX711 DOUT.
constexpr uint8_t LOADCELL_1_DOUT_PIN = 34;
constexpr uint8_t LOADCELL_1_SCK_PIN = 33;
constexpr uint8_t LOADCELL_2_DOUT_PIN = 35;
constexpr uint8_t LOADCELL_2_SCK_PIN = 22;
// Calibrated from a 40 g reference: reading changed -5.18 g with the old
// -7050 factor, so raw delta / 40 g gives a corrected factor of +912.98.
constexpr float LOADCELL_1_DEFAULT_SCALE = 913.0f;
constexpr float LOADCELL_2_DEFAULT_SCALE = -7050.0f;
constexpr unsigned long LOADCELL_PRINT_INTERVAL_MS = 1000;

// 배출/급수 중에는 저울이 흔들려 값이 튄다. 액추에이터가 멈추고 이만큼 지나야 믿는다.
constexpr unsigned long LOADCELL_SETTLE_MS = 1500;

HX711 loadCell1;
HX711 loadCell2;
float loadCell1Scale = LOADCELL_1_DEFAULT_SCALE;
float loadCell2Scale = LOADCELL_2_DEFAULT_SCALE;
unsigned long lastLoadCellPrintMs = 0;

// 마지막으로 '실제로 읽은' 값. HX711 은 약 10Hz 라 대부분의 순간에 is_ready() 가 false 인데,
// 그때 0 을 내보내면 진짜 값과 가짜 0 이 번갈아 나가서 잔여량이 튄다. 그래서 마지막 값을 들고 있는다.
bool loadCell1HasValue = false;
bool loadCell2HasValue = false;
float loadCell1Grams = 0.0f;
float loadCell2Grams = 0.0f;
unsigned long loadCellSettleUntilMs = 0;

// 배식 1회의 실제 배출량을 재기 위한 표식.
bool foodDispensePending = false;
float foodGramsBeforeDispense = 0.0f;

inline bool loadCellSettled() {
  return static_cast<long>(millis() - loadCellSettleUntilMs) >= 0;
}

inline void holdLoadCellSettle() {
  loadCellSettleUntilMs = millis() + LOADCELL_SETTLE_MS;
}

// tare 영점을 NVS 에 저장해 재부팅 후에도 유지한다. 안 그러면 껐다 켤 때마다
// 통을 비우고 다시 영점을 잡아야 한다.
constexpr const char* LOADCELL_PREFS_NAMESPACE = "aimyaong-load";

void saveLoadCellOffset(const char* key, long offset) {
  Preferences preferences;
  if (!preferences.begin(LOADCELL_PREFS_NAMESPACE, false)) {
    Serial.println("ERR LOADCELL_OFFSET_SAVE_FAILED");
    return;
  }
  preferences.putLong(key, offset);
  preferences.end();
}

bool restoreLoadCellOffset(HX711& scale, const char* key) {
  Preferences preferences;
  if (!preferences.begin(LOADCELL_PREFS_NAMESPACE, true)) {
    return false;
  }
  bool saved = preferences.isKey(key);
  long offset = saved ? preferences.getLong(key, 0) : 0;
  preferences.end();
  if (saved) {
    scale.set_offset(offset);
  }
  return saved;
}

void setupOneLoadCell(HX711& scale, float scaleFactor, const char* label, const char* offsetKey, uint8_t doutPin, uint8_t sckPin) {
  scale.begin(doutPin, sckPin);
  scale.set_scale(scaleFactor);

  if (scale.is_ready()) {
    Serial.print("ACK ");
    Serial.print(label);
    if (restoreLoadCellOffset(scale, offsetKey)) {
      Serial.println("_READY offset=restored");
    } else {
      scale.tare();
      saveLoadCellOffset(offsetKey, scale.get_offset());
      Serial.println("_READY tare=done offset=saved");
    }
  } else {
    Serial.print("WARN ");
    Serial.print(label);
    Serial.println("_NOT_READY");
  }
}

void setupLoadCell() {
  setupOneLoadCell(loadCell1, loadCell1Scale, "LOADCELL1", "offset1", LOADCELL_1_DOUT_PIN, LOADCELL_1_SCK_PIN);
  setupOneLoadCell(loadCell2, loadCell2Scale, "LOADCELL2", "offset2", LOADCELL_2_DOUT_PIN, LOADCELL_2_SCK_PIN);
}

void tareOneLoadCell(HX711& scale, const char* label, const char* offsetKey) {
  if (!scale.is_ready()) {
    Serial.print("ERR ");
    Serial.print(label);
    Serial.println("_NOT_READY");
    return;
  }

  scale.tare();
  saveLoadCellOffset(offsetKey, scale.get_offset());
  Serial.print("ACK ");
  Serial.print(label);
  Serial.println("_TARE offset=saved");
}

void tareLoadCell() {
  tareOneLoadCell(loadCell1, "LOADCELL1", "offset1");
  tareOneLoadCell(loadCell2, "LOADCELL2", "offset2");
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
  tareOneLoadCell(loadCell1, "LOADCELL1", "offset1");
}

void tareLoadCell2() {
  tareOneLoadCell(loadCell2, "LOADCELL2", "offset2");
}

void setLoadCell1Scale(float scale) {
  setOneLoadCellScale(loadCell1, loadCell1Scale, "LOADCELL1", scale);
}

void setLoadCell2Scale(float scale) {
  setOneLoadCellScale(loadCell2, loadCell2Scale, "LOADCELL2", scale);
}

// 오거를 돌리기 직전 무게를 적어둔다. 로드셀 값을 아직 한 번도 못 읽었으면 잴 수가 없으니
// 표식을 세우지 않는다 — 그 경우 배출량은 기록되지 않는다(지어내는 것보다 낫다).
void markFoodDispenseStart() {
  if (!loadCell1HasValue) {
    return;
  }
  foodGramsBeforeDispense = loadCell1Grams;
  foodDispensePending = true;
}

// 오거가 멈추고 저울이 잠잠해졌으면 이번 배식의 실제 배출량을 돌려준다.
// 아직 잴 때가 아니거나 잴 게 없으면 -1. (mqtt_control.h 가 이 값을 발행한다)
float takeFoodDispensedGrams() {
  if (!foodDispensePending || !loadCellSettled() || !loadCell1HasValue) {
    return -1.0f;
  }
  foodDispensePending = false;

  float grams = foodGramsBeforeDispense - loadCell1Grams;
  return grams < 0.0f ? 0.0f : grams;  // 사람이 통을 채웠거나 저울이 흔들린 경우
}

// 배식/급수 중이면 밖에서 이걸 불러 측정을 미룬다. (mqtt_control.h 가 호출)
void sampleLoadCells() {
  if (!loadCellSettled()) {
    return;
  }
  // is_ready() 로 막지 않으면 read() 가 변환을 기다리며 루프를 붙잡는다 —
  // 그동안 serviceMotors()/serviceWaterPump() 가 밀려 모터가 더 돈다.
  if (loadCell1.is_ready()) {
    loadCell1Grams = loadCell1.get_units(1);
    loadCell1HasValue = true;
  }
  if (loadCell2.is_ready()) {
    loadCell2Grams = loadCell2.get_units(1);
    loadCell2HasValue = true;
  }
}

void serviceLoadCell() {
  // MQTT 주기 발행은 loopMqttControl() 이 한다. 여기서는 값만 최신으로 유지한다.
  sampleLoadCells();

  unsigned long now = millis();
  if (now - lastLoadCellPrintMs < LOADCELL_PRINT_INTERVAL_MS) {
    return;
  }
  lastLoadCellPrintMs = now;

  // 보정용 시리얼 출력. get_units() 를 다시 부르지 않고 sampleLoadCells() 가 읽어둔 값을 쓴다 —
  // get_units() 는 HX711 변환값을 소비해서, 여기서 또 부르면 샘플러와 변환을 서로 뺏는다.
  // 같은 값을 쓰므로 시리얼에 찍히는 무게가 앱에 보이는 무게와 항상 일치한다.
  Serial.print("[loadcell] food=");
  if (loadCell1HasValue) {
    Serial.print(loadCell1Grams, 2);
    Serial.print("g");
  } else {
    Serial.print("NOT_READY");
  }

  Serial.print(" water=");
  if (loadCell2HasValue) {
    Serial.print(loadCell2Grams, 2);
    Serial.println("g");
  } else {
    Serial.println("NOT_READY");
  }
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
