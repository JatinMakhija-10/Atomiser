// ============================================
// Atomiser Project - ESP32 Firmware (Unified)
// Controls atomiser via MOSFET, reads DHT11 & multiple sensors
// OLED display, safety override, REST API + WebSocket
// ============================================

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <ESPmDNS.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "config.h"

// ----- Globals -----
DHT dht(DHT_PIN, DHT_TYPE);
WebServer server(HTTP_PORT);
WebSocketsServer webSocket(WS_PORT);

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
bool oledReady = false;

float temperature = 0.0;
float humidity = 0.0;
bool atomiserOn = false;
bool autoMode = DEFAULT_AUTO_MODE;
float humidityThreshold = DEFAULT_HUMIDITY_THRESHOLD;
unsigned long lastSensorRead = 0;
unsigned long lastWsBroadcast = 0;
bool sensorError = false;
unsigned long lastWiFiRetry = 0;
wl_status_t lastWiFiStatus = WL_IDLE_STATUS;
bool mdnsStarted = false;

// New sensor globals
int waterLevelAnalog = 0;
int gasAnalog = 0;
float waterHeightCm = 0.0;
int flyingFishA = 0;
int flyingFishD = 0;
int waterSafetyD = 0;
bool safetyOverrideOff = false;

// ----- Forward Declarations -----
void setupWiFi();
const char* wifiStatusToString(wl_status_t status);
void setupRoutes();
void readSensors();
void broadcastStatus();
void handleAtomiser();
void updateOLED();
void webSocketEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length);
String getStatusJson();
void sendCorsHeaders();

// ============================================
// SETUP
// ============================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== Atomiser Controller Starting ===");

  pinMode(MOSFET_PIN, OUTPUT);
  digitalWrite(MOSFET_PIN, LOW);

  // Setup new sensor pins
  pinMode(WATER_LVL_PIN, INPUT);
  pinMode(GAS_SENSOR_PIN, INPUT);
// removed
// removed
// removed

  // OLED Init
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed"));
    oledReady = false;
  } else {
    oledReady = true;
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("Atomiser Booting...");
    display.display();
  }

  dht.begin();
  setupWiFi();

  if (WiFi.status() == WL_CONNECTED && MDNS.begin(MDNS_NAME)) {
    mdnsStarted = true;
    Serial.printf("mDNS: http://%s.local\n", MDNS_NAME);
  }

  setupRoutes();
  server.begin();
  Serial.println("HTTP server started on port 80");

  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  Serial.println("WebSocket server started on port 81");
}

