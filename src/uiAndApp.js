import { Clock, Vector3, Raycaster, Box3 } from 'three';
import { Body, Box as CannonBox, Vec3 } from 'cannon-es';
import {
  createEnvironment,
  createPhysicsWorld,
  stepPhysics,
  loadMallAssets,
  loadNpcPacks,
  assertDefined,
  invariant,
  createGameLoop,
  scoringSystem,
} from './coreAndSystems.js';
import {
  createMall,
  createScooter,
  createDebugMarkers,
  performanceMonitor,
} from './entitiesAndDebug.js';

const DEFAULT_SCOREBOARD_TAGLINE =
  'Chase points by bowling over mall patrons riding the new character models, but colliding with security gates, maintenance barriers, cleaning robots, or the mall walls will end the run instantly.';

export function createGameOverOverlay({ onRestart = () => {} } = {}) {
  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'none',
    zIndex: '1000',
    alignItems: 'center',
    justifyContent: 'center',
  });
  document.body.appendChild(root);

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    background: 'rgba(18, 22, 30, 0.96)',
    color: '#eef3ff',
    borderRadius: '14px',
    padding: '22px 24px',
    minWidth: '280px',
    maxWidth: '80vw',
    boxShadow: '0 18px 38px rgba(0, 0, 0, 0.4)',
    textAlign: 'center',
  });
  root.appendChild(panel);

  const title = document.createElement('h2');
  title.textContent = 'Game Over';
  Object.assign(title.style, { margin: '0 0 8px', fontSize: '20px' });
  panel.appendChild(title);

  const message = document.createElement('p');
  message.textContent = '';
  Object.assign(message.style, {
    margin: '0 0 16px',
    fontSize: '16px',
    opacity: '0.9',
  });
  panel.appendChild(message);

  const buttons = document.createElement('div');
  Object.assign(buttons.style, {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  });
  panel.appendChild(buttons);

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Try Again';
  Object.assign(retry.style, {
    padding: '10px 14px',
    borderRadius: '10px',
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '600',
  });
  buttons.appendChild(retry);

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  Object.assign(close.style, {
    padding: '10px 14px',
    borderRadius: '10px',
    background: '#111827',
    color: '#cbd5e1',
    border: '1px solid #1f2937',
    cursor: 'pointer',
    fontWeight: '600',
  });
  buttons.appendChild(close);

  function show(text = '') {
    message.textContent = text;
    root.style.display = 'flex';
  }

  function hide() {
    root.style.display = 'none';
  }

  retry.addEventListener('click', () => {
    hide();
    onRestart();
  });
  close.addEventListener('click', hide);

  return {
    show,
    hide,
    dispose() {
      if (root?.parentNode) {
        root.parentNode.removeChild(root);
      }
    },
  };
}

const DEFAULT_MESSAGE_DURATION_MS = 3200;
const HINT_DURATIONS = Object.freeze({ short: 2600, long: 4800 });

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

// Keep UI lock toggles centralized so every code path flips the same flag.
function lockUi() {
  try {
    document.documentElement.classList.add('ui-locked');
  } catch (_) {}
}

function unlockUi() {
  try {
    document.documentElement.classList.remove('ui-locked');
  } catch (_) {}
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
    combo: 0,
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

  function clamp(number, min, max) {
    return Math.min(max, Math.max(min, number));
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
      if (typeof patch.score === 'number' && Number.isFinite(patch.score)) {
        totals.score = Math.max(0, Math.floor(patch.score));
      }
      if (typeof patch.speed === 'number') totals.speed = clamp(patch.speed, 0, 150);
      if (typeof patch.topSpeed === 'number') totals.topSpeed = Math.max(0, patch.topSpeed);
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
      const duration =
        typeof options.duration === 'number' ? options.duration : DEFAULT_MESSAGE_DURATION_MS;
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
    hint(message, duration = HINT_DURATIONS.long) {
      this.setMessage(message, { duration });
    },
    dispose() {
      // detach DOM
      if (root && root.parentNode) {
        root.parentNode.removeChild(root);
      }
    },
  };
}

// --> Input Layer: basic keyboard setup so both WASD and arrows work.
export function createKeyboardControls({ layout = 'hybrid' } = {}) {
  const activeKeys = new Set();
  const listeners = [];

  function normalizeLayout(input) {
    if (input === 'arrows') return 'arrows';
    if (input === 'wasd') return 'wasd';
    return 'hybrid';
  }

  function createBindings(currentLayout) {
    if (currentLayout === 'arrows') {
      return {
        forward: new Set(['arrowup']),
        backward: new Set(['arrowdown']),
        left: new Set(['arrowleft']),
        right: new Set(['arrowright']),
      };
    }
    if (currentLayout === 'wasd') {
      return {
        forward: new Set(['w']),
        backward: new Set(['s']),
        left: new Set(['a']),
        right: new Set(['d']),
      };
    }
    return {
      forward: new Set(['arrowup', 'w']),
      backward: new Set(['arrowdown', 's']),
      left: new Set(['arrowleft', 'a']),
      right: new Set(['arrowright', 'd']),
    };
  }

  function handleKeyDown(event) {
    // Prevent accidental page scroll on space in some browsers (only when focused in game)
    if (event.key === ' ' && event.target === document.body) {
      event.preventDefault();
    }
    activeKeys.add(event.key.toLowerCase());
  }

  function handleKeyUp(event) {
    activeKeys.delete(event.key.toLowerCase());
  }

  listeners.push({ type: 'keydown', handler: handleKeyDown });
  listeners.push({ type: 'keyup', handler: handleKeyUp });

  listeners.forEach(({ type, handler }) => {
    window.addEventListener(type, handler);
  });

  let currentLayout = normalizeLayout(layout);
  let bindings = createBindings(currentLayout);

  function checkBinding(keys) {
    for (const key of keys) {
      if (activeKeys.has(key)) return true;
    }
    return false;
  }

  return {
    getLayout() {
      return currentLayout;
    },
    setLayout(nextLayout) {
      currentLayout = normalizeLayout(nextLayout);
      bindings = createBindings(currentLayout);
    },
    read() {
      const forward = checkBinding(bindings.forward);
      const backward = checkBinding(bindings.backward);
      const left = checkBinding(bindings.left);
      const right = checkBinding(bindings.right);
      return { forward, backward, left, right };
    },
    dispose() {
      listeners.forEach(({ type, handler }) => {
        window.removeEventListener(type, handler);
      });
      activeKeys.clear();
    },
  };
}

