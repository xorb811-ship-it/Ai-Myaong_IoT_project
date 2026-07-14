#pragma once

#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <WiFi.h>
#include <time.h>

#include "loadcell_control.h"
#include "motor_control.h"
#include "mqtt_secrets.h"
#include "water_pump_control.h"

// Leave SSID/PASSWORD empty to let ESP32 reuse credentials already saved by WiFi.begin().
constexpr const char* WIFI_SSID = "";
constexpr const char* WIFI_PASSWORD = "";
constexpr unsigned long WIFI_RECONNECT_INTERVAL_MS = 10000;
constexpr unsigned long WIFI_SETUP_PORTAL_DELAY_MS = 15000;
constexpr unsigned long MQTT_RECONNECT_INTERVAL_MS = 5000;
constexpr unsigned long MQTT_WEIGHT_INTERVAL_MS = 3000;
constexpr unsigned long NTP_SYNC_TIMEOUT_MS = 10000;
constexpr const char* WIFI_SETUP_AP_SSID = "AiMyaong-Setup";
constexpr const char* WIFI_SETUP_AP_PASSWORD = "aimyaong123";

WiFiClientSecure mqttTlsClient;
PubSubClient mqttClient(mqttTlsClient);
WebServer wifiSetupServer(80);
unsigned long lastWifiAttemptMs = 0;
unsigned long wifiDisconnectedSinceMs = 0;
unsigned long lastMqttAttemptMs = 0;
unsigned long lastMqttWeightPublishMs = 0;
bool wifiSetupPortalRunning = false;
bool wifiSetupConnectionPending = false;
bool mqttTlsConfigured = false;

String mqttJsonEscape(const String& value) {
  String escaped;
  escaped.reserve(value.length() + 8);
  for (size_t i = 0; i < value.length(); i += 1) {
    char c = value[i];
    if (c == '"' || c == '\\') {
      escaped += '\\';
      escaped += c;
    } else if (c == '\n') {
      escaped += "\\n";
    } else if (c == '\r') {
      escaped += "\\r";
    } else {
      escaped += c;
    }
  }
  return escaped;
}

int mqttExtractAmount(const String& payload) {
  int amountIndex = payload.indexOf("\"amount\"");
  if (amountIndex >= 0) {
    int colonIndex = payload.indexOf(':', amountIndex);
    if (colonIndex >= 0) {
      int start = colonIndex + 1;
      while (start < payload.length() && !isDigit(payload[start]) && payload[start] != '-') {
        start += 1;
      }

      int end = start;
      while (end < payload.length() && (isDigit(payload[end]) || payload[end] == '-')) {
        end += 1;
      }

      long amount = payload.substring(start, end).toInt();
      return amount < 1 ? 1 : static_cast<int>(amount);
    }
  }

  long plainAmount = payload.toInt();
  return plainAmount < 1 ? 1 : static_cast<int>(plainAmount);
}

float mqttReadUnitsOrZero(HX711& scale) {
  return scale.is_ready() ? scale.get_units(1) : 0.0f;
}

long mqttReadCountOrZero(HX711& scale) {
  return scale.is_ready() ? scale.get_value(1) : 0;
}

void publishDispenserStatus(const char* state) {
  if (!mqttClient.connected()) {
    return;
  }

  String payload = "{\"state\":\"";
  payload += state;
  payload += "\",\"ip\":\"";
  payload += WiFi.localIP().toString();
  payload += "\",\"ssid\":\"";
  payload += mqttJsonEscape(WiFi.SSID());
  payload += "\",\"mqttHost\":\"";
  payload += MQTT_BROKER_HOST;
  payload += "\"}";
  mqttClient.publish("dispenser/status", payload.c_str(), true);
}

void publishDispenserWeight() {
  if (!mqttClient.connected()) {
    return;
  }

  String payload = "{\"food_g\":";
  payload += String(mqttReadUnitsOrZero(loadCell1), 1);
  payload += ",\"water_g\":";
  payload += String(mqttReadUnitsOrZero(loadCell2), 1);
  payload += ",\"food_count\":";
  payload += String(mqttReadCountOrZero(loadCell1));
  payload += ",\"water_count\":";
  payload += String(mqttReadCountOrZero(loadCell2));
  payload += ",\"ip\":\"";
  payload += WiFi.localIP().toString();
  payload += "\"}";
  mqttClient.publish("dispenser/weight", payload.c_str(), false);
}