// ============================================
// LOOP
// ============================================
void loop() {
  server.handleClient();
  webSocket.loop();

  unsigned long now = millis();

  // WiFi reconnection logic (no reboot!)
  wl_status_t currentStatus = WiFi.status();
  if (currentStatus != lastWiFiStatus) {
    if (currentStatus == WL_CONNECTED) {
      Serial.printf("WiFi reconnected. IP: %s\n", WiFi.localIP().toString().c_str());
      if (!mdnsStarted && MDNS.begin(MDNS_NAME)) {
        mdnsStarted = true;
        Serial.printf("mDNS: http://%s.local\n", MDNS_NAME);
      }
    } else {
      mdnsStarted = false;
      Serial.printf("WiFi status: %s\n", wifiStatusToString(currentStatus));
    }
    lastWiFiStatus = currentStatus;
  }

  if (currentStatus != WL_CONNECTED && (now - lastWiFiRetry >= WIFI_RETRY_INTERVAL_MS)) {
    lastWiFiRetry = now;
    Serial.println("WiFi disconnected, retrying...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }

  if (now - lastSensorRead >= SENSOR_READ_INTERVAL) {
    lastSensorRead = now;
    readSensors();
    handleAtomiser();
    if (oledReady) updateOLED();
  }

  if (now - lastWsBroadcast >= WS_BROADCAST_INTERVAL) {
    lastWsBroadcast = now;
    broadcastStatus();
  }
}

// ============================================
// WiFi Setup (NO reboot on failure)
// ============================================
void setupWiFi() {
  Serial.printf("Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

#if USE_STATIC_IP
  IPAddress localIp STATIC_IP;
  IPAddress gateway GATEWAY_IP;
  IPAddress subnet SUBNET_MASK;
  IPAddress dns1 DNS1_IP;
  if (!WiFi.config(localIp, gateway, subnet, dns1)) {
    Serial.println("\nStatic IP config failed, using DHCP");
  }
#endif
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < WIFI_MAX_ATTEMPTS) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nConnected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.printf("\nWiFi connection failed (status=%s). Will retry in loop...\n", wifiStatusToString(WiFi.status()));
  }
}

const char* wifiStatusToString(wl_status_t status) {
  switch (status) {
    case WL_CONNECTED: return "CONNECTED";
    case WL_NO_SSID_AVAIL: return "NO_SSID";
    case WL_CONNECT_FAILED: return "CONNECT_FAILED";
    case WL_CONNECTION_LOST: return "CONNECTION_LOST";
    case WL_DISCONNECTED: return "DISCONNECTED";
    case WL_IDLE_STATUS: return "IDLE";
    default: return "UNKNOWN";
  }
}

// ============================================
// CORS Headers
// ============================================
void sendCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ============================================
// HTTP Routes
// ============================================
void setupRoutes() {
  // Preflight CORS
  server.on("/api/status", HTTP_OPTIONS, []() {
    sendCorsHeaders();
    server.send(204);
  });
  server.on("/api/atomiser", HTTP_OPTIONS, []() {
    sendCorsHeaders();
    server.send(204);
  });
  server.on("/api/config", HTTP_OPTIONS, []() {
    sendCorsHeaders();
    server.send(204);
  });

  // GET /api/status
  server.on("/api/status", HTTP_GET, []() {
    sendCorsHeaders();
    server.send(200, "application/json", getStatusJson());
  });

  // POST /api/atomiser
  server.on("/api/atomiser", HTTP_POST, []() {
    sendCorsHeaders();
    if (!server.hasArg("plain")) {
      server.send(400, "application/json", "{\"error\":\"No body\"}");
      return;
    }

    StaticJsonDocument<128> doc;
    DeserializationError err = deserializeJson(doc, server.arg("plain"));
    if (err) {
      server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
      return;
    }

    if (doc.containsKey("state")) {
      bool state = doc["state"].as<bool>();
      if (state && safetyOverrideOff) {
        atomiserOn = false;
        Serial.println("Atomiser: Prevented manual ON due to safety override");
      } else {
        atomiserOn = state;
        digitalWrite(MOSFET_PIN, atomiserOn ? HIGH : LOW);
        Serial.printf("Atomiser: %s\n", atomiserOn ? "ON" : "OFF");
      }
    }

    server.send(200, "application/json", getStatusJson());
    broadcastStatus();
  });

  // POST /api/config
  server.on("/api/config", HTTP_POST, []() {
    sendCorsHeaders();
    if (!server.hasArg("plain")) {
      server.send(400, "application/json", "{\"error\":\"No body\"}");
      return;
    }

    StaticJsonDocument<128> doc;
    DeserializationError err = deserializeJson(doc, server.arg("plain"));
    if (err) {
      server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
      return;
    }

    if (doc.containsKey("autoMode")) {
      autoMode = doc["autoMode"].as<bool>();
    }
    if (doc.containsKey("threshold")) {
      float t = doc["threshold"].as<float>();
      if (t >= 20.0 && t <= 95.0) {
        humidityThreshold = t;
      }
    }

    Serial.printf("Config: auto=%d, threshold=%.1f\n", autoMode, humidityThreshold);
    server.send(200, "application/json", getStatusJson());
    broadcastStatus();
  });

  // 404 handler
  server.onNotFound([]() {
    sendCorsHeaders();
    server.send(404, "application/json", "{\"error\":\"Not found\"}");
  });
}

// ============================================
// Sensor Reading (ALL sensors)
// ============================================
void readSensors() {
  // DHT11
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (isnan(h) || isnan(t)) {
    sensorError = true;
    Serial.println("DHT read error!");
  } else {
    sensorError = false;
    humidity = h;
    temperature = t;
  }

  // Analog & Digital sensors
  waterLevelAnalog = analogRead(WATER_LVL_PIN);
  gasAnalog = analogRead(GAS_SENSOR_PIN);
  flyingFishA = 0;
  flyingFishD = 0;
  waterSafetyD = LOW;

  waterHeightCm = -1.0; // No ultrasonic sensor

  // Safety Override Logic
  // Gas over threshold OR contact safety triggered
  if (gasAnalog > 2500 || waterSafetyD == HIGH) {
    safetyOverrideOff = true;
  } else {
    safetyOverrideOff = false;
  }

  // Print sensor summary periodically
  Serial.printf("T:%.1f H:%.1f Gas:%d WL:%d Dist:%.1f Fish:%d Safe:%d Override:%s\n",
    temperature, humidity, gasAnalog, waterLevelAnalog, waterHeightCm,
    flyingFishA, waterSafetyD, safetyOverrideOff ? "YES" : "NO");
}

// ============================================
// Auto Mode Logic (with safety override)
// ============================================
void handleAtomiser() {
  if (safetyOverrideOff && atomiserOn) {
    atomiserOn = false;
    digitalWrite(MOSFET_PIN, LOW);
    Serial.println("Safety Override: Atomiser forced OFF");
    return;
  }

  if (!autoMode) return;

  if (!safetyOverrideOff && humidity < humidityThreshold && !atomiserOn) {
    atomiserOn = true;
    digitalWrite(MOSFET_PIN, HIGH);
    Serial.println("Auto: Atomiser ON (humidity low)");
  } else if (humidity >= humidityThreshold && atomiserOn) {
    atomiserOn = false;
    digitalWrite(MOSFET_PIN, LOW);
    Serial.println("Auto: Atomiser OFF (humidity reached)");
  }
}

// ============================================
// OLED Display Update
// ============================================
void updateOLED() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);

  // Line 1: T & H
  display.printf("Temp:%.1fC Hum:%.1f%%\n", temperature, humidity);

  // Line 2: Atomiser status
  display.printf("Atm:%s Auto:%s\n", atomiserOn ? "ON" : "OFF", autoMode ? "ON" : "OFF");

  // Line 3: Ultrasonic & Level
  if (waterHeightCm == 999.0) {
    display.printf("Dist:ERR Wlvl:%d\n", waterLevelAnalog);
  } else {
    display.printf("Dist:%.1fcm Wlvl:%d\n", waterHeightCm, waterLevelAnalog);
  }

  // Line 4: Gas & Fish
  display.printf("Gas:%d Fish(A):%d\n", gasAnalog, flyingFishA);

  // Line 5: WiFi IP
  if (WiFi.status() == WL_CONNECTED) {
    display.printf("IP:%s\n", WiFi.localIP().toString().c_str());
  } else {
    display.println("WiFi: Disconnected");
  }

  // Line 6: Safety override notification
  if (safetyOverrideOff) {
    display.setCursor(0, 56);
    display.print("! SAFETY OVERRIDE !");
  }

  display.display();
}