// Keyboard controls return a normalized state for forward/backward/left/right each frame.

const STORAGE_KEY = 'grand-theft-scooter:settings';

function detectPreferredTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function getDefaultSettings() {
  return {
    controlScheme: 'wasd',
    theme: detectPreferredTheme(),
    cameraSensitivity: 'normal',
    debugMarkers: false,
  };
}

function createUnavailableSettingsManager(reason, { initialWarned = false } = {}) {
  const fallback = getDefaultSettings();
  let warned = initialWarned;
  function warnOnce() {
    if (warned) return;
    warned = true;
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn(`[settings] ${reason}`);
    }
  }
  return {
    getControlScheme: () => fallback.controlScheme,
    getTheme: () => fallback.theme,
    open: () => {
      warnOnce();
    },
    close: () => {
      warnOnce();
    },
    isOpen: () => false,
  };
}

function readStoredSettings() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed) return null;
    const defaults = getDefaultSettings();
    return {
      controlScheme: parsed.controlScheme === 'arrows' ? 'arrows' : defaults.controlScheme,
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      cameraSensitivity: ['low', 'normal', 'high'].includes(parsed.cameraSensitivity)
        ? parsed.cameraSensitivity
        : defaults.cameraSensitivity,
      debugMarkers:
        typeof parsed.debugMarkers === 'boolean' ? parsed.debugMarkers : defaults.debugMarkers,
    };
  } catch (error) {
    console.warn('[settings] Unable to parse stored settings, falling back to defaults.', error);
    return null;
  }
}

function persistSettings(settings) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('[settings] Failed to persist settings.', error);
  }
}

function applyDocumentTheme(theme) {
  const mode = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', mode);
}

