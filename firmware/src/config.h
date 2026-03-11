// ============================================
// Atomiser Project - Configuration
// ============================================

#ifndef CONFIG_H
#define CONFIG_H

// ----- WiFi Credentials -----
#define WIFI_SSID     "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// ----- Pin Definitions -----
#define DHT_PIN       4      // DHT11 data pin (GPIO4)
#define MOSFET_PIN    5      // MOSFET gate pin (GPIO5)
#define DHT_TYPE      DHT11  // Sensor type

// ----- Atomiser Defaults -----
#define DEFAULT_HUMIDITY_THRESHOLD  60.0  // Auto-off humidity %
#define DEFAULT_AUTO_MODE           false
#define SENSOR_READ_INTERVAL        2000  // ms between readings
#define WS_BROADCAST_INTERVAL       1000  // ms between WebSocket broadcasts

// ----- Server -----
#define HTTP_PORT     80
#define WS_PORT       81
#define MDNS_NAME     "atomiser"

#endif
