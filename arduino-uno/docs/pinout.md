# Robot Controller Pinout Draft

Use this page to lock down the final Arduino Uno wiring.

## Motor Driver

- Left motor PWM: D5
- Left motor direction A: D4
- Left motor direction B: D7
- Right motor PWM: D6
- Right motor direction A: D8
- Right motor direction B: D12
- Motor supply: use a voltage matched to the motor rating. Stop using 12V if the motor smells hot or burnt.
- L298N drops motor voltage significantly. With a 6V supply, the motors may receive only about 4V and can stutter or stall.
- Current code kicks the motors at PWM 255 briefly, then runs at PWM 220 to reduce current draw and driver heat.
- Arduino/Raspberry Pi GND and motor driver GND must be shared.

## Motor Test

- Upload `AiMyaongRobot`, open Arduino Serial Monitor at `115200`, set line ending to newline, and send `MOTOR_TEST`.
- `MOTOR_TEST` runs left motor, right motor, then both motors briefly.
- Send `LEFT_MOTOR_TEST` or `RIGHT_MOTOR_TEST` to test only one side.
- If `MOTOR_TEST` prints `ACK MOTOR_TEST` but motors do not move, check motor power, L298N ENA/ENB jumpers or PWM wiring, shared GND, and whether the motors were damaged by 12V.
- If only one side spins and stops, swap the left/right motor outputs on the L298N. If the problem follows the motor, the motor is weak or damaged. If it stays on the same L298N side, the driver channel, wiring, or power path is the problem.

## Pan/Tilt Servos

- Pan servo signal: D9
- Tilt servo signal: D10

## Serial Link

- Raspberry Pi TX -> Arduino Uno RX:
- Raspberry Pi RX -> Arduino Uno TX:
- Shared GND:
