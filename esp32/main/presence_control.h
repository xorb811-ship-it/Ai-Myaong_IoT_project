#pragma once

#include <Arduino.h>
#include <Preferences.h>

#include "water_pump_control.h"

// HC-SR501 PIR sensor: OUT -> GPIO21, VCC -> 5V, GND -> GND.
constexpr uint8_t PRESENCE_SENSOR_PIN = 21;
constexpr unsigned long PRESENCE_WARMUP_MS = 60000;
constexpr unsigned long PRESENCE_PULSE_WINDOW_MS = 8000;
constexpr unsigned long PRESENCE_DETECTED_HOLD_MS = 3000;
constexpr uint8_t PRESENCE_REQUIRED_PULSES = 1;
constexpr unsigned long SCHEDULED_WATER_WAIT_MS = 10UL * 60UL * 1000UL;
constexpr const char* PRESENCE_PREFS_NAMESPACE = "aimyaong-pir";

bool presenceGateEnabled = false;
bool scheduledWaterPending = false;
int pendingWaterAmount = 0;
unsigned long presenceReadyAtMs = 0;
unsigned long scheduledWaterExpiresAtMs = 0;
String pendingWaterRequestId;
String pendingWaterUserId;
String pendingWaterPetId;
String presenceWaterEvent;
int presenceWaterEventAmount = 0;
String presenceWaterEventRequestId;
String presenceWaterEventUserId;
String presenceWaterEventPetId;
int lastPresenceRawState = -1;
unsigned long presencePulseWindowStartMs = 0;
unsigned long lastPresenceDetectedAtMs = 0;
uint8_t presencePulseCount = 0;
bool pendingPresenceArmed = false;

void queuePresenceWaterEvent(const char* eventName, int amount) {
  presenceWaterEvent = eventName;
  presenceWaterEventAmount = amount;
  presenceWaterEventRequestId = pendingWaterRequestId;
  presenceWaterEventUserId = pendingWaterUserId;
  presenceWaterEventPetId = pendingWaterPetId;
}

void clearPendingWaterMetadata() {
  pendingWaterRequestId = "";
  pendingWaterUserId = "";
  pendingWaterPetId = "";
}

void savePresenceGateEnabled() {
  Preferences preferences;
  if (preferences.begin(PRESENCE_PREFS_NAMESPACE, false)) {
    preferences.putBool("enabled", presenceGateEnabled);
    preferences.end();
  }
}

void setupPresenceSensor() {
  pinMode(PRESENCE_SENSOR_PIN, INPUT);
  Preferences preferences;
  if (preferences.begin(PRESENCE_PREFS_NAMESPACE, true)) {
    presenceGateEnabled = preferences.getBool("enabled", false);
    preferences.end();
  }
  presenceReadyAtMs = millis() + PRESENCE_WARMUP_MS;
  Serial.print("[presence] gate=");
  Serial.println(presenceGateEnabled ? "enabled" : "disabled");
}

bool isPresenceDetected() {
  return millis() >= presenceReadyAtMs &&
         lastPresenceDetectedAtMs != 0 &&
         millis() - lastPresenceDetectedAtMs <= PRESENCE_DETECTED_HOLD_MS;
}

bool recordPresencePulse() {
  const unsigned long now = millis();
  if (presencePulseWindowStartMs == 0 ||
      now - presencePulseWindowStartMs > PRESENCE_PULSE_WINDOW_MS) {
    presencePulseWindowStartMs = now;
    presencePulseCount = 0;
  }

  presencePulseCount++;
  if (presencePulseCount >= PRESENCE_REQUIRED_PULSES) {
    lastPresenceDetectedAtMs = now;
    presencePulseWindowStartMs = now;
    presencePulseCount = 0;
    return true;
  }

  return false;
}

