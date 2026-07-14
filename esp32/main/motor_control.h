#pragma once

#include <Arduino.h>

// ESP32 DevKit + TB6612FNG temporary single motor test wiring.
// Avoid GPIO0/2/4/5/12/15 boot strap pins and GPIO34-39 input-only pins.
constexpr uint8_t MOTOR_IN1_PIN = 25;      // AIN1
constexpr uint8_t MOTOR_IN2_PIN = 26;      // AIN2
constexpr uint8_t MOTOR_PWM_PIN = 27;      // PWMA
constexpr uint8_t MOTOR_STANDBY_PIN = 23;  // STBY

constexpr uint8_t DEFAULT_MOTOR_SPEED = 160;
constexpr int FOOD_DISPENSE_DIRECTION = -1;
constexpr unsigned long MOTOR_COMMAND_TIMEOUT_MS = 800;
constexpr unsigned long FOOD_MOTOR_MS_PER_AMOUNT = 250;
constexpr unsigned long FOOD_MOTOR_MIN_RUN_MS = 300;
constexpr unsigned long FOOD_MOTOR_MAX_RUN_MS = 8000;

uint8_t motorSpeed = DEFAULT_MOTOR_SPEED;
unsigned long lastMotorCommandMs = 0;
unsigned long motorStopAt = 0;

void stopMotors();

inline void writeMotor(uint8_t in1Pin, uint8_t in2Pin, uint8_t pwmPin, int direction, uint8_t speed) {
  if (direction > 0) {
    digitalWrite(in1Pin, HIGH);
    digitalWrite(in2Pin, LOW);
    analogWrite(pwmPin, speed);
  } else if (direction < 0) {
    digitalWrite(in1Pin, LOW);
    digitalWrite(in2Pin, HIGH);
    analogWrite(pwmPin, speed);
  } else {
    digitalWrite(in1Pin, LOW);
    digitalWrite(in2Pin, LOW);
    analogWrite(pwmPin, 0);
  }
}

inline void driveMotor(int direction, uint8_t speed = motorSpeed) {
  writeMotor(MOTOR_IN1_PIN, MOTOR_IN2_PIN, MOTOR_PWM_PIN, direction, speed);
}

inline void markMotorCommandActive() {
  lastMotorCommandMs = millis();
}

void setupMotors() {
  pinMode(MOTOR_IN1_PIN, OUTPUT);
  pinMode(MOTOR_IN2_PIN, OUTPUT);
  pinMode(MOTOR_PWM_PIN, OUTPUT);
  pinMode(MOTOR_STANDBY_PIN, OUTPUT);

  digitalWrite(MOTOR_STANDBY_PIN, HIGH);
  stopMotors();
}

void moveForward() {
  motorStopAt = 0;
  markMotorCommandActive();
  driveMotor(1);
}

void moveBackward() {
  motorStopAt = 0;
  markMotorCommandActive();
  driveMotor(-1);
}

void turnLeft() {
  moveBackward();
}

void turnRight() {
  moveForward();
}

void stopMotors() {
  driveMotor(0, 0);
  motorStopAt = 0;
}

void serviceMotors() {
  if (motorStopAt != 0 && static_cast<long>(millis() - motorStopAt) >= 0) {
    stopMotors();
    lastMotorCommandMs = 0;
    Serial.println("ACK FOOD_MOTOR_OFF");
    return;
  }

  if (lastMotorCommandMs != 0 && millis() - lastMotorCommandMs > MOTOR_COMMAND_TIMEOUT_MS) {
    stopMotors();
    lastMotorCommandMs = 0;
  }
}

void setMotorSpeed(int speed) {
  motorSpeed = constrain(speed, 0, 255);
}

unsigned long foodRunMsForAmount(int amount) {
  long safeAmount = amount < 1 ? 1 : amount;
  unsigned long runMs = static_cast<unsigned long>(safeAmount) * FOOD_MOTOR_MS_PER_AMOUNT;
  return constrain(runMs, FOOD_MOTOR_MIN_RUN_MS, FOOD_MOTOR_MAX_RUN_MS);
}

void dispenseFoodAmount(int amount) {
  unsigned long runMs = foodRunMsForAmount(amount);
  motorStopAt = millis() + runMs;
  lastMotorCommandMs = 0;
  driveMotor(FOOD_DISPENSE_DIRECTION, motorSpeed);

  Serial.print("ACK FOOD_MOTOR_ON amount=");
  Serial.print(amount);
  Serial.print(" run_ms=");
  Serial.print(runMs);
  Serial.print(" speed=");
  Serial.println(motorSpeed);
}

void printMotorPinout() {
  Serial.println("ESP32 TB6612FNG single motor pinout:");
  Serial.println("  AIN1 -> GPIO25");
  Serial.println("  AIN2 -> GPIO26");
  Serial.println("  PWMA -> GPIO27");
  Serial.println("  STBY -> GPIO23");
  Serial.println("  TB6612 VCC -> ESP32 3V3");
  Serial.println("  TB6612 VM -> 12V motor supply");
  Serial.println("  TB6612 GND -> ESP32 GND and 12V supply GND");
}
