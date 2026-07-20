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
#include "presence_control.h"
#include "water_pump_control.h"

// Leave SSID/PASSWORD empty to let ESP32 reuse credentials already saved by WiFi.begin().
constexpr const char* WIFI_SSID = "";
constexpr const char* WIFI_PASSWORD = "";
constexpr unsigned long WIFI_RECONNECT_INTERVAL_MS = 10000;
constexpr unsigned long WIFI_SETUP_PORTAL_DELAY_MS = 15000;
constexpr unsigned long MQTT_RECONNECT_INTERVAL_MS = 5000;
constexpr unsigned long MQTT_SETUP_PORTAL_DELAY_MS = 30000;
constexpr unsigned long MQTT_WEIGHT_INTERVAL_MS = 3000;
constexpr unsigned long NTP_SYNC_TIMEOUT_MS = 10000;
// Verify the HiveMQ server certificate before sending MQTT credentials.
constexpr bool MQTT_TLS_VERIFY_CA = true;
constexpr const char* WIFI_SETUP_AP_SSID = "AiMyaong-Setup";
constexpr const char* WIFI_SETUP_AP_PASSWORD = "aimyaong123";

WiFiClientSecure mqttTlsClient;
PubSubClient mqttClient(mqttTlsClient);
WebServer wifiSetupServer(80);
unsigned long lastWifiAttemptMs = 0;
unsigned long wifiDisconnectedSinceMs = 0;
unsigned long lastMqttAttemptMs = 0;
unsigned long mqttDisconnectedSinceMs = 0;
unsigned long lastMqttWeightPublishMs = 0;
bool wifiSetupPortalRunning = false;
bool wifiSetupConnectionPending = false;
bool mqttTlsConfigured = false;
String wifiScanCache = "{\"source\":\"esp32\",\"networks\":[]}";

void startWifiSetupPortal();

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

String jsonStringValue(const String& json, const char* key) {
  String marker = String("\"") + key + "\"";
  int keyIndex = json.indexOf(marker);
  if (keyIndex < 0) return "";
  int colonIndex = json.indexOf(':', keyIndex + marker.length());
  int quoteIndex = json.indexOf('"', colonIndex + 1);
  if (colonIndex < 0 || quoteIndex < 0) return "";

  String value;
  bool escaped = false;
  for (int i = quoteIndex + 1; i < json.length(); i += 1) {
    char c = json[i];
    if (escaped) {
      if (c == 'n') value += '\n';
      else if (c == 'r') value += '\r';
      else value += c;
      escaped = false;
    } else if (c == '\\') {
      escaped = true;
    } else if (c == '"') {
      break;
    } else {
      value += c;
    }
  }
  return value;
}

void sendSetupJson(int status, const String& payload) {
  wifiSetupServer.sendHeader("Access-Control-Allow-Origin", "*");
  wifiSetupServer.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  wifiSetupServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  wifiSetupServer.send(status, "application/json; charset=utf-8", payload);
}

// 키가 없으면 0. mqttExtractAmount 와 달리 1 로 올리지 않는다 —
// 호출부가 '안 왔음'을 구분해서 옛 payload 로 폴백해야 한다.
int mqttExtractIntField(const String& payload, const char* key) {
  String marker = String("\"") + key + "\"";
  int keyIndex = payload.indexOf(marker);
  if (keyIndex < 0) {
    return 0;
  }

  int colonIndex = payload.indexOf(':', keyIndex + marker.length());
  if (colonIndex < 0) {
    return 0;
  }

  int start = colonIndex + 1;
  while (start < payload.length() && !isDigit(payload[start]) && payload[start] != '-') {
    start += 1;
  }
  int end = start;
  while (end < payload.length() && (isDigit(payload[end]) || payload[end] == '-')) {
    end += 1;
  }
  if (end == start) {
    return 0;
  }

  long value = payload.substring(start, end).toInt();
  return value < 0 ? 0 : static_cast<int>(value);
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

  // 아직 한 번도 못 읽은 채널은 키를 뺀다. 0 을 보내면 백엔드가 '통이 비었다'로 읽어서
  // 가득 찬 통을 비었다고 표시한다 — 모르는 것과 비어있는 것은 다르다.
  // (예전엔 is_ready() 가 false 인 순간마다 0 이 나가서 진짜 값과 0 이 번갈아 나갔다)
  String payload = "{";
  if (loadCell1HasValue) {
    payload += "\"food_g\":";
    payload += String(loadCell1Grams, 1);
    payload += ",";
  }
  if (loadCell2HasValue) {
    payload += "\"water_g\":";
    payload += String(loadCell2Grams, 1);
    payload += ",";
  }
  payload += "\"ip\":\"";
  payload += WiFi.localIP().toString();
  payload += "\"}";
  mqttClient.publish("dispenser/weight", payload.c_str(), false);
}

