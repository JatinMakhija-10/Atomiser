// ============================================
// Atomiser Dashboard - Enhanced Application
// Radial Gauges, Notifications, Derived Metrics
// ============================================

const API_BASE = window.location.origin;
const WS_URL = `ws://${window.location.hostname}:3001`;

let ws = null;
let chart = null;
let chartRange = '1h';
let reconnectTimer = null;
let tempGauge, humGauge;

// ============================================
// State
// ============================================
let state = {
  temperature: 0,
  humidity: 0,
  atomiserOn: false,
  autoMode: false,
  threshold: 60,
  sensorError: false,
  connected: false,
  uptime: 0,
  ip: '',
};

// Min / max tracking
let tempMin = Infinity, tempMax = -Infinity;
let humMin = Infinity, humMax = -Infinity;

// ============================================
// Initialize
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  chart = new SensorChart('chart');
  tempGauge = new RadialGauge('tempGauge', { min: 0, max: 50, color: '#fb923c', glowColor: 'rgba(251,146,60,0.3)', label: '°C' });
  humGauge = new RadialGauge('humGauge', { min: 0, max: 100, color: '#38bdf8', glowColor: 'rgba(56,189,248,0.3)', label: '%' });

  createBgParticles();
  startClock();
  connectWebSocket();
  fetchStatus();
  fetchReadings();
  fetchEvents();
  updateThresholdFill();
});

// ============================================
// Background Particles
// ============================================
function createBgParticles() {
  const container = document.getElementById('bgParticles');
  for (let i = 0; i < 15; i++) {
    const p = document.createElement('div');
    p.className = 'bg-particle';
    const size = 2 + Math.random() * 4;
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (15 + Math.random() * 25) + 's';
    p.style.animationDelay = (Math.random() * 20) + 's';
    p.style.opacity = 0.2 + Math.random() * 0.3;
    container.appendChild(p);
  }
}

// ============================================
// Live Clock
// ============================================
function startClock() {
  const el = document.getElementById('liveClock');
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  tick();
  setInterval(tick, 1000);
}

// ============================================
// Radial Gauge Class
// ============================================
class RadialGauge {
  constructor(canvasId, opts) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.min = opts.min;
    this.max = opts.max;
    this.color = opts.color;
    this.glowColor = opts.glowColor;
    this.value = 0;
    this.targetValue = 0;
    this.animating = false;

    const dpr = window.devicePixelRatio || 1;
    this.size = 200;
    this.canvas.width = this.size * dpr;
    this.canvas.height = this.size * dpr;
    this.canvas.style.width = this.size + 'px';
    this.canvas.style.height = this.size + 'px';
    this.ctx.scale(dpr, dpr);
    this.draw();
  }

  setValue(val) {
    this.targetValue = Math.max(this.min, Math.min(this.max, val));
    if (!this.animating) this.animate();
  }

  animate() {
    this.animating = true;
    const step = () => {
      const diff = this.targetValue - this.value;
      if (Math.abs(diff) < 0.1) {
        this.value = this.targetValue;
        this.draw();
        this.animating = false;
        return;
      }
      this.value += diff * 0.12;
      this.draw();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  draw() {
    const ctx = this.ctx;
    const s = this.size;
    const cx = s / 2;
    const cy = s / 2 + 10;
    const r = s / 2 - 20;

    ctx.clearRect(0, 0, s, s);

    const startAngle = 0.75 * Math.PI;
    const endAngle = 2.25 * Math.PI;
    const range = endAngle - startAngle;
    const pct = (this.value - this.min) / (this.max - this.min);
    const valueAngle = startAngle + pct * range;

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.25)';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Value arc with glow
    if (pct > 0.005) {
      ctx.shadowColor = this.glowColor;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, valueAngle);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Tick marks
    for (let i = 0; i <= 10; i++) {
      const angle = startAngle + (i / 10) * range;
      const innerR = r - 16;
      const outerR = r - (i % 5 === 0 ? 22 : 19);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
      ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
      ctx.strokeStyle = i % 5 === 0 ? 'rgba(148, 163, 184, 0.5)' : 'rgba(71, 85, 105, 0.3)';
      ctx.lineWidth = i % 5 === 0 ? 2 : 1;
      ctx.stroke();
    }

    // Needle dot
    const dotR = 4;
    const dotDist = r;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(valueAngle) * dotDist, cy + Math.sin(valueAngle) * dotDist, dotR, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// ============================================
// Toast Notifications
// ============================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };

  toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ============================================
// WebSocket Connection
// ============================================
function connectWebSocket() {
  if (ws) {
    try { ws.close(); } catch (e) { /* ignore */ }
  }

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('WebSocket connected');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const prevConnected = state.connected;
      const prevAtomiser = state.atomiserOn;
      updateState(data);
      chart.addPoint(data.temperature, data.humidity);

      if (!prevConnected && data.connected) {
        showToast('Connected to ESP32', 'success');
      }
      if (prevAtomiser !== data.atomiserOn && data.connected) {
        showToast(`Atomiser ${data.atomiserOn ? 'activated' : 'deactivated'}`, data.atomiserOn ? 'info' : 'success');
      }
    } catch (e) {
      console.error('WS message error:', e);
    }
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    state.connected = false;
    updateUI();
    scheduleReconnect();
  };

  ws.onerror = () => {
    state.connected = false;
    updateUI();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, 3000);
}

