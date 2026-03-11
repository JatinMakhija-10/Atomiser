# Atomiser - Smart Humidity Controller

ESP32-based atomiser/humidifier controller with real-time web dashboard.

## Architecture

```
┌─────────────────┐       WebSocket (81)       ┌─────────────────┐       WebSocket (3001)       ┌──────────────┐
│     ESP32        │ ◄──────────────────────►   │   Node.js       │ ◄──────────────────────►     │   Frontend    │
│  DHT11 + MOSFET  │       REST API (80)        │   Backend       │       REST API (3000)        │   Dashboard   │
│  + Atomiser      │ ◄──────────────────────►   │   + SQLite DB   │ ◄──────────────────────►     │   (Browser)   │
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

### 1. Flash ESP32 Firmware

```bash
cd firmware

# Edit WiFi credentials
# Open src/config.h and set WIFI_SSID and WIFI_PASSWORD

# Build and upload (requires PlatformIO)
pio run --target upload

# Monitor serial output
pio device monitor
```

### 2. Start Backend Server

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

### 3. Open Dashboard

Navigate to `http://localhost:3000` in your browser.

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

- **Real-time monitoring** - Temperature & humidity via WebSocket
- **Manual control** - Turn atomiser on/off from dashboard
- **Auto mode** - Automatic humidity control with configurable threshold
- **History charts** - 1H / 6H / 24H sensor data graphs
- **Event logging** - Track all actions and state changes
- **Responsive** - Works on mobile & desktop
- **No external CDN** - Zero dependencies in frontend, custom canvas charts

## File Structure

```
Atomiser/
├── firmware/
│   ├── platformio.ini          # PlatformIO config
│   └── src/
│       ├── config.h            # WiFi, pin, and default settings
│       └── main.cpp            # ESP32 firmware
├── backend/
│   ├── package.json
│   └── server.js               # Express + WebSocket + SQLite
├── frontend/
│   ├── index.html              # Dashboard HTML
│   ├── style.css               # Dark theme styles
│   ├── app.js                  # Dashboard logic & API calls
│   └── chart.js                # Custom canvas chart
└── README.md
```

## Configuration

Edit `firmware/src/config.h` to set:
- `WIFI_SSID` / `WIFI_PASSWORD` - Your WiFi network
- `DHT_PIN` (default: GPIO 4) - DHT11 data pin
- `MOSFET_PIN` (default: GPIO 5) - MOSFET gate pin
- `DEFAULT_HUMIDITY_THRESHOLD` (default: 60%) - Auto mode threshold