// 지금 사료 오거나 물 펌프가 도는 중인가. 앱의 '정지' 버튼은 이 상태로만 뜬다.
bool dispenserBusy() {
  return motorStopAt != 0 || waterPumpRunning;
}

// 구동이 끝났을 때 idle 을 알린다.
//
// feed_running / water_running 은 명령을 받을 때 발행되는데 '끝났다'는 신호가 없었다.
// dispenser/status 는 retain 이라 상태가 feed_running 에 박힌 채 남고, 앱은 영원히
// 배식 중으로 본다. 상태가 바뀌는 순간에만 발행해 브로커를 도배하지 않는다.
void publishDispenserBusyChange() {
  static bool lastBusy = false;
  bool busy = dispenserBusy();
  if (busy == lastBusy) {
    return;
  }
  lastBusy = busy;
  if (!busy) {
    publishDispenserStatus("idle");
  }
}

// 이번 배식이 실제로 몇 g 나갔는지. 저울이 잠잠해지는 시점은 이 기기만 알기 때문에
// 여기서 재서 알린다. 백엔드가 이걸 그대로 통계에 쌓는다.
void publishFoodDispensedIfDone() {
  float grams = takeFoodDispensedGrams();
  if (grams < 0.0f || !mqttClient.connected()) {
    return;
  }

  String payload = "{\"food_g\":";
  payload += String(grams, 1);
  payload += ",\"ip\":\"";
  payload += WiFi.localIP().toString();
  payload += "\"}";
  mqttClient.publish("dispenser/dispensed", payload.c_str(), false);

  Serial.print("[food] dispensed g=");
  Serial.println(grams, 1);
}

void handleDispenserMqttMessage(const String& topic, const String& payload) {
  int amount = mqttExtractAmount(payload);
  int seconds = mqttExtractIntField(payload, "seconds");

  if (topic == "dispenser/feed") {
    markFoodDispenseStart();  // 오거 돌리기 전 무게를 적어둔다
    dispenseFoodAmount(amount);
    publishDispenserStatus("feed_running");
  } else if (topic == "dispenser/water") {
    if (jsonStringValue(payload, "source") == "auto") {
      requestScheduledWater(
          amount,
          jsonStringValue(payload, "request_id"),
          jsonStringValue(payload, "user_id"),
          jsonStringValue(payload, "pet_id"));
      publishDispenserStatus(scheduledWaterPending ? "water_waiting_for_cat" : "water_running");
    } else {
      dispenseWaterSeconds(seconds > 0 ? seconds : amount);
      publishDispenserStatus("water_running");
    }
  } else if (topic == "dispenser/stop") {
    // 긴급 정지: 사료 오거와 물 펌프를 동시에 즉시 끈다.
    // 중간에 멈춰도 실제 배출량은 저울이 안정된 뒤 별도로 발행된다.
    stopMotors();
    stopWaterPump();
    publishDispenserStatus("stopped");
    Serial.println("ACK DISPENSER_STOP");
  } else if (topic == "dispenser/pump/off") {
    stopWaterPump();
    publishDispenserStatus("water_stopped");
  } else if (topic == "dispenser/pump/on") {
    startWaterPump();
    publishDispenserStatus("water_pump_on");
  } else if (topic == "dispenser/pump/speed") {
    setWaterPumpSpeed(amount);
    publishDispenserStatus("water_speed_set");
  } else if (topic == "dispenser/tare") {
    tareLoadCell();
    publishDispenserStatus("tare_done");
    publishDispenserWeight();
  } else if (topic == "dispenser/tare/food") {
    tareLoadCell1();
    publishDispenserStatus("food_tare_done");
    publishDispenserWeight();
  } else if (topic == "dispenser/tare/water") {
    tareLoadCell2();
    publishDispenserStatus("water_tare_done");
    publishDispenserWeight();
  } else if (topic == "dispenser/weight/request") {
    publishDispenserWeight();
  } else if (topic == "dispenser/wifi/setup") {
    startWifiSetupPortal();
    publishDispenserStatus("wifi_setup");
  } else if (topic == "dispenser/presence/config") {
    bool enabled = payload.indexOf("\"enabled\":true") >= 0 ||
                   payload.indexOf("\"enabled\": true") >= 0;
    setPresenceGateEnabled(enabled);
    publishDispenserStatus(presenceGateEnabled ? "presence_gate_enabled" : "presence_gate_disabled");
  }
}

