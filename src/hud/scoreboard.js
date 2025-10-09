const DEFAULT_MESSAGE_DURATION = 3200;

function createMetric(list, label, initialValue) {
  const term = document.createElement('dt');
  term.textContent = label;
  Object.assign(term.style, {
    margin: '0',
    fontSize: '14px',
    fontWeight: '500',
    opacity: '0.78',
  });

  const value = document.createElement('dd');
  value.textContent = initialValue;
  Object.assign(value.style, {
    margin: '0',
    fontSize: '15px',
    fontFamily: 'monospace',
    textAlign: 'right',
  });

  list.appendChild(term);
  list.appendChild(value);
  return value;
}

function formatSpeed(value) {
  const kmh = value * 3.6;
  return `${kmh.toFixed(1)} km/h`;
}

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// --> HUD Scoreboard: now a toggleable telemetry dashboard instead of a permanent box.
export function createScoreboard() {
  const root = document.createElement('div');
  root.id = 'hud-layer';
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '20',
  });
  document.body.appendChild(root);

  const messageBar = document.createElement('div');
  Object.assign(messageBar.style, {
    position: 'absolute',
    bottom: '28px',
    left: '50%',
    transform: 'translateX(-50%)',
    color: '#ffffff',
    fontFamily: 'Arial, sans-serif',
    fontSize: '18px',
    textShadow: '0 2px 8px rgba(0, 0, 0, 0.65)',
    opacity: '0',
    transition: 'opacity 140ms ease-out',
    maxWidth: '70vw',
    textAlign: 'center',
    letterSpacing: '0.01em',
    pointerEvents: 'none',
  });
  root.appendChild(messageBar);

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'absolute',
    top: '64px',
    right: '42px',
    minWidth: '240px',
    padding: '18px 20px',
    borderRadius: '14px',
    background: 'rgba(10, 16, 24, 0.95)',
    color: '#eef3ff',
    boxShadow: '0 18px 38px rgba(0, 0, 0, 0.4)',
    backdropFilter: 'blur(8px)',
    display: 'none',
    pointerEvents: 'auto',
  });
  root.appendChild(panel);

  const header = document.createElement('div');
  header.textContent = 'Scooter Telemetry';
  Object.assign(header.style, {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '12px',
  });
  panel.appendChild(header);

  const metricsList = document.createElement('dl');
  Object.assign(metricsList.style, {
    margin: '0',
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    columnGap: '18px',
    rowGap: '10px',
  });
  panel.appendChild(metricsList);

  const nodes = {
    score: createMetric(metricsList, 'Score', '0'),
    speed: createMetric(metricsList, 'Speed', '0.0 km/h'),
    topSpeed: createMetric(metricsList, 'Top speed', '0.0 km/h'),
    targets: createMetric(metricsList, 'Targets hit', '0'),
    hazards: createMetric(metricsList, 'Hazard collisions', '0'),
    runtime: createMetric(metricsList, 'Run time', '0:00'),
    status: createMetric(metricsList, 'Status', 'Ready'),
  };

  const totals = {
    score: 0,
    speed: 0,
    topSpeed: 0,
    targets: 0,
    hazards: 0,
    runtime: 0,
    status: 'Ready',
  };

  let messageTimer = null;
  let dashboardVisible = false;

  function render() {
    nodes.score.textContent = totals.score.toLocaleString();
    nodes.speed.textContent = formatSpeed(totals.speed);
    nodes.topSpeed.textContent = formatSpeed(totals.topSpeed);
    nodes.targets.textContent = totals.targets.toString();
    nodes.hazards.textContent = totals.hazards.toString();
    nodes.runtime.textContent = formatDuration(totals.runtime);
    nodes.status.textContent = totals.status;
  }

  function applyDashboardVisibility() {
    panel.style.display = dashboardVisible ? 'block' : 'none';
  }

  render();

  return {
    award(points, label) {
      totals.score += points;
      render();
      if (label) {
        this.setMessage(`+${points} for ${label}`, { duration: 1800 });
      }
      return totals.score;
    },
    getScore() {
      return totals.score;
    },
    updateTelemetry(patch = {}) {
      if (typeof patch.speed === 'number') {
        totals.speed = patch.speed;
      }
      if (typeof patch.topSpeed === 'number') {
        totals.topSpeed = patch.topSpeed;
      }
      if (typeof patch.hits === 'number') {
        totals.targets = patch.hits;
      }
      if (typeof patch.hazards === 'number') {
        totals.hazards = patch.hazards;
      }
      if (typeof patch.runtime === 'number') {
        totals.runtime = patch.runtime;
      }
      if (typeof patch.status === 'string') {
        totals.status = patch.status;
      }
      render();
    },
    setMessage(message, options = {}) {
      const duration = typeof options.duration === 'number' ? options.duration : DEFAULT_MESSAGE_DURATION;
      if (messageTimer) {
        clearTimeout(messageTimer);
        messageTimer = null;
      }
      if (!message) {
        messageBar.style.opacity = '0';
        messageBar.textContent = '';
        return;
      }
      messageBar.textContent = message;
      messageBar.style.opacity = '1';
      if (Number.isFinite(duration) && duration > 0) {
        messageTimer = setTimeout(() => {
          messageBar.style.opacity = '0';
          messageBar.textContent = '';
          messageTimer = null;
        }, duration);
      }
    },
    clearMessage() {
      this.setMessage('');
    },
    setDashboardVisible(show) {
      dashboardVisible = Boolean(show);
      applyDashboardVisibility();
      return dashboardVisible;
    },
    toggleDashboard() {
      dashboardVisible = !dashboardVisible;
      applyDashboardVisibility();
      return dashboardVisible;
    },
    isDashboardVisible() {
      return dashboardVisible;
    },
  };
}
