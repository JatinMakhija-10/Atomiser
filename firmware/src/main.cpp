// ============================================
// Atomiser Project - ESP32 Firmware
// Controls atomiser via MOSFET, reads DHT11
// Serves REST API + WebSocket for real-time data
// ============================================

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <ESPmDNS.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include "config.h"

// ----- Globals -----
DHT dht(DHT_PIN, DHT_TYPE);
WebServer server(HTTP_PORT);
WebSocketsServer webSocket(WS_PORT);

float temperature = 0.0;
float humidity = 0.0;
bool atomiserOn = false;
bool autoMode = DEFAULT_AUTO_MODE;
float humidityThreshold = DEFAULT_HUMIDITY_THRESHOLD;
unsigned long lastSensorRead = 0;
unsigned long lastWsBroadcast = 0;
bool sensorError = false;

// ----- Forward Declarations -----
void setupWiFi();
void setupRoutes();
void readSensor();
void broadcastStatus();
void handleAtomiser();
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

  dht.begin();
  setupWiFi();

  if (MDNS.begin(MDNS_NAME)) {
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

  if (now - lastSensorRead >= SENSOR_READ_INTERVAL) {
    lastSensorRead = now;
    readSensor();
    handleAtomiser();
  }

  if (now - lastWsBroadcast >= WS_BROADCAST_INTERVAL) {
    lastWsBroadcast = now;
    broadcastStatus();
  }
}

// ============================================
// WiFi Setup
// ============================================
void setupWiFi() {
  Serial.printf("Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nConnected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\nWiFi connection failed! Restarting...");
    ESP.restart();
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

  // GET /api/status - Current sensor data & atomiser state
  server.on("/api/status", HTTP_GET, []() {
    sendCorsHeaders();
    server.send(200, "application/json", getStatusJson());
  });

  // POST /api/atomiser - Turn atomiser on/off
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
      atomiserOn = state;
      digitalWrite(MOSFET_PIN, atomiserOn ? HIGH : LOW);
      Serial.printf("Atomiser: %s\n", atomiserOn ? "ON" : "OFF");
    }

    server.send(200, "application/json", getStatusJson());
    broadcastStatus();
  });

  // POST /api/config - Update auto mode & threshold
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
// Sensor Reading
// ============================================
void readSensor() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (isnan(h) || isnan(t)) {
    sensorError = true;
    Serial.println("DHT read error!");
    return;
  }

  sensorError = false;
  humidity = h;
  temperature = t;
}

// ============================================
// Auto Mode Logic
// ============================================
void handleAtomiser() {
  if (!autoMode) return;

  if (humidity < humidityThreshold && !atomiserOn) {
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
// WebSocket
// ============================================
void webSocketEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.printf("WS[%u] Connected\n", num);
      webSocket.sendTXT(num, getStatusJson());
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
        atomiserOn = !atomiserOn;
        digitalWrite(MOSFET_PIN, atomiserOn ? HIGH : LOW);
      } else if (strcmp(cmd, "on") == 0) {
        atomiserOn = true;
        digitalWrite(MOSFET_PIN, HIGH);
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
// Status JSON Builder
// ============================================
String getStatusJson() {
  StaticJsonDocument<256> doc;
  doc["temperature"] = round(temperature * 10.0) / 10.0;
  doc["humidity"] = round(humidity * 10.0) / 10.0;
  doc["atomiserOn"] = atomiserOn;
  doc["autoMode"] = autoMode;
  doc["threshold"] = humidityThreshold;
  doc["sensorError"] = sensorError;
  doc["uptime"] = millis() / 1000;
  doc["ip"] = WiFi.localIP().toString();

  String output;
  serializeJson(doc, output);
  return output;
}