void handleWifiApiStatus() {
  String payload = "{\"stationConnected\":";
  payload += WiFi.status() == WL_CONNECTED ? "true" : "false";
  payload += ",\"ssid\":\"" + mqttJsonEscape(WiFi.SSID()) + "\"";
  payload += ",\"savedSsid\":\"" + mqttJsonEscape(WiFi.SSID()) + "\"";
  payload += ",\"ip\":\"" + WiFi.localIP().toString() + "\"";
  payload += ",\"apIp\":\"" + WiFi.softAPIP().toString() + "\"";
  payload += ",\"apActive\":";
  payload += wifiSetupPortalRunning ? "true" : "false";
  payload += ",\"mqttConnected\":";
  payload += mqttClient.connected() ? "true" : "false";
  payload += ",\"mqttHost\":\"" + mqttJsonEscape(MQTT_BROKER_HOST) + "\"}";
  sendSetupJson(200, payload);
}

void refreshWifiScanCache() {
  Serial.println("[wifi] scanning 2.4GHz networks before setup portal...");
  WiFi.scanDelete();
  int count = WiFi.scanNetworks(false, true);
  String payload = "{\"source\":\"esp32\",\"networks\":[";
  bool first = true;
  for (int i = 0; i < max(0, count); i += 1) {
    int channel = WiFi.channel(i);
    if (channel < 1 || channel > 14 || WiFi.SSID(i).length() == 0) continue;
    if (!first) payload += ',';
    first = false;
    payload += "{\"ssid\":\"" + mqttJsonEscape(WiFi.SSID(i)) + "\"";
    payload += ",\"rssi\":" + String(WiFi.RSSI(i));
    payload += ",\"channel\":" + String(channel);
    payload += ",\"band\":\"2.4GHz\",\"compatible\":true,\"esp32Compatible\":true";
    payload += ",\"secure\":";
    payload += WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "false" : "true";
    payload += '}';
  }
  WiFi.scanDelete();
  payload += "]}";
  wifiScanCache = payload;
  Serial.print("[wifi] scan complete: ");
  Serial.print(max(0, count));
  Serial.println(" network entries checked");
}

void handleWifiApiScan() {
  // ESP32 has one radio. Scanning while SoftAP is serving this request can
  // disconnect the browser, so return the result captured before AP startup.
  sendSetupJson(200, wifiScanCache);
}

void applyWifiCredentials(const String& ssid, const String& password) {
  mqttClient.disconnect();
  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(ssid.c_str(), password.c_str());
  wifiSetupConnectionPending = true;
  lastWifiAttemptMs = millis();
  Serial.print("[wifi] setup requested for SSID: ");
  Serial.println(ssid);
}

void handleWifiApiConnect() {
  String body = wifiSetupServer.arg("plain");
  String ssid = jsonStringValue(body, "ssid");
  String password = jsonStringValue(body, "password");
  ssid.trim();
  if (ssid.length() == 0) {
    sendSetupJson(400, "{\"error\":\"SSID is required.\"}");
    return;
  }
  sendSetupJson(200, "{\"ok\":true,\"rebooting\":false,\"ssid\":\"" + mqttJsonEscape(ssid) + "\"}");
  delay(100);
  applyWifiCredentials(ssid, password);
}

void handleWifiApiOptions() {
  sendSetupJson(204, "");
}

