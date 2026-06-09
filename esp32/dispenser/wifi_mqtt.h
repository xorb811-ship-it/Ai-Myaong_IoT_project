#pragma once

#include <Preferences.h>
#include <PubSubClient.h>
#include <WebServer.h>
#include <WiFi.h>

#include "dispenser_actuators.h"

namespace {
constexpr const char* AP_SSID = "ESP32_FEEDER_SETUP";
constexpr const char* AP_PASSWORD = "12345678";
constexpr const char* PREF_NAMESPACE = "wifi";
constexpr const char* PREF_SSID = "ssid";
constexpr const char* PREF_PASSWORD = "password";
constexpr const char* PREF_MQTT_HOST = "mqtt_host";
constexpr const char* DEFAULT_MQTT_HOST = "localhost";
constexpr uint16_t MQTT_PORT = 1883;
constexpr uint8_t CONFIG_BUTTON_PIN = 0;
constexpr unsigned long CONFIG_BUTTON_HOLD_MS = 3000;
constexpr unsigned long WIFI_CONNECT_TIMEOUT_MS = 12000;
constexpr unsigned long MQTT_RECONNECT_INTERVAL_MS = 5000;

Preferences preferences;
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
WebServer setupServer(80);
String mqttHost = DEFAULT_MQTT_HOST;

bool setupPortalRunning = false;
bool apStopPending = false;
bool rebootPending = false;
int lastApClientCount = -1;
bool buttonWasPressed = false;
bool configResetTriggered = false;
unsigned long buttonPressedAt = 0;
unsigned long apStopAt = 0;
unsigned long rebootAt = 0;
unsigned long lastMqttAttempt = 0;
}

inline void handleMqttMessage(const String& topic, int amount);

inline String jsonEscape(const String& value) {
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

inline void sendCorsHeaders() {
  setupServer.sendHeader("Access-Control-Allow-Origin", "*");
  setupServer.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  setupServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  setupServer.sendHeader("Access-Control-Allow-Private-Network", "true");
}

inline void sendJson(int statusCode, const String& body) {
  sendCorsHeaders();
  setupServer.send(statusCode, "application/json", body);
}

inline bool handleOptions() {
  if (setupServer.method() == HTTP_OPTIONS) {
    sendCorsHeaders();
    setupServer.send(204);
    return true;
  }
  return false;
}

inline int extractAmount(const String& payload) {
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

inline String extractJsonString(const String& body, const String& key) {
  String marker = "\"" + key + "\"";
  int keyIndex = body.indexOf(marker);
  if (keyIndex < 0) {
    return "";
  }

  int colonIndex = body.indexOf(':', keyIndex + marker.length());
  int firstQuote = body.indexOf('"', colonIndex + 1);
  if (colonIndex < 0 || firstQuote < 0) {
    return "";
  }

  String result;
  bool escaping = false;
  for (int i = firstQuote + 1; i < body.length(); i += 1) {
    char c = body[i];
    if (escaping) {
      result += c;
      escaping = false;
    } else if (c == '\\') {
      escaping = true;
    } else if (c == '"') {
      break;
    } else {
      result += c;
    }
  }
  return result;
}

inline bool extractJsonBool(const String& body, const String& key, bool fallback) {
  String marker = "\"" + key + "\"";
  int keyIndex = body.indexOf(marker);
  if (keyIndex < 0) {
    return fallback;
  }

  int colonIndex = body.indexOf(':', keyIndex + marker.length());
  if (colonIndex < 0) {
    return fallback;
  }

  String value = body.substring(colonIndex + 1);
  value.trim();
  if (value.startsWith("true")) {
    return true;
  }
  if (value.startsWith("false")) {
    return false;
  }
  return fallback;
}

inline String savedSsid() {
  preferences.begin(PREF_NAMESPACE, true);
  String ssid = preferences.getString(PREF_SSID, "");
  preferences.end();
  return ssid;
}

inline String savedPassword() {
  preferences.begin(PREF_NAMESPACE, true);
  String password = preferences.getString(PREF_PASSWORD, "");
  preferences.end();
  return password;
}

inline String savedMqttHost() {
  preferences.begin(PREF_NAMESPACE, true);
  String host = preferences.getString(PREF_MQTT_HOST, DEFAULT_MQTT_HOST);
  preferences.end();
  host.trim();
  return host.length() > 0 ? host : String(DEFAULT_MQTT_HOST);
}

inline void saveWifiCredentials(const String& ssid, const String& password) {
  preferences.begin(PREF_NAMESPACE, false);
  preferences.putString(PREF_SSID, ssid);
  preferences.putString(PREF_PASSWORD, password);
  preferences.end();
}

inline void saveMqttHost(const String& host) {
  String cleanHost = host;
  cleanHost.trim();
  if (cleanHost.length() == 0) {
    cleanHost = DEFAULT_MQTT_HOST;
  }

  preferences.begin(PREF_NAMESPACE, false);
  preferences.putString(PREF_MQTT_HOST, cleanHost);
  preferences.end();
}

inline void clearSavedNetworkConfig() {
  preferences.begin(PREF_NAMESPACE, false);
  preferences.remove(PREF_SSID);
  preferences.remove(PREF_PASSWORD);
  preferences.remove(PREF_MQTT_HOST);
  preferences.end();
  mqttHost = DEFAULT_MQTT_HOST;
}

inline bool connectToWifi(const String& ssid, const String& password, bool keepAp) {
  if (ssid.length() == 0) {
    return false;
  }

  WiFi.mode(keepAp ? WIFI_AP_STA : WIFI_STA);
  WiFi.begin(ssid.c_str(), password.c_str());

  unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
    if (setupPortalRunning) {
      setupServer.handleClient();
    }
  }

  return WiFi.status() == WL_CONNECTED;
}

inline bool connectSavedWifi() {
  preferences.begin(PREF_NAMESPACE, true);
  String ssid = preferences.getString(PREF_SSID, "");
  String password = preferences.getString(PREF_PASSWORD, "");
  preferences.end();

  return connectToWifi(ssid, password, false);
}

inline void publishStatus(const char* state) {
  if (!mqttClient.connected()) {
    return;
  }

  String payload = "{\"state\":\"";
  payload += state;
  payload += "\",\"ip\":\"";
  payload += WiFi.localIP().toString();
  payload += "\",\"ssid\":\"";
  payload += jsonEscape(WiFi.SSID());
  payload += "\"}";
  mqttClient.publish("dispenser/status", payload.c_str(), true);
}

inline void connectMqtt() {
  if (WiFi.status() != WL_CONNECTED || mqttClient.connected()) {
    return;
  }

  unsigned long now = millis();
  if (now - lastMqttAttempt < MQTT_RECONNECT_INTERVAL_MS) {
    return;
  }
  lastMqttAttempt = now;

  String clientId = "aimyaong-dispenser-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  if (mqttClient.connect(clientId.c_str())) {
    mqttClient.subscribe("dispenser/feed");
    mqttClient.subscribe("dispenser/water");
    publishStatus("online");
  }
}