void handleDispenserMqttMessage(const String& topic, const String& payload) {
  int amount = mqttExtractAmount(payload);

  if (topic == "dispenser/feed") {
    dispenseFoodAmount(amount);
    publishDispenserStatus("feed_running");
  } else if (topic == "dispenser/water") {
    dispenseWaterAmount(amount);
    publishDispenserStatus("water_running");
  } else if (topic == "dispenser/pump/off") {
    stopWaterPump();
    publishDispenserStatus("water_stopped");
  } else if (topic == "dispenser/pump/speed") {
    setWaterPumpSpeed(amount);
    publishDispenserStatus("water_speed_set");
  } else if (topic == "dispenser/tare") {
    tareLoadCell();
    publishDispenserStatus("tare_done");
    publishDispenserWeight();
  } else if (topic == "dispenser/weight/request") {
    publishDispenserWeight();
  }
}

void sendWifiSetupPage() {
  const char* page = R"HTML(
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AiMyaong Wi-Fi 설정</title>
<style>body{font-family:sans-serif;max-width:420px;margin:40px auto;padding:0 20px}input,button{box-sizing:border-box;width:100%;padding:12px;margin:6px 0}button{cursor:pointer}</style>
</head><body><h2>AiMyaong Wi-Fi 설정</h2>
<p>ESP32가 연결할 2.4GHz Wi-Fi 정보를 입력하세요.</p>
<form method="post" action="/configure">
<label>Wi-Fi 이름(SSID)</label><input name="ssid" required maxlength="32">
<label>비밀번호</label><input name="password" type="password" maxlength="64">
<button type="submit">연결</button></form></body></html>
)HTML";
  wifiSetupServer.send(200, "text/html; charset=utf-8", page);
}

void handleWifiConfigure() {
  String ssid = wifiSetupServer.arg("ssid");
  String password = wifiSetupServer.arg("password");
  ssid.trim();
  if (ssid.length() == 0) {
    wifiSetupServer.send(400, "text/plain; charset=utf-8", "SSID를 입력하세요.");
    return;
  }

  mqttClient.disconnect();

  wifiSetupServer.send(200, "text/html; charset=utf-8",
                       "<meta charset='utf-8'><p>연결을 시도합니다. 잠시 후 ESP32 시리얼 모니터에서 IP를 확인하세요.</p>");
  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(ssid.c_str(), password.c_str());
  wifiSetupConnectionPending = true;
  lastWifiAttemptMs = millis();
  Serial.print("[wifi] setup requested for SSID: ");
  Serial.println(ssid);
}

void startWifiSetupPortal() {
  if (wifiSetupPortalRunning) {
    return;
  }

  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(WIFI_SETUP_AP_SSID, WIFI_SETUP_AP_PASSWORD);
  wifiSetupServer.on("/", HTTP_GET, sendWifiSetupPage);
  wifiSetupServer.on("/configure", HTTP_POST, handleWifiConfigure);
  wifiSetupServer.onNotFound(sendWifiSetupPage);
  wifiSetupServer.begin();
  wifiSetupPortalRunning = true;

  Serial.println("[wifi] setup portal started");
  Serial.print("[wifi] connect to AP: ");
  Serial.println(WIFI_SETUP_AP_SSID);
  Serial.print("[wifi] open: http://");
  Serial.println(WiFi.softAPIP());
}

void serviceWifiSetupPortal() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiDisconnectedSinceMs = 0;
    if (wifiSetupPortalRunning && wifiSetupConnectionPending) {
      wifiSetupServer.stop();
      WiFi.softAPdisconnect(true);
      WiFi.mode(WIFI_STA);
      wifiSetupPortalRunning = false;
      wifiSetupConnectionPending = false;
      Serial.print("[wifi] connected: ");
      Serial.print(WiFi.SSID());
      Serial.print(" ip=");
      Serial.println(WiFi.localIP());
    }
    if (wifiSetupPortalRunning) {
      wifiSetupServer.handleClient();
    }
    return;
  }

  if (wifiDisconnectedSinceMs == 0) {
    wifiDisconnectedSinceMs = millis();
  }
  if (!wifiSetupPortalRunning && millis() - wifiDisconnectedSinceMs >= WIFI_SETUP_PORTAL_DELAY_MS) {
    startWifiSetupPortal();
  }
  if (wifiSetupPortalRunning) {
    wifiSetupServer.handleClient();
  }
}

