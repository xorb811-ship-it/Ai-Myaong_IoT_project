#pragma once

#include <Servo.h>

namespace {
Servo panServo;
Servo tiltServo;

constexpr uint8_t PAN_SERVO_PIN = 9;
constexpr uint8_t TILT_SERVO_PIN = 10;

constexpr int PAN_MIN_ANGLE = 20;
constexpr int PAN_MAX_ANGLE = 160;
constexpr int TILT_MIN_ANGLE = 40;
constexpr int TILT_MAX_ANGLE = 140;

constexpr int PAN_CENTER_ANGLE = 90;
constexpr int TILT_CENTER_ANGLE = 90;
constexpr int SERVO_STEP = 4;
constexpr unsigned long SERVO_SMOOTH_DELAY_MS = 12;

int currentPanAngle = PAN_CENTER_ANGLE;
int currentTiltAngle = TILT_CENTER_ANGLE;

inline int clampAngle(int angle, int minAngle, int maxAngle) {
  if (angle < minAngle) {
    return minAngle;
  }

  if (angle > maxAngle) {
    return maxAngle;
  }

  return angle;
}

inline void moveServoSmoothly(Servo& servo, int& currentAngle, int targetAngle, int minAngle, int maxAngle) {
  const int clampedTarget = clampAngle(targetAngle, minAngle, maxAngle);

  while (currentAngle != clampedTarget) {
    currentAngle += (currentAngle < clampedTarget) ? 1 : -1;
    servo.write(currentAngle);
    delay(SERVO_SMOOTH_DELAY_MS);
  }
}

inline void writePanAngle(int angle) {
  moveServoSmoothly(panServo, currentPanAngle, angle, PAN_MIN_ANGLE, PAN_MAX_ANGLE);
}

inline void writeTiltAngle(int angle) {
  moveServoSmoothly(tiltServo, currentTiltAngle, angle, TILT_MIN_ANGLE, TILT_MAX_ANGLE);
}
}  // namespace

inline void cameraUp();
inline void cameraDown();
inline void cameraLeft();
inline void cameraRight();
inline void cameraCenter();

inline void setupServos() {
  panServo.attach(PAN_SERVO_PIN);
  tiltServo.attach(TILT_SERVO_PIN);
  cameraCenter();
}

inline void cameraUp() {
  writeTiltAngle(currentTiltAngle - SERVO_STEP);
}

inline void cameraDown() {
  writeTiltAngle(currentTiltAngle + SERVO_STEP);
}

inline void cameraLeft() {
  writePanAngle(currentPanAngle + SERVO_STEP);
}

inline void cameraRight() {
  writePanAngle(currentPanAngle - SERVO_STEP);
}

inline void cameraCenter() {
  writePanAngle(PAN_CENTER_ANGLE);
  writeTiltAngle(TILT_CENTER_ANGLE);
}
