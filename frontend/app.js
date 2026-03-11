// ============================================
// Atomiser Dashboard v2.0 - Enhanced Application
// Radial Gauges, Notifications, Derived Metrics,
// Schedules, Export, Themes, Sparklines, Alerts
// ============================================

const API_BASE = window.location.origin;
const WS_URL = `ws://${window.location.hostname}:3001`;

let ws = null;
let chart = null;
let chartRange = '1h';
let reconnectTimer = null;
let tempGauge, humGauge;
let tempSparkline, humSparkline;

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

// Trend tracking
let tempHistory = [];
let humHistory = [];

// Runtime counter
let atomiserStartTime = null;
let runtimeInterval = null;

// Schedules (stored in localStorage)
let schedules = JSON.parse(localStorage.getItem('atomiser_schedules') || '[]');

// Alert settings
let alertSoundEnabled = JSON.parse(localStorage.getItem('atomiser_alert_sound') ?? 'true');
let tempUnit = localStorage.getItem('atomiser_temp_unit') || 'C';
let alertThresholds = JSON.parse(localStorage.getItem('atomiser_alert_thresholds') || '{"highTemp":40,"lowHum":25,"highHum":85}');

// All cached events for filtering
let allEvents = [];

// ============================================
// Initialize
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  chart = new SensorChart('chart');
  tempGauge = new RadialGauge('tempGauge', { min: 0, max: 50, color: '#fb923c', glowColor: 'rgba(251,146,60,0.3)', label: '°C' });
  humGauge = new RadialGauge('humGauge', { min: 0, max: 100, color: '#38bdf8', glowColor: 'rgba(56,189,248,0.3)', label: '%' });
  tempSparkline = new SparklineChart('tempSparkline', 'rgb(251, 146, 60)');
  humSparkline = new SparklineChart('humSparkline', 'rgb(56, 189, 248)');

  createBgParticles();
  startClock();
  connectWebSocket();
  fetchStatus();
  fetchReadings();
  fetchEvents();
  updateThresholdFill();
  loadTheme();
  loadTempUnit();
  loadAlertSettings();
  updateAlertSoundBtn();
  renderSchedules();
  initDayPicker();

  // Check schedules every minute
  setInterval(checkSchedules, 60000);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 't' && e.ctrlKey) { e.preventDefault(); toggleTheme(); }
  });
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
// Theme Toggle
// ============================================
function toggleTheme() {
  document.body.classList.toggle('light');
  const isLight = document.body.classList.contains('light');
  localStorage.setItem('atomiser_theme', isLight ? 'light' : 'dark');
  const icon = document.getElementById('themeIcon');
  icon.innerHTML = isLight
    ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
    : '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
}

function loadTheme() {
  const theme = localStorage.getItem('atomiser_theme');
  if (theme === 'light') {
    document.body.classList.add('light');
    const icon = document.getElementById('themeIcon');
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  }
}