export function createSettingsManager({
  onControlSchemeChange,
  onThemeChange,
  onCameraSensitivityChange,
  onDebugChange,
} = {}) {
  if (typeof window === 'undefined') {
    return createUnavailableSettingsManager('Settings unavailable outside a browser context.');
  }

  const root = document.querySelector('[data-settings]');
  if (!root) {
    console.warn('[settings] Settings panel markup missing. Using defaults.');
    return createUnavailableSettingsManager('Settings panel markup missing. Using defaults.', {
      initialWarned: true,
    });
  }

  const controlInputs = Array.from(root.querySelectorAll('[data-control-option]'));
  const themeInputs = Array.from(root.querySelectorAll('[data-theme-option]'));
  const sensitivityInputs = Array.from(root.querySelectorAll('[data-sensitivity-option]'));
  const debugMarkersInput = root.querySelector('[data-debug-markers-option]');

  const closeTriggers = Array.from(root.querySelectorAll('[data-settings-close]'));

  const settings = {
    ...getDefaultSettings(),
    ...readStoredSettings(),
  };

  let openState = false;
  let hideTimer = null;

  // Ensure settings are hidden and non-interactive by default
  root.hidden = true;
  root.classList.remove('settings--visible');
  root.style.pointerEvents = 'none';

  function isUiLocked() {
    try {
      return !!document.documentElement && document.documentElement.classList.contains('ui-locked');
    } catch (_) {
      return false;
    }
  }

  function syncControlInputs() {
    controlInputs.forEach((input) => {
      input.checked = input.value === settings.controlScheme;
    });
  }

  function syncSensitivityInputs() {
    sensitivityInputs.forEach((input) => {
      input.checked = input.value === settings.cameraSensitivity;
    });
  }

  function syncThemeInputs() {
    themeInputs.forEach((input) => {
      input.checked = input.value === settings.theme;
    });
  }

  function emitControlChange() {
    if (typeof onControlSchemeChange === 'function') {
      onControlSchemeChange(settings.controlScheme);
    }
  }

  function emitThemeChange() {
    if (typeof onThemeChange === 'function') {
      onThemeChange(settings.theme);
    }
  }

  function emitSensitivityChange() {
    if (typeof onCameraSensitivityChange === 'function') {
      onCameraSensitivityChange(settings.cameraSensitivity);
    }
  }

  function emitDebugChange() {
    if (typeof onDebugChange === 'function') {
      onDebugChange(!!settings.debugMarkers);
    }
  }

  function applyControlScheme(nextScheme, { emit = true } = {}) {
    const normalized = nextScheme === 'arrows' ? 'arrows' : 'wasd';
    if (settings.controlScheme === normalized) return;
    settings.controlScheme = normalized;
    syncControlInputs();
    persistSettings(settings);
    if (emit) emitControlChange();
  }

  function applyCameraSensitivity(next, { emit = true } = {}) {
    const normalized = ['low', 'normal', 'high'].includes(next) ? next : 'normal';
    if (settings.cameraSensitivity === normalized) return;
    settings.cameraSensitivity = normalized;
    syncSensitivityInputs();
    persistSettings(settings);
    if (emit) emitSensitivityChange();
  }

  function applyTheme(nextTheme, { emit = true } = {}) {
    const normalized = nextTheme === 'light' ? 'light' : 'dark';
    if (settings.theme === normalized) return;
    settings.theme = normalized;
    applyDocumentTheme(settings.theme);
    syncThemeInputs();
    persistSettings(settings);
    if (emit) emitThemeChange();
  }

  function open() {
    if (openState) return;
    if (isUiLocked()) {
      return;
    }
    openState = true;
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
    root.hidden = false;
    root.style.pointerEvents = 'auto';
    requestAnimationFrame(() => {
      root.classList.add('settings--visible');
    });
    const focusTarget = root.querySelector('input:checked') || root.querySelector('input');
    if (focusTarget) {
      focusTarget.focus({ preventScroll: true });
    }
  }

  function close() {
    if (!openState) return;
    openState = false;
    root.classList.remove('settings--visible');
    root.style.pointerEvents = 'none';
    hideTimer = window.setTimeout(() => {
      if (!openState) {
        root.hidden = true;
      }
    }, 200);
  }

  function isOpen() {
    return openState;
  }

  function handleKeydown(event) {
    if (event.key !== 'Escape') return;
    if (!openState && isUiLocked()) {
      event.preventDefault();
      return;
    }
    if (openState) {
      event.preventDefault();
      close();
    } else {
      open();
    }
  }

  function handleTransitionEnd(event) {
    if (event.target !== root || event.propertyName !== 'opacity') return;
    if (!openState) {
      root.hidden = true;
    }
  }

  window.addEventListener('keydown', handleKeydown);
  root.addEventListener('transitionend', handleTransitionEnd);

  controlInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (!openState) return;
      applyControlScheme(input.value);
    });
  });

  themeInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (!openState || isUiLocked()) return;
      applyTheme(input.value);
    });
  });

  closeTriggers.forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      close();
    });
  });

  // Initial sync applies the saved state, then notifies the rest of the app once.
  syncControlInputs();
  applyDocumentTheme(settings.theme);
  syncThemeInputs();
  syncSensitivityInputs();

  sensitivityInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (!openState) return;
      applyCameraSensitivity(input.value);
    });
  });

  function syncDebugMarkersInput() {
    if (debugMarkersInput) {
      debugMarkersInput.checked = !!settings.debugMarkers;
    }
  }

  if (debugMarkersInput) {
    debugMarkersInput.addEventListener('change', () => {
      if (!openState || isUiLocked()) {
        debugMarkersInput.checked = !!settings.debugMarkers;
        return;
      }
      settings.debugMarkers = !!debugMarkersInput.checked;
      persistSettings(settings);
      emitDebugChange();
    });
  }

  // Initial sync applies the saved state, then notifies the rest of the app once.
  syncControlInputs();
  applyDocumentTheme(settings.theme);
  syncThemeInputs();
  syncSensitivityInputs();
  syncDebugMarkersInput();

  emitSensitivityChange();
  emitControlChange();
  emitThemeChange();
  emitDebugChange();

  return {
    getControlScheme: () => settings.controlScheme,
    getTheme: () => settings.theme,
    getCameraSensitivity: () => settings.cameraSensitivity,
    getDebugMarkersEnabled: () => !!settings.debugMarkers,
    open,
    close,
    isOpen,
  };
}

// UI Message Templates
const UI_MESSAGES = {
  CAMERA_FOLLOW: (controlScheme) => {
    const schemeLabel = controlScheme === 'arrows' ? 'the arrow keys' : 'WASD';
    return `Follow cam active. Use ${schemeLabel} to drive the scooter. Press C for a free camera (mouse only), R to reposition your ride, Esc for settings.`;
  },
  CAMERA_FREE:
    'Free camera active. Drag to look around, scroll to zoom. Press C to get back on the scooter, R to reposition your ride, Esc for settings.',
  GAME_READY: 'Ready to roll! Hit the gas and see how much chaos you can cause.',
  SPAWN_DEPLOYED: 'Scooter deployed to the nearest clear path. Ride safe!',
};

function updateHudHints(layout) {
  const accelerateEl = document.querySelector('[data-hint-accelerate]');
  const steerEl = document.querySelector('[data-hint-steer]');
  const brakeEl = document.querySelector('[data-hint-brake]');

  if (!accelerateEl || !steerEl || !brakeEl) return;

  if (layout === 'arrows') {
    accelerateEl.textContent = 'Tap ↑ to accelerate';
    steerEl.textContent = 'Steer with ← / →';
    brakeEl.textContent = 'Hold ↓ to brake or back up';
    return;
  }

  if (layout === 'wasd') {
    accelerateEl.textContent = 'Tap W to accelerate';
    steerEl.textContent = 'Steer with A / D';
    brakeEl.textContent = 'Hold S to brake or back up';
    return;
  }

  accelerateEl.textContent = 'Tap W or ↑ to accelerate';
  steerEl.textContent = 'Steer with A / D or the arrow keys';
  brakeEl.textContent = 'Hold S or ↓ to brake or back up';
}