inline String wifiStatusJson() {
  String body = "{";
  body += "\"stationConnected\":";
  body += WiFi.status() == WL_CONNECTED ? "true" : "false";
  body += ",\"setupPortalRunning\":";
  body += setupPortalRunning ? "true" : "false";
  body += ",\"ssid\":\"";
  body += jsonEscape(WiFi.SSID());
  body += "\",\"savedSsid\":\"";
  body += jsonEscape(savedSsid());
  body += "\",\"ip\":\"";
  body += WiFi.localIP().toString();
  body += "\",\"apIp\":\"";
  body += WiFi.softAPIP().toString();
  body += "\",\"mqttConnected\":";
  body += mqttClient.connected() ? "true" : "false";
  body += ",\"mqttHost\":\"";
  body += jsonEscape(mqttHost);
  body += "\"}";
  return body;
}

inline void handleStatus() {
  if (handleOptions()) {
    return;
  }
  sendJson(200, wifiStatusJson());
}

inline void handleScan() {
  if (handleOptions()) {
    return;
  }

  Serial.println("[wifi] scan requested");
  int networkCount = WiFi.scanNetworks(false, true);
  Serial.printf("[wifi] scan result: %d\n", networkCount);
  if (networkCount < 0) {
    sendJson(503, "{\"networks\":[],\"error\":\"Wi-Fi scan failed\"}");
    WiFi.scanDelete();
    return;
  }

  String body = "{\"networks\":[";
  for (int i = 0; i < networkCount; i += 1) {
    if (i > 0) {
      body += ",";
    }
    body += "{\"ssid\":\"";
    body += jsonEscape(WiFi.SSID(i));
    body += "\",\"rssi\":";
    body += WiFi.RSSI(i);
    body += ",\"secure\":";
    body += WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "false" : "true";
    body += ",\"channel\":";
    body += WiFi.channel(i);
    body += "}";
  }
  body += "]}";
  WiFi.scanDelete();
  sendJson(200, body);
}