void sendWifiSetupPage() {
  const char* page = R"HTML(
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#fff9f1"><title>Ai:Myaong Wi-Fi 설정</title>
<style>
:root{--primary:#f08d86;--deep:#d6814a;--brown:#4b3621;--muted:#9c8a78;--bg:#fff9f1;--card:#fff;--cream:#fbefdd;--line:#efe3d2;--success:#7fb77e;--danger:#e26d5c}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--brown);font-family:Pretendard,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}.page{width:min(100%,460px);min-height:100vh;margin:auto;padding:calc(24px + env(safe-area-inset-top)) 20px calc(28px + env(safe-area-inset-bottom))}.hero{position:relative;overflow:hidden;padding:24px;border-radius:30px;background:linear-gradient(135deg,#fff 0%,#fbefdd 100%);border:1px solid var(--line);box-shadow:0 16px 38px rgba(75,54,33,.09)}.paw{position:absolute;right:18px;top:14px;font-size:42px;opacity:.13;transform:rotate(18deg)}.brand{font-size:13px;font-weight:900;letter-spacing:.08em;color:var(--primary)}h1{margin:8px 0 6px;font-size:27px;line-height:1.2}.sub{margin:0;color:var(--muted);font-size:14px;line-height:1.55;font-weight:650}.status{display:flex;align-items:center;gap:9px;margin-top:18px;padding:11px 13px;border-radius:17px;background:rgba(255,255,255,.72);font-size:12px;font-weight:800}.dot{width:9px;height:9px;border-radius:50%;background:var(--success);box-shadow:0 0 0 5px rgba(127,183,126,.15)}.section{margin-top:18px}.section-head{margin:0 3px 9px}.section-title{font-size:15px;font-weight:900}.card{overflow:hidden;border:1px solid var(--line);border-radius:25px;background:var(--card);box-shadow:0 8px 22px rgba(75,54,33,.06)}.empty{padding:28px 18px;text-align:center;color:var(--muted);font-size:13px;font-weight:700;line-height:1.5}.network{width:100%;display:flex;align-items:center;gap:12px;padding:14px 15px;border:0;border-bottom:1px solid var(--line);background:#fff;color:var(--brown);text-align:left;cursor:pointer}.network:last-child{border-bottom:0}.network.selected{background:#fff3ef}.card.collapsed .network:not(.selected){display:none}.wifi{display:grid;place-items:center;width:39px;height:39px;flex:0 0 39px;border-radius:15px;background:var(--cream);font-size:18px}.network-copy{min-width:0;flex:1}.ssid{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:900}.meta{display:block;margin-top:3px;color:var(--muted);font-size:11px;font-weight:700}.check{color:var(--primary);font-weight:1000}.form{margin-top:14px;padding:17px}.label{display:block;margin:0 2px 6px;color:var(--muted);font-size:11px;font-weight:900}.input{width:100%;margin-bottom:12px;padding:13px 14px;border:1px solid var(--line);border-radius:16px;background:#fff8ee;color:var(--brown);font:inherit;font-size:14px;font-weight:750;outline:0}.input:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(240,141,134,.13)}.primary{width:100%;padding:14px;border:0;border-radius:17px;background:linear-gradient(135deg,var(--primary),#f4a98c);color:#fff;font-size:14px;font-weight:950;cursor:pointer;box-shadow:0 10px 22px rgba(240,141,134,.28)}button:disabled{opacity:.55;cursor:default}.message{display:none;margin-top:13px;padding:12px 14px;border-radius:16px;background:var(--cream);font-size:12px;font-weight:800;line-height:1.5}.message.show{display:block}.message.error{background:#fff0ed;color:var(--danger)}.footer{margin-top:18px;text-align:center;color:var(--muted);font-size:11px;font-weight:650}
</style></head><body><main class="page">
<section class="hero"><span class="paw">🐾</span><div class="brand">AI:MYAONG</div><h1>ESP32 Wi-Fi 설정</h1><p class="sub">아이먀옹 기기가 사용할 2.4GHz 네트워크를 선택해 주세요.</p><div class="status"><span class="dot"></span><span>AiMyaong-Setup 설정 모드</span></div></section>
<section class="section"><div class="section-head"><span class="section-title">사용 가능한 Wi-Fi</span></div><div id="networks" class="card"><div class="empty">주변 2.4GHz Wi-Fi를 찾고 있어요.</div></div></section>
<form id="form" class="card form"><label class="label" for="ssid">Wi-Fi 이름</label><input id="ssid" class="input" maxlength="32" autocomplete="off" required placeholder="목록에서 선택하거나 직접 입력"><label class="label" for="password">비밀번호</label><input id="password" class="input" type="password" maxlength="64" placeholder="개방형 네트워크는 비워 두세요"><button id="connect" class="primary" type="submit">ESP32에 저장하고 연결</button><div id="message" class="message"></div></form>
<p class="footer">연결이 완료되면 설정 AP가 자동으로 종료됩니다.</p></main>
<script>
const list=document.getElementById('networks'),ssid=document.getElementById('ssid'),password=document.getElementById('password'),message=document.getElementById('message'),connectButton=document.getElementById('connect');let selected='',collapsed=false;
function notice(text,error=false){message.textContent=text;message.className='message show'+(error?' error':'')}function bars(rssi){return rssi>=-55?'▂▄▆█':rssi>=-70?'▂▄▆':rssi>=-82?'▂▄':'▂'}
function draw(networks){list.innerHTML='';list.className='card'+(collapsed?' collapsed':'');if(!networks.length){list.innerHTML='<div class="empty">검색된 2.4GHz Wi-Fi가 없습니다.</div>';return}networks.sort((a,b)=>b.rssi-a.rssi).forEach(network=>{const isSelected=selected===network.ssid,button=document.createElement('button');button.type='button';button.className='network'+(isSelected?' selected':'');const icon=document.createElement('span');icon.className='wifi';icon.textContent=network.secure?'🔒':'◉';const copy=document.createElement('span');copy.className='network-copy';const name=document.createElement('span');name.className='ssid';name.textContent=network.ssid;const meta=document.createElement('span');meta.className='meta';meta.textContent=isSelected&&collapsed?'선택됨 · 눌러서 다시 선택':`${bars(network.rssi)}  ${network.rssi} dBm · CH ${network.channel} · 2.4GHz`;const check=document.createElement('span');check.className='check';check.textContent=isSelected?'✓':'';copy.append(name,meta);button.append(icon,copy,check);button.onclick=()=>{if(isSelected&&collapsed){collapsed=false}else{selected=network.ssid;ssid.value=network.ssid;if(!network.secure)password.value='';collapsed=true}draw(networks)};list.append(button)})}
async function loadNetworks(){try{const response=await fetch('/api/wifi/scan');const data=await response.json();draw(data.networks||[])}catch(error){list.innerHTML='<div class="empty">Wi-Fi 목록을 불러오지 못했습니다.</div>'}}
document.getElementById('form').onsubmit=async event=>{event.preventDefault();const target=ssid.value.trim();if(!target){notice('Wi-Fi 이름을 선택해 주세요.',true);return}connectButton.disabled=true;notice(`${target}에 연결을 시도합니다.`);try{const response=await fetch('/api/wifi/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ssid:target,password:password.value})});const data=await response.json();if(!response.ok)throw new Error(data.error||'저장에 실패했습니다.');notice('저장했습니다. 연결이 완료되면 이 AP가 자동으로 종료됩니다.')}catch(error){notice(error.message||'ESP32 설정 저장에 실패했습니다.',true);connectButton.disabled=false}};loadNetworks();
</script></body></html>
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

  wifiSetupServer.send(200, "text/html; charset=utf-8",
                       "<meta charset='utf-8'><p>연결을 시도합니다. 잠시 후 ESP32 시리얼 모니터에서 IP를 확인하세요.</p>");
  applyWifiCredentials(ssid, password);
}

void startWifiSetupPortal() {
  if (wifiSetupPortalRunning) {
    return;
  }

  // A scan cannot start while the STA interface is still associating.
  // Stop only the active attempt; keep saved credentials in flash.
  WiFi.disconnect(false, false);
  WiFi.mode(WIFI_STA);
  delay(150);
  refreshWifiScanCache();
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(WIFI_SETUP_AP_SSID, WIFI_SETUP_AP_PASSWORD);
  wifiSetupServer.on("/", HTTP_GET, sendWifiSetupPage);
  wifiSetupServer.on("/configure", HTTP_POST, handleWifiConfigure);
  wifiSetupServer.on("/api/wifi/status", HTTP_GET, handleWifiApiStatus);
  wifiSetupServer.on("/api/wifi/status", HTTP_OPTIONS, handleWifiApiOptions);
  wifiSetupServer.on("/api/wifi/scan", HTTP_GET, handleWifiApiScan);
  wifiSetupServer.on("/api/wifi/scan", HTTP_OPTIONS, handleWifiApiOptions);
  wifiSetupServer.on("/api/wifi/connect", HTTP_POST, handleWifiApiConnect);
  wifiSetupServer.on("/api/wifi/connect", HTTP_OPTIONS, handleWifiApiOptions);
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
  WiFi.disconnect(false, false);
  delay(50);
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
      String(MQTT_PASSWORD).length() == 0 ||
      (MQTT_TLS_VERIFY_CA && String(MQTT_ROOT_CA).indexOf("PASTE_") >= 0)) {
    Serial.println("[mqtt] configuration missing in mqtt_secrets.h");
    return;
  }

  if (MQTT_TLS_VERIFY_CA && time(nullptr) < 1700000000) {
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
    if (MQTT_TLS_VERIFY_CA) {
      mqttTlsClient.setCACert(MQTT_ROOT_CA);
    } else {
      mqttTlsClient.setInsecure();
      Serial.println("[mqtt] WARNING: TLS certificate verification is disabled");
    }
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
  mqttClient.subscribe("dispenser/pump/on");
  mqttClient.subscribe("dispenser/pump/speed");
  mqttClient.subscribe("dispenser/stop");
  mqttClient.subscribe("dispenser/tare");
  mqttClient.subscribe("dispenser/tare/food");
  mqttClient.subscribe("dispenser/tare/water");
  mqttClient.subscribe("dispenser/weight/request");
  mqttClient.subscribe("dispenser/wifi/setup");
  mqttClient.subscribe("dispenser/presence/config");
  publishDispenserStatus("online");
  publishDispenserWeight();
  Serial.println("[mqtt] connected and subscribed");
}

void serviceMqttSetupFallback() {
  if (WiFi.status() != WL_CONNECTED || mqttClient.connected()) {
    mqttDisconnectedSinceMs = 0;
    return;
  }

  if (mqttDisconnectedSinceMs == 0) {
    mqttDisconnectedSinceMs = millis();
    return;
  }

  if (!wifiSetupPortalRunning && millis() - mqttDisconnectedSinceMs >= MQTT_SETUP_PORTAL_DELAY_MS) {
    Serial.println("[mqtt] connection unavailable; starting Wi-Fi setup portal");
    startWifiSetupPortal();
  }
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

void publishPresenceWaterEventIfNeeded() {
  if (!mqttClient.connected() || presenceWaterEvent.length() == 0) return;

  String payload = "{\"event\":\"" + mqttJsonEscape(presenceWaterEvent) + "\"";
  payload += ",\"amount\":" + String(presenceWaterEventAmount);
  payload += ",\"request_id\":\"" + mqttJsonEscape(presenceWaterEventRequestId) + "\"";
  payload += ",\"user_id\":\"" + mqttJsonEscape(presenceWaterEventUserId) + "\"";
  payload += ",\"pet_id\":\"" + mqttJsonEscape(presenceWaterEventPetId) + "\"}";
  if (mqttClient.publish("dispenser/water/event", payload.c_str(), false)) {
    presenceWaterEvent = "";
    presenceWaterEventAmount = 0;
    presenceWaterEventRequestId = "";
    presenceWaterEventUserId = "";
    presenceWaterEventPetId = "";
  }
}

void loopMqttControl() {
  serviceWifiSetupPortal();
  connectWifiIfNeeded();
  connectMqttIfNeeded();
  serviceMqttSetupFallback();

  // 오거가 사료를 쏟는 중이거나 펌프가 물을 돌리는 중엔 저울이 흔들려 값이 무의미하다.
  // 멈추고 잠잠해질 때까지 측정을 미룬다. (serviceLoadCell() 이 이 다음에 돈다)
  if (motorStopAt != 0 || waterPumpStopAt != 0) {
    holdLoadCellSettle();
  }

  if (mqttClient.connected()) {
    mqttClient.loop();
    publishPresenceWaterEventIfNeeded();

    // 구동 시작/종료는 앱의 '정지' 버튼이 뜨고 지는 근거라 즉시 알린다.
    publishDispenserBusyChange();
    // 배출량은 저울이 잠잠해지는 즉시 한 번 나간다 — 주기 발행을 기다리지 않는다.
    publishFoodDispensedIfDone();

    unsigned long now = millis();
    if (now - lastMqttWeightPublishMs >= MQTT_WEIGHT_INTERVAL_MS) {
      lastMqttWeightPublishMs = now;
      publishDispenserWeight();
    }
  }
}