export async function startGame(canvas) {
  assertDefined(canvas, 'Expected to find a canvas with id="app".');

  const CAMERA_SENSITIVITY_PRESETS = {
    low: { rotate: 0.3, zoom: 0.5, pan: 0.5 },
    normal: { rotate: 0.5, zoom: 1.0, pan: 1.0 },
    high: { rotate: 0.8, zoom: 1.5, pan: 1.5 },
  };

  let scoreboard = null;
  let cameraMode = 'follow';
  let activeLayout = 'wasd';
  let applyEnvironmentTheme = () => {};
  let isGameOver = false;
  let orbitControls = null;
  let playerControls = null;

  const runStats = {
    hits: 0,
    hazards: 0,
    topSpeed: 0,
    startTime: performance.now(),
    endTime: null,
  };
  let currentSpeed = 0;
  // Avoid hammering the DOM by spacing scoreboard refreshes.
  const TELEMETRY_INTERVAL_MS = 120;
  let lastTelemetryUpdateMs = 0;

  // Small loading overlay is visible by default; hide once assets + scene are ready
  const loadingEl = document.querySelector('[data-loading]');
  function setLoadingVisible(visible) {
    if (!loadingEl) return;
    loadingEl.hidden = !visible;
  }

  function refreshCameraMessage() {
    if (!scoreboard || isGameOver) return;

    const message =
      cameraMode === 'orbit' ? UI_MESSAGES.CAMERA_FREE : UI_MESSAGES.CAMERA_FOLLOW(activeLayout);

    scoreboard.setMessage(message, { duration: 4200 });
  }

  const applyCameraSensitivity = (mode = 'normal') => {
    if (!orbitControls) return;

    const preset = CAMERA_SENSITIVITY_PRESETS[mode] ?? CAMERA_SENSITIVITY_PRESETS.normal;
    orbitControls.rotateSpeed = preset.rotate;
    orbitControls.zoomSpeed = preset.zoom;
    orbitControls.panSpeed = preset.pan;
  };

  const settings = createSettingsManager({
    onControlSchemeChange: (nextLayout) => {
      activeLayout = nextLayout;
      if (playerControls) {
        playerControls.setLayout(nextLayout);
      }
      updateHudHints(nextLayout);
      refreshCameraMessage();
    },
    onThemeChange: (themeMode) => {
      applyEnvironmentTheme(themeMode);
    },
    onCameraSensitivityChange: applyCameraSensitivity,
    onDebugChange: (enabled) => {
      try {
        window.DEBUG_SPAWN = !!enabled;
        debug.setEnabled(!!enabled);
        console.info('[debug] markers', enabled ? 'enabled' : 'disabled', '(via Settings)');
      } catch (_) {}
    },
  });

  activeLayout = settings.getControlScheme();
  updateHudHints(activeLayout);

  const assets = await loadMallAssets();
  const {
    renderer,
    scene,
    camera,
    setCameraMode,
    updateCamera,
    handleResize,
    controls: environmentControls,
    setColorMode,
    dispose: disposeEnvironment,
  } = createEnvironment(canvas, assets, { theme: settings.getTheme() });

  // Set the orbit controls for camera sensitivity
  orbitControls = environmentControls;
  invariant(
    renderer && typeof renderer.render === 'function',
    'createEnvironment must supply a renderer with render().'
  );
  invariant(
    scene && typeof scene.add === 'function',
    'createEnvironment must supply a valid scene.'
  );
  invariant(
    camera && typeof camera.isCamera === 'boolean',
    'createEnvironment must supply a THREE camera.'
  );
  // Apply camera sensitivity based on user setting
  try {
    applyCameraSensitivity(settings.getCameraSensitivity?.() || 'normal');
  } catch (error) {
    console.warn('[Camera] Failed to apply camera sensitivity:', error);
  }

  invariant(typeof setCameraMode === 'function', 'createEnvironment must supply setCameraMode().');
  invariant(typeof updateCamera === 'function', 'createEnvironment must supply updateCamera().');
  invariant(typeof handleResize === 'function', 'createEnvironment must supply handleResize().');
  invariant(
    orbitControls && typeof orbitControls.update === 'function',
    'createEnvironment must supply orbit controls with update().'
  );
  invariant(typeof setColorMode === 'function', 'createEnvironment must supply setColorMode().');
  applyEnvironmentTheme = setColorMode;
  applyEnvironmentTheme(settings.getTheme());

  // Debug markers setup and toggle (F9) for spawn/floor diagnostics
  const debug = createDebugMarkers(scene);
  try {
    // Initialize from persisted setting
    const initial = !!settings.getDebugMarkersEnabled?.();
    window.DEBUG_SPAWN = initial;
    debug.setEnabled(initial);
    window.toggleDebugMarkers = () => {
      window.DEBUG_SPAWN = !window.DEBUG_SPAWN;
      debug.setEnabled(window.DEBUG_SPAWN);
      console.info('[debug] markers', window.DEBUG_SPAWN ? 'enabled' : 'disabled');
    };
    // Debug keydown handler will be consolidated with main handler below
  } catch (_) {}

  // Determine mall floor height under a given (x,z) so we can spawn above it
  const floorRaycaster = new Raycaster();
  const floorRayStart = new Vector3();
  const floorRayDir = new Vector3(0, -1, 0);
  function getMallFloorYAt(x, z) {
    const mallObj = scene.getObjectByName('shopping-mall');
    if (!mallObj) return 0;
    floorRayStart.set(x, 1000, z);
    floorRaycaster.set(floorRayStart, floorRayDir);
    const hits = floorRaycaster.intersectObject(mallObj, true);
    if (Array.isArray(hits) && hits.length > 0) {
      const y = hits[0].point.y;
      if (window.DEBUG_SPAWN) {
        try {
          debug.setFloorHit(x, y, z);
        } catch (_) {}
      }
      return y;
    }
    return 0;
  }

  // Dynamic resolution scaling knobs are handled in the loop module

  const { world, materials } = createPhysicsWorld();
  playerControls = createKeyboardControls({ layout: activeLayout });
  scoreboard = createScoreboard();
  invariant(
    scoreboard &&
      typeof scoreboard.updateTelemetry === 'function' &&
      typeof scoreboard.setMessage === 'function' &&
      typeof scoreboard.toggleDashboard === 'function',
    'createScoreboard must return an object with updateTelemetry(), setMessage(), and toggleDashboard().' 
  );
  scoringSystem.setCallbacks({
    onScoreUpdate: (score, points, details) => {
      scoreboard.updateTelemetry({ score });
      if (details?.targetLabel) {
        scoreboard.setMessage(`+${points} ${details.targetLabel}`, { duration: 1500 });
      } else {
        scoreboard.setMessage(`+${points}`, { duration: 1500 });
      }
    },
    onComboUpdate: (combo, increased) => {
      if (increased && combo >= 3) {
        scoreboard.setMessage(`${combo}x COMBO!`, { duration: 1200 });
      }
    },
    onSpecialBonus: (message, bonus) => {
      scoreboard.setMessage(`${message} +${bonus}`, { duration: 2000 });
    },
  });
  resetRunStats({ showTagline: true });
  invariant(
    playerControls && typeof playerControls.setLayout === 'function',
    'createKeyboardControls must provide setLayout().'
  );
  scoreboard.updateTelemetry({
    speed: 0,
    topSpeed: 0,
    hits: 0,
    hazards: 0,
    runtime: 0,
    status: 'Ready',
  });

  scoringSystem.setCallbacks({
    onScoreUpdate: (score, points, breakdown) => {
      scoreboard.updateTelemetry({ score });
      scoreboard.setMessage(`+${points} ${breakdown.targetLabel}`, {
        duration: 1500,
      });
    },
    onComboUpdate: (combo, increased) => {
      if (increased && combo >= 3) {
        scoreboard.setMessage(`${combo}x COMBO!`, { duration: 1200 });
      }
    },
    onSpecialBonus: (message, bonus) => {
      scoreboard.setMessage(`${message} +${bonus}`, { duration: 2000 });
    },
  });

  const resetButton = document.querySelector('[data-reset]');
  let disposeAll = () => {};
  const gameOverOverlay = createGameOverOverlay({
    onRestart: () => {
      try {
        disposeAll();
      } catch (_) {}
      window.location.reload();
    },
  });
  invariant(
    gameOverOverlay && typeof gameOverOverlay.show === 'function',
    'createGameOverOverlay must provide show().'
  );

  const scooter = createScooter({ world, material: materials.player, assets });
  scene.add(scooter.mesh);
  scooter.sync(0);
  setCameraMode(cameraMode);

  const mall = createMall({ world, scene, assets, materials });
  invariant(
    mall &&
      typeof mall.populate === 'function' &&
      typeof mall.handleCollision === 'function' &&
      typeof mall.findNearestNavigablePoint === 'function',
    'createMall must return an object supporting populate(), handleCollision(), and findNearestNavigablePoint().'
  );
  if (typeof mall.setPlayerLocator === 'function') {
    // Mall chunk streaming asks for the player position lazily; give it a closure that reads the scooter body.
    mall.setPlayerLocator(() => ({
      x: scooter.body.position.x,
      z: scooter.body.position.z,
    }));
  }
  const mallPopulationMode =
    assets.mallScene && !assets.mallScene.userData?.isProceduralMall ? 'static' : 'default';
  mall.populate({ mode: mallPopulationMode });
  updateHudHints(activeLayout);

  // Add a large invisible physics floor aligned to the mall's visual floor so the scooter doesn't fall through
  try {
    const mallObj = scene.getObjectByName('shopping-mall');
    if (mallObj) {
      const bounds = new Box3().setFromObject(mallObj);
      const size = bounds.getSize(new Vector3());
      const center = bounds.getCenter(new Vector3());
      const floorYRaw = getMallFloorYAt(center.x, center.z);
      const floorY = Number.isFinite(floorYRaw) ? floorYRaw : 0;
      const slabHeight = 1.0; // thicker slab to reduce chance of tunneling
      const halfX = Math.max(2, size.x / 2 + 1.0);
      const halfZ = Math.max(2, size.z / 2 + 1.0);
      const floorBody = new Body({
        mass: 0,
        shape: new CannonBox(new Vec3(halfX, slabHeight / 2, halfZ)),
        position: new Vec3(center.x, floorY - slabHeight / 2, center.z),
      });
      if (materials && materials.ground) floorBody.material = materials.ground;
      world.addBody(floorBody);
      if (window.DEBUG_SPAWN) {
        try {
          debug.showFloorSlab({
            x: center.x,
            y: floorY - slabHeight / 2,
            z: center.z,
            hx: halfX,
            hy: slabHeight / 2,
            hz: halfZ,
          });
        } catch (_) {}
      }
    }
  } catch (e) {
    console.warn('[physics] Failed to add mall physics floor:', e);
  }

  let SCOOTER_SPAWN_HEIGHT = 0.45;
  const spawnPoint = new Vec3(0, SCOOTER_SPAWN_HEIGHT, 0);
  const spawnQuaternion = { x: 0, y: 0, z: 0, w: 1 };
  // Align spawn height to the actual physics half-height once the scooter is built
  try {
    const halfY = scooter?.body?.shapes?.[0]?.halfExtents?.y;
    if (typeof halfY === 'number' && isFinite(halfY)) {
      SCOOTER_SPAWN_HEIGHT = Math.max(0.2, halfY + 0.05);
      spawnPoint.y = SCOOTER_SPAWN_HEIGHT;
    }
  } catch (_) {
    /* non-fatal */
  }
  const forwardVector = new Vec3(0, 0, -1);
  const tmpForce = new Vec3();
  const clock = new Clock();
  const worldUp = new Vector3(0, 1, 0);

  const alignHorizontalAxis = (target, fx, fz) => {
    target.y = 0;
    if (target.lengthSq() < 1e-6) target.set(fx, 0, fz);
    else target.normalize();
  };

  function applyDriveForce(drive) {
    if (drive === 0) return;
    forwardVector.set(0, 0, -1);
    scooter.body.quaternion.vmult(forwardVector, forwardVector);

    // Enhanced drive force with speed-dependent scaling
    const currentSpeed = scooter.body.velocity.length();
    const speedFactor = Math.max(0.3, 1 - currentSpeed / 30); // Reduce force at high speeds
    const driveForce = 90 * drive * speedFactor; // Increased base force

    tmpForce.copy(forwardVector).scale(driveForce);
    scooter.body.applyForce(tmpForce, scooter.body.position);
  }

  function applySteering(steer, delta) {
    if (steer === 0) return;

    // Enhanced steering with speed-dependent responsiveness
    const currentSpeed = scooter.body.velocity.length();
    const speedFactor = Math.min(1.5, Math.max(0.5, currentSpeed / 10)); // More responsive at speed
    const steerForce = steer * delta * 6.5 * speedFactor; // Increased base steering

    scooter.body.angularVelocity.y -= steerForce;

    // Add slight lateral force for more realistic turning
    if (currentSpeed > 2) {
      const rightVector = new Vec3();
      scooter.body.quaternion.vmult(new Vec3(1, 0, 0), rightVector);
      const lateralForce = rightVector.scale(steer * currentSpeed * 8);
      scooter.body.applyForce(lateralForce, scooter.body.position);
    }
  }

  // Initialize audio system
  let audioInitialized = false;
  async function initializeAudio() {
    if (audioInitialized) return;
    try {
      await audioManager.initialize();
      audioInitialized = true;
    } catch (error) {
      console.warn('[Audio] Failed to initialize audio context:', error);
    }
  }
  const primeAudio = () => {
    window.removeEventListener('pointerdown', primeAudio);
    window.removeEventListener('keydown', primeAudio);
    initializeAudio().catch((error) => {
      console.warn('[Audio] Deferred initialization failed:', error);
    });
  };
  window.addEventListener('pointerdown', primeAudio, { once: true });
  window.addEventListener('keydown', primeAudio, { once: true });
  let npcPacksLoading = false;

  let resetInProgress = false;

  function updateRunTelemetry(force = false) {
    if (!scoreboard) return;
    const now = performance.now();
    if (!force && now - lastTelemetryUpdateMs < TELEMETRY_INTERVAL_MS) return;
    lastTelemetryUpdateMs = now;
    const stats = scoringSystem.getStats();
    const elapsedMs =
      isGameOver && runStats.endTime
        ? runStats.endTime - runStats.startTime
        : now - runStats.startTime;
    scoreboard.updateTelemetry({
      score: stats.score,
      speed: currentSpeed,
      topSpeed: runStats.topSpeed,
      hits: runStats.hits,
      hazards: runStats.hazards,
      runtime: elapsedMs / 1000,
      status: isGameOver ? 'Downed' : 'Rolling',
    });
  }

  function resetRunStats({ showTagline = false, message } = {}) {
    scoringSystem.reset();
    runStats.hits = 0;
    runStats.hazards = 0;
    runStats.topSpeed = 0;
    runStats.startTime = performance.now();
    runStats.endTime = null;
    currentSpeed = 0;
    lastTelemetryUpdateMs = 0;
    updateRunTelemetry(true);
    const tagline =
      typeof message === 'string' && message.trim().length > 0 ? message : DEFAULT_SCOREBOARD_TAGLINE;
    if (showTagline && scoreboard && tagline) {
      scoreboard.setMessage(tagline, { duration: 6400 });
    }
  }

  async function resetScooter() {
    if (isGameOver || resetInProgress) return;
    resetInProgress = true;
    try {
      const previous = new Vector3(spawnPoint.x, 0, spawnPoint.z);
      const candidate = mall.findNearestNavigablePoint(previous, 3.6, {
        ignoreBodies: [scooter.body],
      });
      const safe = mall.findNearestNavigablePoint(candidate, 3.6, {
        ignoreBodies: [scooter.body],
      });
      const halfY = scooter?.body?.shapes?.[0]?.halfExtents?.y ?? SCOOTER_SPAWN_HEIGHT - 0.05;
      const floorY = getMallFloorYAt(safe.x, safe.z);
      const spawnY = Math.max(SCOOTER_SPAWN_HEIGHT, (floorY || 0) + halfY + 0.05);
      if (window.DEBUG_SPAWN) {
        console.debug(
          '[spawn] floorY:',
          floorY?.toFixed?.(3),
          'halfY:',
          halfY?.toFixed?.(3),
          'spawnY:',
          spawnY?.toFixed?.(3)
        );
      }
      spawnPoint.set(safe.x, spawnY, safe.z);
      scooter.body.velocity.set(0, 0, 0);
      scooter.body.angularVelocity.set(0, 0, 0);
      scooter.body.position.set(spawnPoint.x, spawnPoint.y, spawnPoint.z);
      scooter.body.quaternion.set(
        spawnQuaternion.x,
        spawnQuaternion.y,
        spawnQuaternion.z,
        spawnQuaternion.w
      );
      scooter.sync(0);
      if (window.DEBUG_SPAWN) {
        try {
          debug.setSpawnMarker(spawnPoint.x, spawnPoint.y, spawnPoint.z);
        } catch (_) {}
      }
      try {
        scooter.body.wakeUp?.();
      } catch (_) {}
      orbitControls.target.copy(scooter.mesh.position);
      orbitControls.update();
      if (cameraMode !== 'follow') {
        cameraMode = 'follow';
        setCameraMode(cameraMode);
      }
      resetRunStats({ showTagline: true, message: UI_MESSAGES.SPAWN_DEPLOYED });
    } finally {
      resetInProgress = false;
    }
  }

  function queueReset() {
    resetScooter().catch((error) => {
      console.error('[Grand Theft Scooter] Failed to reset scooter:', error);
    });
  }

  let handleResetButtonClick = null;
  if (resetButton) {
    handleResetButtonClick = (event) => {
      event.preventDefault();
      queueReset();
    };
    resetButton.addEventListener('click', handleResetButtonClick);
  }

  function handleCameraModeToggle() {
    if (isGameOver) return;
    cameraMode = cameraMode === 'orbit' ? 'follow' : 'orbit';
    setCameraMode(cameraMode);
    refreshCameraMessage();
  }

  function handleResetKey(event) {
    event.preventDefault();
    queueReset();
  }

  function handleTelemetryKey(event) {
    event.preventDefault();
    const visible = scoreboard.toggleDashboard();
    scoreboard.setMessage(
      visible ? 'Telemetry open. Press I to hide.' : 'Telemetry hidden. Press I to view stats.',
      { duration: 2600 }
    );
  }

  function adjustChunking({ radiusDelta = 0, sizeDelta = 0 } = {}) {
    if (typeof mall.setChunking !== 'function') return;
    const nextConfig = {};
    if (radiusDelta !== 0) {
      const current = typeof mall.chunkRadius === 'number' ? mall.chunkRadius : 2;
      nextConfig.radius = Math.max(1, current + radiusDelta);
    }
    if (sizeDelta !== 0) {
      const current = typeof mall.chunkSize === 'number' ? mall.chunkSize : 48;
      nextConfig.size = Math.max(16, current + sizeDelta);
    }
    if (Object.keys(nextConfig).length > 0) {
      mall.setChunking(nextConfig);
    }
  }

  const keyHandlers = {
    c: handleCameraModeToggle,
    r: handleResetKey,
    i: handleTelemetryKey,
    '+': () => adjustChunking({ radiusDelta: 1 }),
    '-': () => adjustChunking({ radiusDelta: -1 }),
    '[': () => adjustChunking({ sizeDelta: -8 }),
    ']': () => adjustChunking({ sizeDelta: 8 }),
    F9: (event) => {
      event.preventDefault?.();
      try {
        window.toggleDebugMarkers?.();
      } catch (_) {}
    },
  };

  async function handleGameKeydown(event) {
    const key = event.key;
    const handler = keyHandlers[key.toLowerCase()] || keyHandlers[key];
    if (!handler) return;
    handler(event);
  }

  function triggerGameOver(reason) {
    if (isGameOver) return;
    isGameOver = true;
    runStats.endTime = performance.now();
    if (reason) {
      runStats.hazards += 1;
    }
    currentSpeed = 0;
    updateRunTelemetry(true);
    gameOverOverlay.show(runStats);
  }

  const onScooterCollide = (event) => {
    const hit = mall.handleCollision(event.body, scooter.body);
    if (!hit || isGameOver) return;

    if (hit.kind === 'fatal') {
      triggerGameOver(hit.label);
      return;
    }

    if (hit.kind === 'score') {
      runStats.hits += 1;

      // Use enhanced scoring system
      const currentSpeed = scooter.body.velocity.length();
      scoringSystem.awardPoints(hit.label, currentSpeed);

      // Monitor performance improvements
      performanceMonitor.recordCollision(hit.label, {
        angularDamping: hit.body?.angularDamping || 0,
        linearDamping: hit.body?.linearDamping || 0,
      });

      // Update scoreboard with new scoring system
      scoreboard.updateTelemetry({
        hits: runStats.hits,
      });
    }
  };
  scooter.body.addEventListener('collide', onScooterCollide);

  function updatePhysics(delta, input) {
    const driveInput = input?.drive ?? 0;
    const steerInput = input?.steer ?? 0;
    if (typeof scooter.setControlsState === 'function') {
      // Keep the fallback visual rig (wheels, handlebars) in sync with whatever the player or AI is doing.
      scooter.setControlsState({ drive: driveInput, steer: steerInput });
    }
    if (!isGameOver && input) {
      applyDriveForce(driveInput);
      applySteering(steerInput, delta);

    }

    stepPhysics(world, delta);
    currentSpeed = scooter.body.velocity.length();
    if (currentSpeed > runStats.topSpeed) {
      runStats.topSpeed = currentSpeed;
    }

    // Update scoring system combo timer
    const comboTimestamp = performance.now();
    scoringSystem.updateCombo(comboTimestamp);
  }

  function syncGraphics(delta) {
    scooter.sync(delta);
    mall.sync(delta);
    updateCamera(scooter.mesh);

    // Kick off lazy NPC pack loading once to improve startup and upgrade future spawns
    if (!assets.npcPacksReady && !npcPacksLoading) {
      npcPacksLoading = true;
      loadNpcPacks()
        .then(({ animatedMenVariants, animatedWomenVariants }) => {
          assets.animatedMenVariants = animatedMenVariants;
          assets.animatedWomenVariants = animatedWomenVariants;
          assets.npcPacksReady = true;
        })
        .then(() => {
          try {
            if (mall && typeof mall.addPatrons === 'function') {
              // Add a fresh batch of higher-fidelity NPCs now that packs are ready
              mall.addPatrons(14);
            }
          } finally {
            npcPacksLoading = false;
          }
        })
        .catch((error) => {
          console.error('[NPC] Failed to load NPC packs:', error);
          npcPacksLoading = false;
        });
    }

    renderer.render(scene, camera);
  }

  // Centralized teardown to ensure listeners and DOM are cleaned up before restart
  disposeAll = () => {
    try {
      window.removeEventListener('pointerdown', primeAudio);
    } catch (_) {}
    try {
      window.removeEventListener('keydown', primeAudio);
    } catch (_) {}
    try {
      window.removeEventListener('keydown', handleGameKeydown);
    } catch (_) {}
    try {
      window.removeEventListener('resize', handleResize);
    } catch (_) {}
    if (resetButton && handleResetButtonClick) {
      try {
        resetButton.removeEventListener('click', handleResetButtonClick);
      } catch (_) {}
    }
    unlockUi();
    try {
      scooter.body.removeEventListener('collide', onScooterCollide);
    } catch (_) {}
    try {
      playerControls?.dispose?.();
    } catch (_) {}
    try {
      scoreboard?.dispose?.();
    } catch (_) {}
    try {
      gameOverOverlay?.dispose?.();
    } catch (_) {}
    try {
      orbitControls?.dispose?.();
    } catch (_) {}
    try {
      scoringSystem?.dispose?.();
    } catch (_) {}
    // During cleanup, setPlayerLocator(null) clears the player locator reference to help prevent memory leaks.
    try {
      mall.setPlayerLocator?.(null);
    } catch (_) {}
    try {
      disposeEnvironment?.();
    } catch (_) {}
  };

  // Check if mall is loaded and hide loading overlay
  const mallObj = scene.getObjectByName('shopping-mall');
  if (mallObj) {
    setLoadingVisible(false);
  } else {
    setLoadingVisible(true);
    try {
      const loadingEl = document.querySelector('[data-loading]');
      if (loadingEl)
        loadingEl.textContent = 'Mall scene not built yet… check src/proceduralMallScene.js';
      console.warn('[startup] Mall model missing from scene; leaving loading overlay visible.');
    } catch (_) {}
  }

  await resetScooter();
  updateRunTelemetry(true);
  setTimeout(() => {
    if (!isGameOver) {
      refreshCameraMessage();
    }
  }, 6500);

  window.addEventListener('resize', handleResize);
  window.addEventListener('keydown', handleGameKeydown);
  // Hand off to centralized loop controller
  createGameLoop({
    clock,
    readInput: () => playerControls.read(),
    updatePhysics: (delta, input) => updatePhysics(delta, input),
    updateRunTelemetry,
    syncGraphics,
    renderer,
    camera,
    orbitControls,
    isFreeCameraActive: () => cameraMode === 'orbit',
    alignHorizontalAxis,
  }).start();
}

const appCanvas = document.getElementById('app');
if (appCanvas) {
  startGame(appCanvas).catch((error) => {
    console.error('[bootstrap] Failed to start Grand Theft Scooter:', error);
  });
} else {
  console.error('[bootstrap] Missing <canvas id="app"> element.');
}
