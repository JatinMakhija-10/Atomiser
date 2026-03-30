// ============================================
// Atomiser Backend Server
// Bridges ESP32 <-> Frontend, stores history
// ============================================

const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

// ============================================
// Configuration
// ============================================
const PORT = 3000;
const WS_PORT = 3001;
let ESP32_IP = process.env.ESP32_IP || '192.168.1.100';
const ESP32_WS_PORT = 81;

// ============================================
// Simple JSON File Store
// ============================================
const DATA_DIR = path.join(__dirname, 'data');
const READINGS_FILE = path.join(DATA_DIR, 'readings.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const MAX_READINGS = 5000;
const MAX_EVENTS = 500;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) { /* corrupt file, reset */ }
  return fallback;
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data), 'utf8');
}

let readings = loadJson(READINGS_FILE, []);
let events = loadJson(EVENTS_FILE, []);

function addReading(temp, hum, atomiserOn, autoMode, waterLevelAnalog, gasAnalog, waterHeightCm) {
  readings.push({
    temperature: temp,
    humidity: hum,
    atomiser_on: atomiserOn ? 1 : 0,
    auto_mode: autoMode ? 1 : 0,
    waterLevelAnalog: waterLevelAnalog || 0,
    gasAnalog: gasAnalog || 0,
    waterHeightCm: waterHeightCm || 0,
    created_at: new Date().toISOString(),
  });
  if (readings.length > MAX_READINGS) readings = readings.slice(-MAX_READINGS);
  saveJson(READINGS_FILE, readings);
}

function addEvent(type, message) {
  events.unshift({ type, message, created_at: new Date().toISOString() });
  if (events.length > MAX_EVENTS) events = events.slice(0, MAX_EVENTS);
  saveJson(EVENTS_FILE, events);
}

// ============================================
// Express App
// ============================================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

let latestStatus = {
  temperature: 0,
  humidity: 0,
  atomiserOn: false,
  autoMode: false,
  threshold: 60,
  sensorError: false,
  uptime: 0,
  ip: ESP32_IP,
  connected: false,
  waterLevelAnalog: 0,
  gasAnalog: 0,
  waterHeightCm: 0,
  flyingFishA: 0,
  flyingFishD: 0,
  waterSafetyD: 0,
  safetyOverrideOff: false,
};

// ----- API Routes -----

// GET /api/status
app.get('/api/status', (req, res) => {
  res.json(latestStatus);
});

// GET /api/readings?limit=100&after=2024-01-01
app.get('/api/readings', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 5000);
  const after = req.query.after;

  if (after && /^\d{4}-\d{2}-\d{2}/.test(after)) {
    const filtered = readings.filter(r => r.created_at >= after);
    res.json(filtered.slice(-limit));
  } else {
    res.json(readings.slice(-limit));
  }
});

// GET /api/events?limit=50
app.get('/api/events', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  res.json(events.slice(0, limit));
});

// POST /api/atomiser - Toggle atomiser
app.post('/api/atomiser', async (req, res) => {
  const { state } = req.body;
  if (typeof state !== 'boolean') {
    return res.status(400).json({ error: 'state must be boolean' });
  }

  try {
    const response = await fetch(`http://${ESP32_IP}/api/atomiser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    latestStatus = { ...latestStatus, ...data, connected: true };
    addEvent('manual', `Atomiser turned ${state ? 'ON' : 'OFF'}`);
    res.json(data);
  } catch (err) {
    latestStatus.connected = false;
    res.status(502).json({ error: 'ESP32 unreachable', details: err.message });
  }
});

// POST /api/config - Update auto mode & threshold
app.post('/api/config', async (req, res) => {
  const { autoMode, threshold } = req.body;
  const body = {};
  if (typeof autoMode === 'boolean') body.autoMode = autoMode;
  if (typeof threshold === 'number' && threshold >= 20 && threshold <= 95) body.threshold = threshold;

  if (Object.keys(body).length === 0) {
    return res.status(400).json({ error: 'No valid config provided' });
  }

  try {
    const response = await fetch(`http://${ESP32_IP}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    latestStatus = { ...latestStatus, ...data, connected: true };
    addEvent('config', `Config updated: ${JSON.stringify(body)}`);
    res.json(data);
  } catch (err) {
    latestStatus.connected = false;
    res.status(502).json({ error: 'ESP32 unreachable', details: err.message });
  }
});

// POST /api/esp32-ip - Update ESP32 IP at runtime
app.post('/api/esp32-ip', (req, res) => {
  const { ip } = req.body;
  if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return res.status(400).json({ error: 'Invalid IP address format' });
  }
  ESP32_IP = ip;
  latestStatus.ip = ip;
  addEvent('config', `ESP32 IP changed to ${ip}`);
  connectToESP32();
  res.json({ success: true, ip });
});

