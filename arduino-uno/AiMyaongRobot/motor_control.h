#pragma once

#include <Arduino.h>

// L298N default wiring. Change these constants if your wiring is different.
constexpr uint8_t LEFT_MOTOR_PWM_PIN = 5;
constexpr uint8_t LEFT_MOTOR_IN1_PIN = 4;
constexpr uint8_t LEFT_MOTOR_IN2_PIN = 7;
constexpr uint8_t RIGHT_MOTOR_PWM_PIN = 6;
constexpr uint8_t RIGHT_MOTOR_IN1_PIN = 8;
constexpr uint8_t RIGHT_MOTOR_IN2_PIN = 12;
// 6V motor supply through an L298N loses enough voltage that low PWM can stall.
// Kick briefly at full PWM, then run lower to reduce current draw and driver heat.
constexpr uint8_t MOTOR_RUN_SPEED = 220;
constexpr uint8_t MOTOR_START_SPEED = 255;
constexpr uint8_t MOTOR_START_KICK_MS = 90;

inline void stopMotors();

inline void driveLeft(int direction, uint8_t speed = MOTOR_RUN_SPEED) {
  if (direction > 0) {
    digitalWrite(LEFT_MOTOR_IN1_PIN, HIGH);
    digitalWrite(LEFT_MOTOR_IN2_PIN, LOW);
  } else if (direction < 0) {
    digitalWrite(LEFT_MOTOR_IN1_PIN, LOW);
    digitalWrite(LEFT_MOTOR_IN2_PIN, HIGH);
  } else {
    digitalWrite(LEFT_MOTOR_IN1_PIN, LOW);
    digitalWrite(LEFT_MOTOR_IN2_PIN, LOW);
    speed = 0;
  }

  analogWrite(LEFT_MOTOR_PWM_PIN, speed);
}

inline void driveRight(int direction, uint8_t speed = MOTOR_RUN_SPEED) {
  if (direction > 0) {
    digitalWrite(RIGHT_MOTOR_IN1_PIN, HIGH);
    digitalWrite(RIGHT_MOTOR_IN2_PIN, LOW);
  } else if (direction < 0) {
    digitalWrite(RIGHT_MOTOR_IN1_PIN, LOW);
    digitalWrite(RIGHT_MOTOR_IN2_PIN, HIGH);
  } else {
    digitalWrite(RIGHT_MOTOR_IN1_PIN, LOW);
    digitalWrite(RIGHT_MOTOR_IN2_PIN, LOW);
    speed = 0;
  }

  analogWrite(RIGHT_MOTOR_PWM_PIN, speed);
}

inline void setupMotors() {
  pinMode(LEFT_MOTOR_PWM_PIN, OUTPUT);
  pinMode(LEFT_MOTOR_IN1_PIN, OUTPUT);
  pinMode(LEFT_MOTOR_IN2_PIN, OUTPUT);
  pinMode(RIGHT_MOTOR_PWM_PIN, OUTPUT);
  pinMode(RIGHT_MOTOR_IN1_PIN, OUTPUT);
  pinMode(RIGHT_MOTOR_IN2_PIN, OUTPUT);
  stopMotors();
}

inline void driveWithKick(int leftDirection, int rightDirection) {
  driveLeft(leftDirection, MOTOR_START_SPEED);
  driveRight(rightDirection, MOTOR_START_SPEED);
  delay(MOTOR_START_KICK_MS);
  driveLeft(leftDirection, MOTOR_RUN_SPEED);
  driveRight(rightDirection, MOTOR_RUN_SPEED);
}

inline void moveForward() {
  driveWithKick(1, 1);
}

inline void moveBackward() {
  driveWithKick(-1, -1);
}

inline void turnLeft() {
  driveWithKick(-1, 1);
}

inline void turnRight() {
  driveWithKick(1, -1);
}

inline void testLeftMotor() {
  driveLeft(1, MOTOR_START_SPEED);
  delay(800);
  driveLeft(0);
}

inline void testRightMotor() {
  driveRight(1, MOTOR_START_SPEED);
  delay(800);
  driveRight(0);
}

inline void testMotors() {
  testLeftMotor();
  delay(300);
  testRightMotor();
  delay(300);

  moveForward();
  delay(800);
  stopMotors();
}

inline void stopMotors() {
  driveLeft(0);
  driveRight(0);
}
