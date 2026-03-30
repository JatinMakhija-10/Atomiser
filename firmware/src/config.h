// ============================================
// Atomiser Project - Configuration
// ============================================

#ifndef CONFIG_H
#define CONFIG_H

// ----- WiFi Credentials -----
#define WIFI_SSID     "Jatin"
#define WIFI_PASSWORD "jatin123"

// ----- WiFi Network (optional static IP) -----
#define USE_STATIC_IP false
#define STATIC_IP     {192, 168, 1, 100}
#define GATEWAY_IP    {192, 168, 1, 1}
#define SUBNET_MASK   {255, 255, 255, 0}
#define DNS1_IP       {8, 8, 8, 8}

// ----- WiFi Retry -----
#define WIFI_MAX_ATTEMPTS       60
#define WIFI_RETRY_INTERVAL_MS  5000

// ----- Pin Definitions -----
#define DHT_PIN       4      // DHT11 data pin (GPIO4)
#define MOSFET_PIN    18     // MOSFET gate pin

#define DHT_TYPE      DHT11  // Sensor type

// --- Sensors ---
#define WATER_LVL_PIN 36     // Water Level Sensor (Analog) - VP
#define GAS_SENSOR_PIN 39    // Gas Sensor (MQ Series) - VN
#define OLED_SDA      21     // OLED I2C SDA
#define OLED_SCL      22     // OLED I2C SCL


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