// ============================================
// Fullscreen
// ============================================
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
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
    warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  };

  toast.innerHTML = `${icons[type] || icons.info}<span>${escapeHtml(message)}</span>`;
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

      // Sparklines
      if (tempSparkline) tempSparkline.addPoint(data.temperature);
      if (humSparkline) humSparkline.addPoint(data.humidity);

      // Update chart stats
      updateChartStats();

      if (!prevConnected && data.connected) {
        showToast('Connected to ESP32', 'success');
      }
      if (prevAtomiser !== data.atomiserOn && data.connected) {
        showToast(`Atomiser ${data.atomiserOn ? 'activated' : 'deactivated'}`, data.atomiserOn ? 'info' : 'success');
      }

      // Check alert thresholds
      checkAlertThresholds(data);

    } catch (e) {
      console.error('WS message error:', e);
    }
  };

  ws.onclose = () => {
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
// Alert Thresholds
// ============================================
function checkAlertThresholds(data) {
  if (!data.connected) return;
  const t = data.temperature;
  const h = data.humidity;

  if (t > alertThresholds.highTemp) {
    showToast(`High temp alert: ${t.toFixed(1)}°C`, 'warning');
  }
  if (h < alertThresholds.lowHum) {
    showToast(`Low humidity alert: ${h.toFixed(1)}%`, 'warning');
  }
  if (h > alertThresholds.highHum) {
    showToast(`High humidity alert: ${h.toFixed(1)}%`, 'warning');
  }
}

function saveAlertThresholds() {
  alertThresholds.highTemp = parseInt(document.getElementById('highTempAlert').value) || 40;
  alertThresholds.lowHum = parseInt(document.getElementById('lowHumAlert').value) || 25;
  alertThresholds.highHum = parseInt(document.getElementById('highHumAlert').value) || 85;
  localStorage.setItem('atomiser_alert_thresholds', JSON.stringify(alertThresholds));
  showToast('Alert thresholds saved', 'success');
}

function loadAlertSettings() {
  document.getElementById('highTempAlert').value = alertThresholds.highTemp;
  document.getElementById('lowHumAlert').value = alertThresholds.lowHum;
  document.getElementById('highHumAlert').value = alertThresholds.highHum;
}

function toggleAlertSound() {
  alertSoundEnabled = !alertSoundEnabled;
  localStorage.setItem('atomiser_alert_sound', JSON.stringify(alertSoundEnabled));
  updateAlertSoundBtn();
  showToast(`Alerts ${alertSoundEnabled ? 'enabled' : 'disabled'}`, 'info');
}

function updateAlertSoundBtn() {
  const btn = document.getElementById('alertSoundBtn');
  if (btn) {
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
      Alerts: ${alertSoundEnabled ? 'On' : 'Off'}
    `;
  }
}

// ============================================
// Temperature Unit
// ============================================
function setTempUnit(unit) {
  tempUnit = unit;
  localStorage.setItem('atomiser_temp_unit', unit);
  loadTempUnit();
  updateUI();
}

function loadTempUnit() {
  document.getElementById('unitC').classList.toggle('active', tempUnit === 'C');
  document.getElementById('unitF').classList.toggle('active', tempUnit === 'F');
  document.getElementById('currentTempUnit').textContent = tempUnit === 'C' ? 'Celsius (°C)' : 'Fahrenheit (°F)';
}

function toDisplayTemp(celsius) {
  return tempUnit === 'F' ? (celsius * 9 / 5) + 32 : celsius;
}

function tempUnitLabel() {
  return tempUnit === 'F' ? '°F' : '°C';
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
      readings.forEach(r => {
        if (r.temperature < tempMin) tempMin = r.temperature;
        if (r.temperature > tempMax) tempMax = r.temperature;
        if (r.humidity < humMin) humMin = r.humidity;
        if (r.humidity > humMax) humMax = r.humidity;
      });
      updateMinMax();
      updateChartStats();
    }
  } catch (e) {
    console.error('Failed to fetch readings:', e);
  }
}

async function fetchEvents() {
  try {
    const res = await fetch(`${API_BASE}/api/events?limit=50`);
    allEvents = await res.json();
    filterEvents();
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
      showToast(`ESP32 IP updated to ${escapeHtml(ip)}`, 'success');
    }
  } catch (e) {
    showToast('Failed to update IP', 'error');
  }
}

// ============================================
// Chart Controls
// ============================================
function setChartRange(range, btn) {
  chartRange = range;
  document.querySelectorAll('.chip[data-range]').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  fetchReadings();
}

function toggleChartLine(line, btn) {
  if (chart) chart.toggleLine(line);
  if (btn) btn.classList.toggle('active');
}

function updateChartStats() {
  if (!chart) return;
  const stats = chart.getStats();
  if (!stats) return;
  document.getElementById('csAvgTemp').textContent = stats.avgTemp + '°';
  document.getElementById('csAvgHum').textContent = stats.avgHum + '%';
  document.getElementById('csCount').textContent = stats.count;
  document.getElementById('csDuration').textContent = stats.duration;
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

function updateHystLabel() {
  const val = document.getElementById('hystSlider').value;
  document.getElementById('hystBadge').textContent = `\u00B1${val}%`;
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
  if (t < 27) return t;
  const c1 = -8.784, c2 = 1.611, c3 = 2.338, c4 = -0.146,
        c5 = -0.0126, c6 = -0.0164, c7 = 0.00221, c8 = 0.000725, c9 = -0.00000304;
  return c1 + c2*t + c3*rh + c4*t*rh + c5*t*t + c6*rh*rh + c7*t*t*rh + c8*t*rh*rh + c9*t*t*rh*rh;
}

function calcAbsoluteHumidity(t, rh) {
  // g/m³
  return (6.112 * Math.exp((17.67 * t) / (t + 243.5)) * rh * 2.1674) / (273.15 + t);
}

function calcVPD(t, rh) {
  // Vapor Pressure Deficit in kPa
  const svp = 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
  return svp * (1 - rh / 100);
}

function getComfortLevel(t, rh) {
  if (rh >= 40 && rh <= 60 && t >= 20 && t <= 26) return { label: 'Ideal', class: 'success' };
  if (rh >= 30 && rh <= 70 && t >= 18 && t <= 28) return { label: 'Good', class: 'success' };
  if (rh < 30) return { label: 'Too Dry', class: 'warning' };
  if (rh > 70) return { label: 'Too Humid', class: 'warning' };
  if (t > 35) return { label: 'Too Hot', class: 'danger' };
  if (t < 15) return { label: 'Too Cold', class: 'danger' };
  return { label: 'Fair', class: 'info' };
}

let comfortDetailMode = 0;
function cycleComfortDetail() {
  comfortDetailMode = (comfortDetailMode + 1) % 3;
  updateUI();
}

// ============================================
// Trend calculation
// ============================================
function updateTrend(el, history, currentVal) {
  history.push(currentVal);
  if (history.length > 10) history.shift();
  if (history.length < 3) { el.textContent = '--'; return; }

  const recent = history.slice(-3);
  const older = history.slice(0, 3);
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;
  const diff = avgRecent - avgOlder;

  el.className = 'gauge-trend';
  if (Math.abs(diff) < 0.3) {
    el.textContent = '→ stable';
    el.classList.add('stable');
  } else if (diff > 0) {
    el.textContent = '↑ +' + diff.toFixed(1);
    el.classList.add('up');
  } else {
    el.textContent = '↓ ' + diff.toFixed(1);
    el.classList.add('down');
  }
}

// ============================================
// UI Updates
// ============================================
function updateState(data) {
  const prevAtomiserOn = state.atomiserOn;
  state = { ...state, ...data };

  // Track atomiser runtime
  if (state.atomiserOn && !prevAtomiserOn) {
    atomiserStartTime = Date.now();
    if (!runtimeInterval) {
      runtimeInterval = setInterval(updateRuntime, 1000);
    }
  } else if (!state.atomiserOn && prevAtomiserOn) {
    atomiserStartTime = null;
    if (runtimeInterval) { clearInterval(runtimeInterval); runtimeInterval = null; }
  }

  updateUI();
}

function updateRuntime() {
  const el = document.getElementById('runtimeCounter');
  if (atomiserStartTime) {
    const secs = Math.floor((Date.now() - atomiserStartTime) / 1000);
    el.textContent = `Runtime: ${formatUptime(secs)}`;
  } else {
    el.textContent = 'Runtime: --';
  }
}

function updateMinMax() {
  const dispTempMin = tempMin === Infinity ? '--' : toDisplayTemp(tempMin).toFixed(1) + '°';
  const dispTempMax = tempMax === -Infinity ? '--' : toDisplayTemp(tempMax).toFixed(1) + '°';
  document.getElementById('tempMin').textContent = dispTempMin;
  document.getElementById('tempMax').textContent = dispTempMax;
  document.getElementById('humMin').textContent = humMin === Infinity ? '--' : humMin.toFixed(1) + '%';
  document.getElementById('humMax').textContent = humMax === -Infinity ? '--' : humMax.toFixed(1) + '%';
}

function resetMinMax() {
  tempMin = Infinity; tempMax = -Infinity;
  humMin = Infinity; humMax = -Infinity;
  updateMinMax();
  showToast('Min/Max values reset', 'info');
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
    const dispTemp = toDisplayTemp(temperature);
    tempGauge.setValue(tempUnit === 'C' ? temperature : Math.min(dispTemp, 120));
    humGauge.setValue(humidity);
    document.getElementById('tempValue').textContent = dispTemp.toFixed(1);
    document.getElementById('humValue').textContent = humidity.toFixed(1);

    // Trends
    updateTrend(document.getElementById('tempTrend'), tempHistory, temperature);
    updateTrend(document.getElementById('humTrend'), humHistory, humidity);

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
    const absHum = calcAbsoluteHumidity(temperature, humidity);
    const vpd = calcVPD(temperature, humidity);

    document.getElementById('dewPoint').textContent = toDisplayTemp(dp).toFixed(1) + tempUnitLabel();
    document.getElementById('heatIndex').textContent = toDisplayTemp(hi).toFixed(1) + tempUnitLabel();
    document.getElementById('absHumidity').textContent = absHum.toFixed(1) + ' g/m³';
    document.getElementById('vpd').textContent = vpd.toFixed(2) + ' kPa';

    // Comfort level with cycling detail
    const comfortEl = document.getElementById('comfortLevel');
    if (comfortDetailMode === 0) comfortEl.textContent = comfort.label;
    else if (comfortDetailMode === 1) comfortEl.textContent = `DP ${toDisplayTemp(dp).toFixed(0)}°`;
    else comfortEl.textContent = `HI ${toDisplayTemp(hi).toFixed(0)}°`;
  } else {
    document.getElementById('tempValue').textContent = '--';
    document.getElementById('humValue').textContent = '--';
    document.getElementById('dewPoint').textContent = '--';
    document.getElementById('heatIndex').textContent = '--';
    document.getElementById('absHumidity').textContent = '--';
    document.getElementById('vpd').textContent = '--';
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

  if (!atomiserOn) {
    document.getElementById('runtimeCounter').textContent = 'Runtime: --';
  }

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

// ============================================
// Event Filtering
// ============================================
function filterEvents() {
  const filter = document.getElementById('eventFilter').value;
  const filtered = filter === 'all' ? allEvents : allEvents.filter(e => e.type === filter);
  renderEvents(filtered);
}

function clearEvents() {
  allEvents = [];
  renderEvents([]);
  showToast('Events cleared', 'info');
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
          <span class="event-type ${escapeHtml(e.type)}">${escapeHtml(e.type)}</span>
          <span class="event-msg">${escapeHtml(e.message)}</span>
        </div>
        <span class="event-time">${time}</span>
      </div>
    `;
  }).join('');
}

