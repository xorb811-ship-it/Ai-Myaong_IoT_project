#pragma once

#include <stdint.h>

// Copy this file to mqtt_secrets.h and fill in the HiveMQ Cloud values.
// mqtt_secrets.h is ignored by Git and must never be committed.
constexpr const char* MQTT_BROKER_HOST = "your-cluster.s1.eu.hivemq.cloud";
constexpr uint16_t MQTT_BROKER_PORT = 8883;
constexpr const char* MQTT_USERNAME = "your-device-username";
constexpr const char* MQTT_PASSWORD = "your-device-password";

// Paste the PEM root CA used to verify the HiveMQ Cloud server certificate.
// HiveMQ Cloud commonly uses ISRG Root X1:
// https://letsencrypt.org/certs/isrgrootx1.pem
// Keep the BEGIN/END lines. A CA certificate is public, but it is kept here so
// all broker connection settings live in one local-only file.
constexpr const char MQTT_ROOT_CA[] = R"PEM(
-----BEGIN CERTIFICATE-----
PASTE_HIVEMQ_ROOT_CA_CERTIFICATE_HERE
-----END CERTIFICATE-----
)PEM";
