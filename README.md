# ?? Atomiser - Smart Humidity Controller

An advanced, ESP32-based Smart Humidifier/Atomiser controller. It features a full real-time web dashboard with radial gauges, sparkline charts, smart scheduling, gas/safety thresholds, and automated environmental control.

![Dashboard Preview](https://img.shields.io/badge/Status-Active-brightgreen) ![License: MIT](https://img.shields.io/badge/License-MIT-blue) ![C++](https://img.shields.io/badge/Firmware-PlatformIO-orange) ![Node.js](https://img.shields.io/badge/Backend-Node.js-green)

---

## ?? Features

*   **Real-time Monitoring** - Live Temperature, Humidity, Gas Levels, and Water Levels pushed instantly over WebSockets.
*   **Auto Mode** - Set a target humidity threshold; the ESP32 will automatically turn the atomiser on or off to maintain perfect conditions.
*   **Safety Overrides** - Built-in MQ Gas Sensor tracking. If toxic gas or smoke exceeds limits, the atomiser is forcibly disabled to prevent fire hazards.
*   **OLED On-Device Display** - See live stats directly on the physical hardware via an I2C 128x64 display.
*   **Beautiful Dashboard** - Radial gauges, sparklines, responsive UI, Dark/Light modes, and historic line charts built with zero external dependencies.
*   **Derived Climate Metrics** - Calculates Dew Point, Heat Index, Absolute Humidity, and Vapor Pressure Deficit (VPD).
*   **Event Logging & Export** - View a history of ON/OFF triggers and export history to CSV or JSON.

---

## ??? Architecture

`	ext
+-----------------+       WebSocket (81)       +-----------------+       WebSocket (3001)       +-----------------+
¦     ESP32       ¦ ?------------------------? ¦   Node.js       ¦ ?------------------------? ¦   Frontend    ¦
¦  Sensors + OLED ¦       REST API (80)        ¦   Backend       ¦       REST API (3000)        ¦   Dashboard   ¦
¦  + MOSFET Power ¦ ?------------------------? ¦   + JSON Store  ¦ ?------------------------? ¦   (Browser)   ¦
+-----------------+                            +-----------------+                              +-----------------+
`

---

## ?? Hardware Setup & Pin Map

Here is the exact schematic connection required for this project.

### Power Distribution
*   **3V3** ? DHT Sensor, Water Level Sensor, OLED Display.
*   **VIN (5V)** ? MQ Gas Sensor.
*   **GND** ? Must be shared across ALL modules, the ESP32, and the MOSFET power supply.

### Module Pin Mappings

| Component | ESP32 Pin | Notes |
| :--- | :--- | :--- |
| **DHT11 Data** | GPIO 4 | Temperature & Humidity Sensor |
| **Water Level Sensor** | GPIO 36 (VP) | Analog read for water tank depth |
| **MQ Gas Sensor** | GPIO 39 (VN) | Analog read for smoke/gas safety override |
| **OLED (SDA)** | GPIO 21 | I2C Display Data |
| **OLED (SCL)** | GPIO 22 | I2C Display Clock |
| **MOSFET Gate** | GPIO 18 | Triggers the Atomiser. Add a 10kO pull-down resistor + 220O trace. |

**?? Critical Hardware Warnings:**
*   Never draw power for the Atomiser Module directly from the ESP32 pins. Use a dedicated 5V/12V external power supply through the MOSFET.
*   Do not apply 5V logic to input-only pins like GPIO 36 or 39.

---

## ?? Installation & Setup

For a full step-by-step tutorial on cloning, flashing the ESP32, and running the node server from scratch, please see the **[SETUP_GUIDE.md](./SETUP_GUIDE.md)**!

### Quick Start Overview:
1.  **Clone the Repo**: git clone https://github.com/JatinMakhija-10/Atomiser.git
2.  **Flash Firmware**: Edit your WiFi credentials in irmware/src/config.h, then use PlatformIO to pio run -t upload.
3.  **Start Backend**: Navigate to ackend/, run 
pm install, then set the ESP32 IP dynamic variable:
    `powershell
    $env:ESP32_IP="192.168.1.X"; node server.js
    `
4.  **Open Dashboard**: Go to http://localhost:3000 in your web browser.

---

## ?? API Reference

### ESP32 Direct API (Internal Network - Port 80)
| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | /api/status | - | Returns full JSON of all sensors and current states. |
| POST | /api/atomiser | {"state": true} | Force turns atomiser on or off (subject to safety limits). |
| POST | /api/config | {"autoMode": true, "threshold": 60} | Sets automation thresholds. |

### Node.js Backend API (Dashboard Facing - Port 3000)
| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | /api/status | - | Returns cached status. |
| GET | /api/readings | - | Returns historic JSON array data for the chart. |
| POST | /api/esp32-ip | {"ip": "192.168.1.X"} | Change target ESP32 IP dynamically without restarting backend. |

---

## ?? Project Structure

`	ext
Atomiser/
+-- firmware/
¦   +-- platformio.ini          # PlatformIO config
¦   +-- src/
¦       +-- config.h            # WiFi, pin mappings, default thresholds
¦       +-- main.cpp            # C++ ESP32 Code
+-- backend/
¦   +-- package.json            # Node.js dependencies
¦   +-- server.js               # Express + WebSocket relay + JSON Database
¦   +-- data/                   # Runtime JSON logging (auto-created)
+-- frontend/
¦   +-- index.html              # Beautiful UI
¦   +-- style.css               # Theming & Layout
¦   +-- app.js                  # Frontend logic & API handling
¦   +-- chart.js                # Custom zero-dependency canvas renderer
+-- README.md                   # This file
+-- SETUP_GUIDE.md              # Detailed new-user startup guide
`

---

## ??? Troubleshooting

**"ESP32 Unreachable" Error on Dashboard:**
The Node backend cannot route traffic to the ESP32. Provide the correct local IP using the Settings modal on the dashboard, or restart server.js with the correct $env:ESP32_IP system variable.

**Atomiser clicks 'ON' but immediately turns 'OFF':**
Check the Dashboard's **"System Safety"** panel. If the Gas Sensor analog value exceeds 2500, the ESP32 permanently forces the Atomiser OFF as a hardcoded safety override to prevent hazards. Check your wiring on GPIO 39.