// ============================================
// API Calls
// ============================================
async function fetchStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    const data = await res.json();
    updateState(data);
  } catch (e) {
    console.error('Failed to fetch status:', e);
  }
}

async function fetchReadings() {
  try {
    const now = new Date();
    let after;
    switch (chartRange) {
      case '1h': after = new Date(now - 3600000); break;
      case '6h': after = new Date(now - 21600000); break;
      case '24h': after = new Date(now - 86400000); break;
    }
    const res = await fetch(`${API_BASE}/api/readings?after=${after.toISOString()}`);
    const readings = await res.json();
    if (readings.length > 0) {
      chart.setData(readings);

      // Update min/max from history
      readings.forEach(r => {
        if (r.temperature < tempMin) tempMin = r.temperature;
        if (r.temperature > tempMax) tempMax = r.temperature;
        if (r.humidity < humMin) humMin = r.humidity;
        if (r.humidity > humMax) humMax = r.humidity;
      });
      updateMinMax();
    }
  } catch (e) {
    console.error('Failed to fetch readings:', e);
  }
}

async function fetchEvents() {
  try {
    const res = await fetch(`${API_BASE}/api/events?limit=30`);
    const events = await res.json();
    renderEvents(events);
  } catch (e) {
    console.error('Failed to fetch events:', e);
  }
}

async function toggleAtomiser() {
  const newState = !state.atomiserOn;
  const btn = document.getElementById('powerBtn');
  btn.style.pointerEvents = 'none';
  try {
    const res = await fetch(`${API_BASE}/api/atomiser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: newState }),
    });
    const data = await res.json();
    if (data.error) {
      showToast(data.error, 'error');
    } else {
      updateState(data);
    }
  } catch (e) {
    showToast('Failed to reach ESP32', 'error');
  }
  btn.style.pointerEvents = '';
  fetchEvents();
}

async function toggleAutoMode() {
  const enabled = document.getElementById('autoModeToggle').checked;
  try {
    const res = await fetch(`${API_BASE}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoMode: enabled }),
    });
    const data = await res.json();
    if (data.error) {
      showToast(data.error, 'error');
    } else {
      updateState(data);
      showToast(`Auto mode ${enabled ? 'enabled' : 'disabled'}`, 'success');
    }
  } catch (e) {
    showToast('Failed to update config', 'error');
  }
  fetchEvents();
}

async function setThreshold() {
  const value = parseInt(document.getElementById('thresholdSlider').value);
  try {
    const res = await fetch(`${API_BASE}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threshold: value }),
    });
    const data = await res.json();
    if (!data.error) {
      updateState(data);
    }
  } catch (e) {
    showToast('Failed to set threshold', 'error');
  }
}

async function updateEspIp() {
  const input = document.getElementById('espIpInput');
  const ip = input.value.trim();
  if (!ip) return;
  try {
    const res = await fetch(`${API_BASE}/api/esp32-ip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip }),
    });
    const data = await res.json();
    if (data.success) {
      input.value = '';
      document.getElementById('currentIpDisplay').textContent = ip;
      showToast(`ESP32 IP updated to ${ip}`, 'success');
    }
  } catch (e) {
    showToast('Failed to update IP', 'error');
  }
}

// ============================================
// Chart Range
// ============================================
function setChartRange(range, btn) {
  chartRange = range;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  fetchReadings();
}

// ============================================
// Threshold UI
// ============================================
function updateThresholdLabel() {
  const val = document.getElementById('thresholdSlider').value;
  document.getElementById('thresholdBadge').textContent = val + '%';
  updateThresholdFill();
}

function updateThresholdFill() {
  const slider = document.getElementById('thresholdSlider');
  const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.background = `linear-gradient(to right, #0ea5e9 0%, #0ea5e9 ${pct}%, rgba(71,85,105,0.3) ${pct}%)`;
}

// ============================================
// Derived Metrics
// ============================================
function calcDewPoint(t, rh) {
  if (rh <= 0) return 0;
  const a = 17.27, b = 237.7;
  const alpha = (a * t) / (b + t) + Math.log(rh / 100);
  return (b * alpha) / (a - alpha);
}

function calcHeatIndex(t, rh) {
  // Simplified Rothfusz regression
  if (t < 27) return t;
  const c1 = -8.784, c2 = 1.611, c3 = 2.338, c4 = -0.146,
        c5 = -0.0126, c6 = -0.0164, c7 = 0.00221, c8 = 0.000725, c9 = -0.00000304;
  return c1 + c2*t + c3*rh + c4*t*rh + c5*t*t + c6*rh*rh + c7*t*t*rh + c8*t*rh*rh + c9*t*t*rh*rh;
}

