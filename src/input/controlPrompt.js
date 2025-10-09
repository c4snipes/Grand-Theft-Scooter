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

export function createSettingsManager({ onControlSchemeChange, onThemeChange } = {}) {
  if (typeof window === 'undefined') {
    const fallback = getDefaultSettings();
    return {
      getControlScheme: () => fallback.controlScheme,
      getTheme: () => fallback.theme,
      open: () => {},
      close: () => {},
      isOpen: () => false,
    };
  }

  const root = document.querySelector('[data-settings]');
  if (!root) {
    const fallback = getDefaultSettings();
    console.warn('[settings] Settings panel markup missing. Using defaults.');
    return {
      getControlScheme: () => fallback.controlScheme,
      getTheme: () => fallback.theme,
      open: () => {},
      close: () => {},
      isOpen: () => false,
    };
  }

  const controlInputs = Array.from(root.querySelectorAll('[data-control-option]'));
  const themeInputs = Array.from(root.querySelectorAll('[data-theme-option]'));
  const closeTriggers = Array.from(root.querySelectorAll('[data-settings-close]'));

  const settings = {
    ...getDefaultSettings(),
    ...readStoredSettings(),
  };

  let openState = false;
  let hideTimer = null;

  function syncControlInputs() {
    controlInputs.forEach((input) => {
      input.checked = input.value === settings.controlScheme;
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

  function applyControlScheme(nextScheme, { emit = true } = {}) {
    const normalized = nextScheme === 'arrows' ? 'arrows' : 'wasd';
    if (settings.controlScheme === normalized) return;
    settings.controlScheme = normalized;
    syncControlInputs();
    persistSettings(settings);
    if (emit) emitControlChange();
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
    openState = true;
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
    root.hidden = false;
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
      applyControlScheme(input.value);
    });
  });

  themeInputs.forEach((input) => {
    input.addEventListener('change', () => {
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
  emitControlChange();
  emitThemeChange();

  return {
    getControlScheme: () => settings.controlScheme,
    getTheme: () => settings.theme,
    open,
    close,
    isOpen,
  };
}