void printNetworkStatus() {
  Serial.println("[network] status");
  Serial.print("[wifi] connected=");
  Serial.println(WiFi.status() == WL_CONNECTED ? "true" : "false");
  Serial.print("[wifi] ssid=");
  Serial.println(WiFi.SSID());
  Serial.print("[wifi] ip=");
  Serial.println(WiFi.localIP());
  Serial.print("[mqtt] host=");
  Serial.print(MQTT_BROKER_HOST);
  Serial.print(":");
  Serial.println(MQTT_BROKER_PORT);
  Serial.print("[mqtt] connected=");
  Serial.println(mqttClient.connected() ? "true" : "false");
  Serial.print("[mqtt] state=");
  Serial.println(mqttClient.state());
}

void connectWifiIfNeeded() {
  if (WiFi.status() == WL_CONNECTED || wifiSetupPortalRunning) {
    return;
  }

  unsigned long now = millis();
  if (lastWifiAttemptMs != 0 && now - lastWifiAttemptMs < WIFI_RECONNECT_INTERVAL_MS) {
    return;
  }
  lastWifiAttemptMs = now;

  Serial.println("[wifi] connecting...");
  WiFi.mode(WIFI_STA);
  if (String(WIFI_SSID).length() > 0) {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  } else {
    WiFi.begin();
  }
}

void connectMqttIfNeeded() {
  if (WiFi.status() != WL_CONNECTED || mqttClient.connected()) {
    return;
  }

  unsigned long now = millis();
  if (now - lastMqttAttemptMs < MQTT_RECONNECT_INTERVAL_MS) {
    return;
  }
  lastMqttAttemptMs = now;

  if (String(MQTT_BROKER_HOST).length() == 0 || String(MQTT_USERNAME).length() == 0 ||
      String(MQTT_PASSWORD).length() == 0 || String(MQTT_ROOT_CA).indexOf("PASTE_") >= 0) {
    Serial.println("[mqtt] configuration missing in mqtt_secrets.h");
    return;
  }

  if (time(nullptr) < 1700000000) {
    Serial.println("[time] synchronizing for TLS certificate validation...");
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    unsigned long syncStartedAt = millis();
    while (time(nullptr) < 1700000000 && millis() - syncStartedAt < NTP_SYNC_TIMEOUT_MS) {
      delay(250);
    }
    if (time(nullptr) < 1700000000) {
      Serial.println("[time] synchronization failed");
      return;
    }
    Serial.println("[time] synchronized");
  }

  if (!mqttTlsConfigured) {
    mqttTlsClient.setCACert(MQTT_ROOT_CA);
    mqttClient.setServer(MQTT_BROKER_HOST, MQTT_BROKER_PORT);
    mqttTlsConfigured = true;
  }

  Serial.print("[mqtt] connecting ");
  Serial.print(MQTT_BROKER_HOST);
  Serial.print(":");
  Serial.println(MQTT_BROKER_PORT);

  String clientId = "aimyaong-main-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  if (!mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
    Serial.print("[mqtt] connect failed state=");
    Serial.println(mqttClient.state());
    return;
  }

  mqttClient.subscribe("dispenser/feed");
  mqttClient.subscribe("dispenser/water");
  mqttClient.subscribe("dispenser/pump/off");
  mqttClient.subscribe("dispenser/pump/speed");
  mqttClient.subscribe("dispenser/tare");
  mqttClient.subscribe("dispenser/weight/request");
  publishDispenserStatus("online");
  publishDispenserWeight();
  Serial.println("[mqtt] connected and subscribed");
}

void setupMqttControl() {
  mqttClient.setServer(MQTT_BROKER_HOST, MQTT_BROKER_PORT);
  mqttClient.setCallback([](char* topic, byte* payload, unsigned int length) {
    String body;
    body.reserve(length);
    for (unsigned int i = 0; i < length; i += 1) {
      body += static_cast<char>(payload[i]);
    }
    handleDispenserMqttMessage(String(topic), body);
  });

  wifiDisconnectedSinceMs = millis();
  connectWifiIfNeeded();
}

void loopMqttControl() {
  serviceWifiSetupPortal();
  connectWifiIfNeeded();
  connectMqttIfNeeded();

  if (mqttClient.connected()) {
    mqttClient.loop();

    unsigned long now = millis();
    if (now - lastMqttWeightPublishMs >= MQTT_WEIGHT_INTERVAL_MS) {
      lastMqttWeightPublishMs = now;
      publishDispenserWeight();
    }
  }
}