// Fallback to frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ============================================
// HTTP Server
// ============================================
const httpServer = http.createServer(app);
httpServer.listen(PORT, () => {
  console.log(`\n  Atomiser Backend running on http://localhost:${PORT}`);
  console.log(`  ESP32 target: ${ESP32_IP}`);
});

// ============================================
// WebSocket Server (Frontend <-> Backend)
// ============================================
const wss = new WebSocketServer({ port: WS_PORT });
console.log(`  WebSocket server on ws://localhost:${WS_PORT}`);

wss.on('connection', (ws) => {
  console.log('Frontend client connected');
  ws.send(JSON.stringify(latestStatus));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (esp32Ws && esp32Ws.readyState === WebSocket.OPEN) {
        esp32Ws.send(JSON.stringify(msg));
      }
    } catch (e) {
      // ignore malformed messages
    }
  });
});

function broadcastToClients(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// ============================================
// ESP32 WebSocket Connection
// ============================================
let esp32Ws = null;
let esp32ReconnectTimer = null;
let saveCounter = 0;

function connectToESP32() {
  if (esp32Ws) {
    try { esp32Ws.close(); } catch (e) { /* ignore */ }
  }

  const wsUrl = `ws://${ESP32_IP}:${ESP32_WS_PORT}`;
  console.log(`Connecting to ESP32 at ${wsUrl}...`);

  try {
    esp32Ws = new WebSocket(wsUrl);
  } catch (err) {
    console.log('Failed to create WebSocket:', err.message);
    scheduleReconnect();
    return;
  }

  esp32Ws.on('open', () => {
    console.log('Connected to ESP32');
    latestStatus.connected = true;
    broadcastToClients(latestStatus);
    addEvent('connection', 'Connected to ESP32');
  });

  esp32Ws.on('message', (data) => {
    try {
      const status = JSON.parse(data);
      const prevState = latestStatus.atomiserOn;
      latestStatus = { ...status, connected: true };

      broadcastToClients(latestStatus);

      // Save reading every 30 seconds
      saveCounter++;
      if (saveCounter >= 30) {
        saveCounter = 0;
        addReading(status.temperature, status.humidity, status.atomiserOn, status.autoMode, status.waterLevelAnalog, status.gasAnalog, status.waterHeightCm);
      }

      if (prevState !== status.atomiserOn) {
        addEvent('auto', `Atomiser ${status.atomiserOn ? 'ON' : 'OFF'} (auto)`);
      }
    } catch (e) {
      // ignore malformed
    }
  });

  esp32Ws.on('close', () => {
    console.log('ESP32 disconnected');
    latestStatus.connected = false;
    broadcastToClients(latestStatus);
    scheduleReconnect();
  });

  esp32Ws.on('error', (err) => {
    console.log('ESP32 WS error:', err.message);
    latestStatus.connected = false;
  });
}

function scheduleReconnect() {
  if (esp32ReconnectTimer) clearTimeout(esp32ReconnectTimer);
  esp32ReconnectTimer = setTimeout(connectToESP32, 5000);
}

connectToESP32();

// ============================================
// Graceful Shutdown
// ============================================
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  if (esp32Ws) esp32Ws.close();
  process.exit(0);
});