inline void handleConnect() {
  if (handleOptions()) {
    return;
  }

  String body = setupServer.arg("plain");
  String ssid = extractJsonString(body, "ssid");
  String password = extractJsonString(body, "password");
  String requestedMqttHost = extractJsonString(body, "mqttHost");
  if (ssid.length() == 0) {
    sendJson(400, "{\"ok\":false,\"error\":\"SSID is required\"}");
    return;
  }

  String previousSsid = savedSsid();
  String previousPassword = savedPassword();
  String previousMqttHost = savedMqttHost();
  if (mqttClient.connected()) {
    mqttClient.disconnect();
  }

  if (!connectToWifi(ssid, password, true)) {
    if (previousSsid.length() > 0) {
      saveWifiCredentials(previousSsid, previousPassword);
      saveMqttHost(previousMqttHost);
      mqttHost = previousMqttHost;
      connectToWifi(previousSsid, previousPassword, true);
      mqttClient.setServer(mqttHost.c_str(), MQTT_PORT);
    } else {
      clearSavedNetworkConfig();
    }

    String response = "{\"ok\":false,\"saved\":false,\"restored\":true,\"error\":\"Wi-Fi connection failed\",\"ssid\":\"";
    response += jsonEscape(ssid);
    response += "\",\"restoredSsid\":\"";
    response += jsonEscape(previousSsid);
    response += "\"}";
    sendJson(503, response);
    Serial.print("[wifi] connection failed, restored previous SSID: ");
    Serial.println(previousSsid);
    return;
  }

  saveWifiCredentials(ssid, password);
  saveMqttHost(requestedMqttHost);
  mqttHost = savedMqttHost();
  mqttClient.setServer(mqttHost.c_str(), MQTT_PORT);

  String response = "{\"ok\":true,\"saved\":true,\"connected\":true,\"rebooting\":true,\"ssid\":\"";
  response += jsonEscape(ssid);
  response += "\",\"ip\":\"";
  response += WiFi.localIP().toString();
  response += "\",\"mqttHost\":\"";
  response += jsonEscape(mqttHost);
  response += "\"}";
  sendJson(200, response);

  Serial.print("[wifi] credentials saved, rebooting for SSID: ");
  Serial.println(ssid);
  Serial.print("[mqtt] broker host saved: ");
  Serial.println(mqttHost);
  rebootPending = true;
  rebootAt = millis() + 1500;
}

