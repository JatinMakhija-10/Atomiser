# Atomiser - Smart Humidity Controller

ESP32-based atomiser/humidifier controller with a real-time web dashboard featuring radial gauges, sparkline charts, schedule automation, data export, light/dark themes, and derived climate metrics.

## Architecture

```
┌─────────────────┐       WebSocket (81)       ┌─────────────────┐       WebSocket (3001)       ┌──────────────┐
│     ESP32        │ ◄──────────────────────►   │   Node.js       │ ◄──────────────────────►     │   Frontend    │
│  DHT11 + MOSFET  │       REST API (80)        │   Backend       │       REST API (3000)        │   Dashboard   │
│  + Atomiser      │ ◄──────────────────────►   │   + JSON Store  │ ◄──────────────────────►     │   (Browser)   │
└─────────────────┘                             └─────────────────┘                              └──────────────┘
```

## Hardware Connections

| Component | ESP32 Pin | Notes |
|-----------|-----------|-------|
| DHT11 Data | GPIO 4 | 10kΩ pull-up resistor to 3.3V |
| MOSFET Gate | GPIO 5 | Controls atomiser power |
| MOSFET Drain | Atomiser (-) | N-channel MOSFET (e.g., IRLZ44N) |
| MOSFET Source | GND | Common ground |
| Atomiser (+) | 5V/12V supply | Match your atomiser voltage |

## Quick Start

### Prerequisites

- **Node.js** (v16 or higher)
- **PlatformIO** (for flashing ESP32 firmware)
- **ESP32 dev board** + DHT11 sensor + N-channel MOSFET + atomiser module

### 1. Clone the Repository

```bash
git clone https://github.com/JatinMakhija-10/Atomiser.git
cd Atomiser
```

### 2. Flash ESP32 Firmware

```bash
cd firmware

# Edit WiFi credentials
# Open src/config.h and set WIFI_SSID and WIFI_PASSWORD

# Build and upload (requires PlatformIO)
pio run --target upload

# Monitor serial output
pio device monitor
```

### 3. Start Backend Server

```bash
cd backend
npm install
npm start
```

Set ESP32 IP via environment variable:
```bash
# Windows
set ESP32_IP=192.168.1.100
npm start

# Linux/Mac
ESP32_IP=192.168.1.100 npm start
```

### 4. Open Dashboard

Navigate to `http://localhost:3000` in your browser. The backend serves the frontend automatically.

## API Reference

### ESP32 Direct API (port 80)

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/status` | - | Current sensor data & state |
| POST | `/api/atomiser` | `{"state": true}` | Turn atomiser on/off |
| POST | `/api/config` | `{"autoMode": true, "threshold": 65}` | Set auto mode & threshold |

### Backend API (port 3000)

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/status` | - | Latest cached status |
| GET | `/api/readings?limit=100` | - | Historical sensor readings |
| GET | `/api/events?limit=50` | - | Event log |
| POST | `/api/atomiser` | `{"state": true}` | Toggle atomiser (proxied to ESP32) |
| POST | `/api/config` | `{"autoMode": true, "threshold": 65}` | Update config (proxied to ESP32) |
| POST | `/api/esp32-ip` | `{"ip": "192.168.1.100"}` | Change ESP32 IP at runtime |

## Features

- **Real-time monitoring** - Temperature & humidity via WebSocket with radial gauges
- **Sparkline charts** - Mini trend charts in each gauge card
- **Manual control** - Turn atomiser on/off from dashboard
- **Auto mode** - Automatic humidity control with configurable threshold + hysteresis
- **History charts** - 1H / 6H / 24H sensor data with toggleable lines & tooltip
- **Schedule automation** - Set daily on/off schedules (persisted in localStorage)
- **Data export** - Export readings as CSV or JSON
- **Light/Dark themes** - Toggle with Ctrl+T or the theme button
- **Derived metrics** - Dew point, heat index, absolute humidity, VPD, comfort level
- **Alert thresholds** - Custom temperature & humidity danger limits
- **Temperature units** - Switch between °C and °F
- **Min/Max tracking** - Track extremes with one-click reset
- **Event logging** - Filterable event log with type badges
- **Fullscreen mode** - Immersive dashboard view
- **Responsive** - Works on mobile & desktop
- **No external CDN** - Zero frontend dependencies, custom canvas charts

## File Structure

```
Atomiser/
├── firmware/
│   ├── platformio.ini          # PlatformIO config
│   └── src/
│       ├── config.h            # WiFi, pin, and default settings
│       └── main.cpp            # ESP32 firmware
├── backend/
│   ├── package.json            # Node.js dependencies
│   ├── package-lock.json       # Locked dependency versions
│   ├── server.js               # Express + WebSocket + JSON store
│   └── data/                   # Runtime JSON data (auto-created)
├── frontend/
│   ├── index.html              # Dashboard HTML (v2.0)
│   ├── style.css               # Light/dark theme styles
│   ├── app.js                  # Dashboard logic, gauges, schedules, export
│   └── chart.js                # Custom canvas chart + sparkline class
└── README.md
```

## Configuration

Edit `firmware/src/config.h` to set:
- `WIFI_SSID` / `WIFI_PASSWORD` - Your WiFi network
- `DHT_PIN` (default: GPIO 4) - DHT11 data pin
- `MOSFET_PIN` (default: GPIO 5) - MOSFET gate pin
- `DEFAULT_HUMIDITY_THRESHOLD` (default: 60%) - Auto mode threshold

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `npm install` fails | Make sure Node.js v16+ is installed |
| Can't connect to ESP32 | Check WiFi credentials in `config.h`, ensure ESP32 is on the same network |
| Dashboard shows "Disconnected" | Set ESP32 IP via the dashboard settings or `ESP32_IP` env variable |
| Port 3000 in use | `npx kill-port 3000` or change port in `server.js` |