// ============================================
// WebSocket
// ============================================
void webSocketEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.printf("WS[%u] Connected\n", num);
      {
        String statusPayload = getStatusJson();
        webSocket.sendTXT(num, statusPayload);
      }
      break;
    case WStype_DISCONNECTED:
      Serial.printf("WS[%u] Disconnected\n", num);
      break;
    case WStype_TEXT: {
      StaticJsonDocument<128> doc;
      DeserializationError err = deserializeJson(doc, payload, length);
      if (err) break;

      const char* cmd = doc["cmd"] | "";
      if (strcmp(cmd, "toggle") == 0) {
        if (!atomiserOn && safetyOverrideOff) {
          // Safety override active, ignore toggle ON
        } else {
          atomiserOn = !atomiserOn;
          digitalWrite(MOSFET_PIN, atomiserOn ? HIGH : LOW);
        }
      } else if (strcmp(cmd, "on") == 0) {
        if (!safetyOverrideOff) {
          atomiserOn = true;
          digitalWrite(MOSFET_PIN, HIGH);
        }
      } else if (strcmp(cmd, "off") == 0) {
        atomiserOn = false;
        digitalWrite(MOSFET_PIN, LOW);
      } else if (strcmp(cmd, "auto") == 0) {
        autoMode = doc["value"] | false;
      } else if (strcmp(cmd, "threshold") == 0) {
        float t = doc["value"] | 60.0;
        if (t >= 20.0 && t <= 95.0) humidityThreshold = t;
      }
      broadcastStatus();
      break;
    }
    default:
      break;
  }
}

void broadcastStatus() {
  String json = getStatusJson();
  webSocket.broadcastTXT(json);
}

// ============================================
// Status JSON Builder (includes ALL sensors)
// ============================================
String getStatusJson() {
  StaticJsonDocument<512> doc;
  doc["temperature"] = round(temperature * 10.0) / 10.0;
  doc["humidity"] = round(humidity * 10.0) / 10.0;
  doc["atomiserOn"] = atomiserOn;
  doc["autoMode"] = autoMode;
  doc["threshold"] = humidityThreshold;
  doc["sensorError"] = sensorError;
  doc["uptime"] = millis() / 1000;
  doc["ip"] = WiFi.localIP().toString();

  // New sensors
  doc["waterLevelAnalog"] = waterLevelAnalog;
  doc["gasAnalog"] = gasAnalog;
  doc["waterHeightCm"] = waterHeightCm == 999.0 ? -1.0 : round(waterHeightCm * 10.0) / 10.0;
  doc["flyingFishA"] = flyingFishA;
  doc["flyingFishD"] = flyingFishD;
  doc["waterSafetyD"] = waterSafetyD;
  doc["safetyOverrideOff"] = safetyOverrideOff;

  String output;
  serializeJson(doc, output);
  return output;
}
