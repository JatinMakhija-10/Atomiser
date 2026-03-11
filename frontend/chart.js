// ============================================
// Enhanced Sensor Chart with Tooltips
// Smooth curves, crosshair, threshold line
// ============================================

class SensorChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.tooltip = document.getElementById('chartTooltip');
    this.data = { temperature: [], humidity: [], labels: [], timestamps: [] };
    this.threshold = 60;
    this.padding = { top: 24, right: 24, bottom: 36, left: 50 };
    this.hoverIndex = -1;
    this.animProgress = 0;
    this.animFrame = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this.onMouseLeave());
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      this.handleHover(touch.clientX - rect.left, touch.clientY - rect.top);
    }, { passive: false });
    this.canvas.addEventListener('touchend', () => this.onMouseLeave());
  }

  resize() {
    const parent = this.canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height || 280;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  setData(readings) {
    this.data.temperature = readings.map(r => r.temperature);
    this.data.humidity = readings.map(r => r.humidity);
    this.data.labels = readings.map(r => {
      const d = new Date(r.created_at);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });
    this.data.timestamps = readings.map(r => r.created_at);
    this.animateIn();
  }

  addPoint(temp, hum) {
    const now = new Date();
    this.data.temperature.push(temp);
    this.data.humidity.push(hum);
    this.data.labels.push(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    this.data.timestamps.push(now.toISOString());

    if (this.data.temperature.length > 600) {
      this.data.temperature.shift();
      this.data.humidity.shift();
      this.data.labels.shift();
      this.data.timestamps.shift();
    }
    this.draw();
  }

  setThreshold(val) {
    this.threshold = val;
    this.draw();
  }

  animateIn() {
    this.animProgress = 0;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    const animate = () => {
      this.animProgress = Math.min(1, this.animProgress + 0.04);
      this.draw();
      if (this.animProgress < 1) {
        this.animFrame = requestAnimationFrame(animate);
      }
    };
    this.animFrame = requestAnimationFrame(animate);
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.handleHover(e.clientX - rect.left, e.clientY - rect.top);
  }

  handleHover(mx, my) {
    const p = this.padding;
    const chartW = this.width - p.left - p.right;
    const len = this.data.temperature.length;
    if (len < 2) return;

    const xStep = chartW / (len - 1);
    const idx = Math.round((mx - p.left) / xStep);

    if (idx >= 0 && idx < len) {
      this.hoverIndex = idx;
      this.draw();

      const temp = this.data.temperature[idx];
      const hum = this.data.humidity[idx];
      const time = this.data.labels[idx];

      this.tooltip.innerHTML = `
        <div style="font-weight:700; margin-bottom:6px; color:#f1f5f9;">${time}</div>
        <div style="color:#fb923c;">🌡 ${temp.toFixed(1)}°C</div>
        <div style="color:#38bdf8;">💧 ${hum.toFixed(1)}%</div>
      `;
      this.tooltip.classList.add('visible');

      let tx = p.left + idx * xStep + 12;
      let ty = my - 60;
      if (tx + 160 > this.width) tx = tx - 170;
      if (ty < 0) ty = 10;
      this.tooltip.style.left = tx + 'px';
      this.tooltip.style.top = ty + 'px';
    }
  }

  onMouseLeave() {
    this.hoverIndex = -1;
    this.tooltip.classList.remove('visible');
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const p = this.padding;

    ctx.clearRect(0, 0, w, h);

    const chartW = w - p.left - p.right;
    const chartH = h - p.top - p.bottom;

    if (this.data.temperature.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '500 13px Inter, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for sensor data...', w / 2, h / 2);
      return;
    }

    const allVals = [...this.data.temperature, ...this.data.humidity, this.threshold];
    let minVal = Math.floor(Math.min(...allVals) - 5);
    let maxVal = Math.ceil(Math.max(...allVals) + 5);
    if (maxVal - minVal < 10) { minVal -= 5; maxVal += 5; }

    const len = this.data.temperature.length;
    const visibleLen = Math.max(2, Math.floor(len * this.animProgress));
    const xStep = chartW / (len - 1);
    const yScale = chartH / (maxVal - minVal);

    const toX = (i) => p.left + i * xStep;
    const toY = (v) => p.top + chartH - (v - minVal) * yScale;

    // Grid
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.2)';
    ctx.lineWidth = 1;
    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const val = minVal + (maxVal - minVal) * (i / gridSteps);
      const y = toY(val);
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.moveTo(p.left, y);
      ctx.lineTo(w - p.right, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#475569';
      ctx.font = '500 11px Inter, system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(val), p.left - 10, y + 4);
    }

    // X labels
    ctx.textAlign = 'center';
    ctx.fillStyle = '#475569';
    const labelFreq = Math.max(1, Math.floor(len / 7));
    for (let i = 0; i < len; i += labelFreq) {
      ctx.fillText(this.data.labels[i], toX(i), h - 10);
    }

    // Threshold line
    const thY = toY(this.threshold);
    ctx.beginPath();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(p.left, thY);
    ctx.lineTo(w - p.right, thY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(139, 92, 246, 0.7)';
    ctx.font = '600 10px Inter, system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`Threshold ${this.threshold}%`, p.left + 4, thY - 6);

    // Draw smooth line with gradient
    const drawSmoothLine = (values, color, glowColor) => {
      if (visibleLen < 2) return;

      // Line
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.moveTo(toX(0), toY(values[0]));
      for (let i = 1; i < visibleLen; i++) {
        const cx = (toX(i - 1) + toX(i)) / 2;
        const cy1 = toY(values[i - 1]);
        const cy2 = toY(values[i]);
        ctx.quadraticCurveTo(toX(i - 1), cy1, cx, (cy1 + cy2) / 2);
      }
      ctx.lineTo(toX(visibleLen - 1), toY(values[visibleLen - 1]));
      ctx.stroke();

      // Gradient fill
      ctx.lineTo(toX(visibleLen - 1), p.top + chartH);
      ctx.lineTo(toX(0), p.top + chartH);
      ctx.closePath();
      const gradient = ctx.createLinearGradient(0, p.top, 0, p.top + chartH);
      gradient.addColorStop(0, glowColor);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fill();
    };

    drawSmoothLine(this.data.temperature, '#fb923c', 'rgba(251, 146, 60, 0.12)');
    drawSmoothLine(this.data.humidity, '#38bdf8', 'rgba(56, 189, 248, 0.12)');

    // Crosshair on hover
    if (this.hoverIndex >= 0 && this.hoverIndex < len) {
      const hx = toX(this.hoverIndex);

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(241, 245, 249, 0.15)';
      ctx.lineWidth = 1;
      ctx.moveTo(hx, p.top);
      ctx.lineTo(hx, p.top + chartH);
      ctx.stroke();

      // Dots
      const drawDot = (val, color) => {
        const y = toY(val);
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(hx, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.arc(hx, y, 2, 0, Math.PI * 2);
        ctx.fill();
      };

      drawDot(this.data.temperature[this.hoverIndex], '#fb923c');
      drawDot(this.data.humidity[this.hoverIndex], '#38bdf8');
    }
  }
}