// ============================================
// Export Data
// ============================================
function exportData(format) {
  if (format === 'json') {
    const data = {
      exported: new Date().toISOString(),
      readings: chart ? {
        temperature: chart.data.temperature,
        humidity: chart.data.humidity,
        timestamps: chart.data.timestamps
      } : {},
      events: allEvents,
      state: state
    };
    downloadFile('atomiser-data.json', JSON.stringify(data, null, 2), 'application/json');
  } else if (format === 'csv') {
    let csv = 'Timestamp,Temperature (°C),Humidity (%)\n';
    if (chart && chart.data.timestamps.length > 0) {
      for (let i = 0; i < chart.data.timestamps.length; i++) {
        csv += `${chart.data.timestamps[i]},${chart.data.temperature[i]},${chart.data.humidity[i]}\n`;
      }
    }
    downloadFile('atomiser-readings.csv', csv, 'text/csv');
  }
  closeModal();
  showToast(`Data exported as ${format.toUpperCase()}`, 'success');
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================
// Schedules
// ============================================
function initDayPicker() {
  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });
}

function addSchedule() {
  const start = document.getElementById('schedStart').value;
  const end = document.getElementById('schedEnd').value;
  const days = [];
  document.querySelectorAll('.day-btn.active').forEach(btn => {
    days.push(parseInt(btn.dataset.day));
  });

  if (!start || !end) {
    showToast('Please set start and end times', 'error');
    return;
  }

  schedules.push({ start, end, days, enabled: true });
  localStorage.setItem('atomiser_schedules', JSON.stringify(schedules));
  renderSchedules();
  showToast('Schedule added', 'success');
}