function getComfortLevel(t, rh) {
  if (rh >= 40 && rh <= 60 && t >= 20 && t <= 26) return { label: 'Ideal', class: 'success' };
  if (rh >= 30 && rh <= 70 && t >= 18 && t <= 28) return { label: 'Good', class: 'success' };
  if (rh < 30) return { label: 'Too Dry', class: 'warning' };
  if (rh > 70) return { label: 'Too Humid', class: 'warning' };
  return { label: 'Fair', class: 'info' };
}

// ============================================
// UI Updates
// ============================================
function updateState(data) {
  state = { ...state, ...data };
  updateUI();
}

function updateMinMax() {
  document.getElementById('tempMin').textContent = tempMin === Infinity ? '--' : tempMin.toFixed(1) + '°';
  document.getElementById('tempMax').textContent = tempMax === -Infinity ? '--' : tempMax.toFixed(1) + '°';
  document.getElementById('humMin').textContent = humMin === Infinity ? '--' : humMin.toFixed(1) + '%';
  document.getElementById('humMax').textContent = humMax === -Infinity ? '--' : humMax.toFixed(1) + '%';
}

function updateUI() {
  const { temperature, humidity, atomiserOn, autoMode, threshold, sensorError, connected, uptime, ip } = state;

  // Connection badge
  const badge = document.getElementById('connectionBadge');
  badge.classList.toggle('connected', connected);
  badge.querySelector('.label').textContent = connected ? 'Connected' : 'Disconnected';

  // Alert banner
  const alert = document.getElementById('alertBanner');
  alert.classList.toggle('visible', sensorError);

  // Gauges
  if (!sensorError) {
    tempGauge.setValue(temperature);
    humGauge.setValue(humidity);
    document.getElementById('tempValue').textContent = temperature.toFixed(1);
    document.getElementById('humValue').textContent = humidity.toFixed(1);

    // Track min/max
    if (connected && temperature > 0) {
      if (temperature < tempMin) tempMin = temperature;
      if (temperature > tempMax) tempMax = temperature;
      if (humidity < humMin) humMin = humidity;
      if (humidity > humMax) humMax = humidity;
      updateMinMax();
    }

    // Derived metrics
    const dp = calcDewPoint(temperature, humidity);
    const hi = calcHeatIndex(temperature, humidity);
    const comfort = getComfortLevel(temperature, humidity);

    document.getElementById('dewPoint').textContent = dp.toFixed(1) + '°C';
    document.getElementById('heatIndex').textContent = hi.toFixed(1) + '°C';
    document.getElementById('comfortLevel').textContent = comfort.label;

    const comfortIcon = document.getElementById('comfortIcon');
    comfortIcon.className = 'stat-icon comfort-icon';

  } else {
    document.getElementById('tempValue').textContent = '--';
    document.getElementById('humValue').textContent = '--';
    document.getElementById('dewPoint').textContent = '--';
    document.getElementById('heatIndex').textContent = '--';
    document.getElementById('comfortLevel').textContent = '--';
  }

  // Uptime
  document.getElementById('uptime').textContent = formatUptime(uptime);

  // Power button
  const powerBtn = document.getElementById('powerBtn');
  const mistRing = document.getElementById('mistRing');
  const powerStatus = document.getElementById('powerStatus');
  const powerSubtext = document.getElementById('powerSubtext');

  powerBtn.classList.toggle('active', atomiserOn);
  mistRing.classList.toggle('active', atomiserOn);
  powerStatus.classList.toggle('on', atomiserOn);
  powerStatus.textContent = atomiserOn ? 'ON' : 'OFF';
  powerSubtext.textContent = atomiserOn ? 'Tap to deactivate' : 'Tap to activate';

  // Auto mode
  document.getElementById('autoModeToggle').checked = autoMode;
  document.getElementById('autoStatusText').textContent = autoMode ? 'Active — monitoring humidity' : 'Disabled';

  // Threshold
  document.getElementById('thresholdSlider').value = threshold;
  document.getElementById('thresholdBadge').textContent = Math.round(threshold) + '%';
  updateThresholdFill();

  // Chart threshold line
  if (chart) chart.setThreshold(threshold);

  // IP display
  if (ip) document.getElementById('currentIpDisplay').textContent = ip;
}

function renderEvents(events) {
  const list = document.getElementById('eventsList');
  if (!events || events.length === 0) {
    list.innerHTML = `
      <div class="event-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span>No events yet</span>
      </div>`;
    return;
  }

  list.innerHTML = events.map(e => {
    const time = new Date(e.created_at).toLocaleString([], {
      hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric'
    });
    return `
      <div class="event-item">
        <div class="event-left">
          <span class="event-type ${e.type}">${e.type}</span>
          <span class="event-msg">${escapeHtml(e.message)}</span>
        </div>
        <span class="event-time">${time}</span>
      </div>
    `;
  }).join('');
}

function formatUptime(seconds) {
  if (!seconds || seconds < 0) return '--';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
