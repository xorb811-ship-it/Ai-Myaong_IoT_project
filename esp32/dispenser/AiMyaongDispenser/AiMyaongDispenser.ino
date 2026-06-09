#include "dispenser_actuators.h"
#include "wifi_mqtt.h"

void setup() {
  Serial.begin(115200);
  setupActuators();
  setupWifiAndMqtt();
}

void loop() {
  loopMqtt();
}