void printPresenceStatus() {
  const int raw = digitalRead(PRESENCE_SENSOR_PIN);
  const bool warmingUp = static_cast<long>(millis() - presenceReadyAtMs) < 0;
  Serial.println("[presence] status");
  Serial.print("[presence] pin=GPIO");
  Serial.println(PRESENCE_SENSOR_PIN);
  Serial.print("[presence] gate=");
  Serial.println(presenceGateEnabled ? "enabled" : "disabled");
  Serial.print("[presence] warmup=");
  Serial.println(warmingUp ? "waiting" : "ready");
  Serial.print("[presence] raw=");
  Serial.println(raw);
  Serial.print("[presence] detected=");
  Serial.println(isPresenceDetected() ? "true" : "false");
  Serial.print("[presence] pulse_count=");
  Serial.println(presencePulseCount);
  Serial.print("[presence] scheduled_water_pending=");
  Serial.println(scheduledWaterPending ? "true" : "false");
}

void setPresenceGateEnabled(bool enabled) {
  presenceGateEnabled = enabled;
  savePresenceGateEnabled();
  Serial.print("[presence] gate changed: ");
  Serial.println(enabled ? "enabled" : "disabled");

  if (!enabled && scheduledWaterPending) {
    int amount = pendingWaterAmount;
    queuePresenceWaterEvent("executed", amount);
    scheduledWaterPending = false;
    pendingPresenceArmed = false;
    pendingWaterAmount = 0;
    clearPendingWaterMetadata();
    dispenseWaterSeconds(amount);
    Serial.println("[presence] pending scheduled water released because gate was disabled");
  }
}

void requestScheduledWater(int amount, const String& requestId, const String& userId, const String& petId) {
  pendingWaterRequestId = requestId;
  pendingWaterUserId = userId;
  pendingWaterPetId = petId;

  if (!presenceGateEnabled) {
    queuePresenceWaterEvent("executed", amount);
    clearPendingWaterMetadata();
    dispenseWaterSeconds(amount);
    Serial.println("[presence] scheduled water started immediately");
    return;
  }

  pendingWaterAmount = amount;
  scheduledWaterPending = true;
  presencePulseWindowStartMs = 0;
  presencePulseCount = 0;
  lastPresenceDetectedAtMs = 0;
  // A HIGH that already existed before the schedule may be PIR startup/noise.
  // Arm only after LOW is observed, then accept fresh pulses.
  pendingPresenceArmed = digitalRead(PRESENCE_SENSOR_PIN) == LOW;
  scheduledWaterExpiresAtMs = millis() + SCHEDULED_WATER_WAIT_MS;
  Serial.println("[presence] scheduled water waiting for cat detection");
}

void servicePresenceSensor() {
  if (static_cast<long>(millis() - presenceReadyAtMs) >= 0) {
    const int raw = digitalRead(PRESENCE_SENSOR_PIN);
    if (raw != lastPresenceRawState) {
      lastPresenceRawState = raw;
      if (raw == HIGH) {
        recordPresencePulse();
      } else {
        if (scheduledWaterPending) pendingPresenceArmed = true;
      }
      Serial.print("[presence] sensor changed: ");
      Serial.println(raw == HIGH ? "DETECTED" : "CLEAR");
    }
  }

  if (!scheduledWaterPending) return;

  if (static_cast<long>(millis() - scheduledWaterExpiresAtMs) >= 0) {
    int amount = pendingWaterAmount;
    queuePresenceWaterEvent("skipped", amount);
    scheduledWaterPending = false;
    pendingPresenceArmed = false;
    pendingWaterAmount = 0;
    clearPendingWaterMetadata();
    Serial.println("[presence] scheduled water canceled: detection timeout");
    return;
  }

  if (pendingPresenceArmed && isPresenceDetected()) {
    int amount = pendingWaterAmount;
    queuePresenceWaterEvent("executed", amount);
    scheduledWaterPending = false;
    pendingPresenceArmed = false;
    pendingWaterAmount = 0;
    clearPendingWaterMetadata();
    Serial.println("[presence] cat detected; starting scheduled water");
    dispenseWaterSeconds(amount);
  }
}
