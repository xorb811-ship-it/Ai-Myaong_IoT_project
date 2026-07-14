#pragma once

#include <Arduino.h>

// TB6612FNG A channel for the food dispenser motor.
// Tune FOOD_MOTOR_MS_PER_AMOUNT after measuring how much food is dispensed.
constexpr uint8_t FOOD_MOTOR_IN1_PIN = 25;      // AIN1
constexpr uint8_t FOOD_MOTOR_IN2_PIN = 26;      // AIN2
constexpr uint8_t FOOD_MOTOR_PWM_PIN = 27;      // PWMA
constexpr uint8_t FOOD_MOTOR_STANDBY_PIN = 23;  // STBY

constexpr uint8_t FOOD_MOTOR_SPEED = 180;
constexpr unsigned long FOOD_MOTOR_MS_PER_AMOUNT = 250;
constexpr unsigned long FOOD_MOTOR_MIN_RUN_MS = 300;
constexpr unsigned long FOOD_MOTOR_MAX_RUN_MS = 8000;

unsigned long foodMotorStopAt = 0;

inline unsigned long foodRunMsForAmount(int amount) {
  long safeAmount = amount < 1 ? 1 : amount;
  unsigned long runMs = static_cast<unsigned long>(safeAmount) * FOOD_MOTOR_MS_PER_AMOUNT;
  return constrain(runMs, FOOD_MOTOR_MIN_RUN_MS, FOOD_MOTOR_MAX_RUN_MS);
}

inline void runFoodMotor(uint8_t speed) {
  digitalWrite(FOOD_MOTOR_STANDBY_PIN, HIGH);
  // The auger dispenses food when the motor runs in reverse.
  digitalWrite(FOOD_MOTOR_IN1_PIN, LOW);
  digitalWrite(FOOD_MOTOR_IN2_PIN, HIGH);
  analogWrite(FOOD_MOTOR_PWM_PIN, speed);
}

inline void stopFoodMotor() {
  digitalWrite(FOOD_MOTOR_IN1_PIN, LOW);
  digitalWrite(FOOD_MOTOR_IN2_PIN, LOW);
  analogWrite(FOOD_MOTOR_PWM_PIN, 0);
}

inline void setupActuators() {
  pinMode(FOOD_MOTOR_IN1_PIN, OUTPUT);
  pinMode(FOOD_MOTOR_IN2_PIN, OUTPUT);
  pinMode(FOOD_MOTOR_PWM_PIN, OUTPUT);
  pinMode(FOOD_MOTOR_STANDBY_PIN, OUTPUT);

  digitalWrite(FOOD_MOTOR_STANDBY_PIN, HIGH);
  stopFoodMotor();
}

inline void dispenseFood(int amount) {
  unsigned long runMs = foodRunMsForAmount(amount);
  foodMotorStopAt = millis() + runMs;
  runFoodMotor(FOOD_MOTOR_SPEED);

  Serial.print("[food] dispensing amount=");
  Serial.print(amount);
  Serial.print(" run_ms=");
  Serial.println(runMs);
}

inline void dispenseWater(int amount) {
  // TODO: implement water dispensing.
  Serial.print("[water] requested amount=");
  Serial.println(amount);
}

inline void serviceActuators() {
  if (foodMotorStopAt != 0 && static_cast<long>(millis() - foodMotorStopAt) >= 0) {
    stopFoodMotor();
    foodMotorStopAt = 0;
    Serial.println("[food] motor stopped");
  }
}