inline void handleRoot() {
  if (handleOptions()) {
    return;
  }

  sendCorsHeaders();
  setupServer.send(200, "text/html", R"HTML(
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Ai-Myaong Feeder Wi-Fi</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;background:#fff9f1;color:#4b3621}
    main{max-width:520px;margin:0 auto;padding:24px}
    h1{font-size:24px;margin:0 0 6px}
    p{color:#786857}
    button,input{font:inherit}
    button{border:0;border-radius:14px;padding:12px 14px;background:#f08d86;color:white;font-weight:700}
    input{width:100%;border:1px solid #efe3d2;border-radius:14px;padding:12px;margin:8px 0;background:white}
    .net{width:100%;display:flex;justify-content:space-between;margin:8px 0;background:white;color:#4b3621;border:1px solid #efe3d2}
    .card{background:white;border:1px solid #efe3d2;border-radius:20px;padding:16px;margin-top:16px}
    .muted{font-size:13px;color:#9c8a78}
  </style>
</head>
<body>
<main>
  <h1>Ai-Myaong Feeder Wi-Fi</h1>
  <p>Select a network, enter the password, and connect the dispenser.</p>
  <div class="card">
    <button onclick="scan()">Scan Wi-Fi</button>
    <div id="networks"></div>
  </div>
  <div class="card">
    <input id="ssid" placeholder="SSID">
    <input id="password" type="password" placeholder="Password">
    <input id="mqttHost" placeholder="MQTT host" value="localhost">
    <button onclick="connectWifi()">Save and connect</button>
    <p id="result" class="muted"></p>
  </div>
</main>
<script>
async function scan(){
  const data = await fetch('/api/wifi/scan').then(r => r.json());
  networks.innerHTML = data.networks.map(n =>
    `<button class="net" onclick="ssid.value='${String(n.ssid).replaceAll("'", "\\'")}'"><span>${n.ssid || '(hidden)'}</span><span>${n.rssi} dBm</span></button>`
  ).join('');
}
async function connectWifi(){
  result.textContent = 'Connecting...';
  const res = await fetch('/api/wifi/connect', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ssid:ssid.value,password:password.value,mqttHost:mqttHost.value,reboot:false})
  });
  const data = await res.json();
  result.textContent = data.connected ? `Connected: ${data.ip}` : 'Saved, but connection did not complete yet.';
}
scan();
</script>
</body>
</html>
)HTML");
}

inline void startSetupPortal() {
  if (setupPortalRunning) {
    return;
  }

  if (mqttClient.connected()) {
    mqttClient.disconnect();
  }
  WiFi.disconnect(true, true);
  delay(100);
  WiFi.mode(WIFI_AP_STA);
  IPAddress apIp(192, 168, 4, 1);
  IPAddress gateway(192, 168, 4, 1);
  IPAddress subnet(255, 255, 255, 0);
  WiFi.softAPConfig(apIp, gateway, subnet);
  bool apStarted = WiFi.softAP(AP_SSID, AP_PASSWORD, 6, false, 4);
  Serial.print("[wifi] setup AP started: ");
  Serial.println(AP_SSID);
  Serial.print("[wifi] setup AP password: ");
  Serial.println(AP_PASSWORD);
  Serial.print("[wifi] setup AP result: ");
  Serial.println(apStarted ? "ok" : "failed");
  Serial.print("[wifi] setup URL: http://");
  Serial.println(WiFi.softAPIP());

  setupServer.on("/", HTTP_GET, handleRoot);
  setupServer.on("/api/wifi/status", HTTP_GET, handleStatus);
  setupServer.on("/api/wifi/status", HTTP_OPTIONS, handleStatus);
  setupServer.on("/api/wifi/scan", HTTP_GET, handleScan);
  setupServer.on("/api/wifi/scan", HTTP_OPTIONS, handleScan);
  setupServer.on("/api/wifi/connect", HTTP_POST, handleConnect);
  setupServer.on("/api/wifi/connect", HTTP_OPTIONS, handleConnect);
  setupServer.begin();
  setupPortalRunning = true;
}

inline void handleConfigButton() {
  bool pressed = digitalRead(CONFIG_BUTTON_PIN) == LOW;
  if (pressed && !buttonWasPressed) {
    buttonPressedAt = millis();
    configResetTriggered = false;
    Serial.println("[wifi] setup button pressed");
  }

  if (pressed && !configResetTriggered && millis() - buttonPressedAt >= CONFIG_BUTTON_HOLD_MS) {
    configResetTriggered = true;
    Serial.println("[wifi] setup button held, clearing saved Wi-Fi and MQTT settings");
    clearSavedNetworkConfig();
    startSetupPortal();
  }

  if (!pressed && buttonWasPressed) {
    Serial.println("[wifi] setup button released");
  }

  buttonWasPressed = pressed;
}

inline void setupWifiAndMqtt() {
  pinMode(CONFIG_BUTTON_PIN, INPUT_PULLUP);
  mqttHost = savedMqttHost();
  mqttClient.setServer(mqttHost.c_str(), MQTT_PORT);
  Serial.print("[mqtt] broker host: ");
  Serial.println(mqttHost);
  mqttClient.setCallback([](char* topic, byte* payload, unsigned int length) {
    String body;
    body.reserve(length);
    for (unsigned int i = 0; i < length; i += 1) {
      body += static_cast<char>(payload[i]);
    }
    handleMqttMessage(String(topic), extractAmount(body));
  });

  if (!connectSavedWifi()) {
    Serial.println("[wifi] saved Wi-Fi connection failed, starting setup portal");
    startSetupPortal();
    return;
  }

  Serial.print("[wifi] connected: ");
  Serial.print(WiFi.SSID());
  Serial.print(" ");
  Serial.println(WiFi.localIP());
  connectMqtt();
}

inline void handleMqttMessage(const String& topic, int amount) {
  if (topic == "dispenser/feed") {
    dispenseFood(amount);
  } else if (topic == "dispenser/water") {
    dispenseWater(amount);
  }
}

inline void loopMqtt() {
  handleConfigButton();

  if (setupPortalRunning) {
    setupServer.handleClient();
    int apClientCount = WiFi.softAPgetStationNum();
    if (apClientCount != lastApClientCount) {
      lastApClientCount = apClientCount;
      Serial.print("[wifi] setup AP clients: ");
      Serial.println(apClientCount);
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      connectMqtt();
    }
    mqttClient.loop();
  }

  if (apStopPending && millis() >= apStopAt) {
    WiFi.softAPdisconnect(true);
    setupPortalRunning = false;
    apStopPending = false;
  }

  if (rebootPending && millis() >= rebootAt) {
    ESP.restart();
  }
}