function removeSchedule(idx) {
  schedules.splice(idx, 1);
  localStorage.setItem('atomiser_schedules', JSON.stringify(schedules));
  renderSchedules();
  showToast('Schedule removed', 'info');
}

function renderSchedules() {
  const list = document.getElementById('scheduleList');
  if (schedules.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:0.85rem;padding:16px;">No schedules set</div>';
    return;
  }
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  list.innerHTML = schedules.map((s, i) => `
    <div class="schedule-item">
      <div>
        <div class="sched-time">${escapeHtml(s.start)} - ${escapeHtml(s.end)}</div>
        <div class="sched-days">${s.days.map(d => dayNames[d]).join(', ')}</div>
      </div>
      <button class="sched-delete" onclick="removeSchedule(${i})">&times;</button>
    </div>
  `).join('');
}

function checkSchedules() {
  const now = new Date();
  const day = now.getDay();
  const time = now.toTimeString().slice(0, 5);

  for (const sched of schedules) {
    if (!sched.enabled || !sched.days.includes(day)) continue;
    if (time === sched.start && !state.atomiserOn) {
      toggleAtomiser();
      showToast('Schedule activated atomiser', 'info');
    }
    if (time === sched.end && state.atomiserOn) {
      toggleAtomiser();
      showToast('Schedule deactivated atomiser', 'info');
    }
  }
}

// ============================================
// Modals
// ============================================
function openModal(id) {
  document.getElementById('fullscreenOverlay').classList.add('visible');
  document.getElementById(id).classList.add('visible');
}

function closeModal() {
  document.getElementById('fullscreenOverlay').classList.remove('visible');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('visible'));
}

// ============================================
// Reading Interval
// ============================================
function changeInterval() {
  const val = document.getElementById('intervalSelect').value;
  const labels = { '1000': '1 second', '2000': '2 seconds', '5000': '5 seconds', '10000': '10 seconds', '30000': '30 seconds' };
  document.getElementById('currentInterval').textContent = labels[val] || val + 'ms';
  showToast(`Reading interval set to ${labels[val]}`, 'info');
}

// ============================================
// Utilities
// ============================================
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
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
