// --> Input Layer: basic keyboard setup so both WASD and arrows work.
export function createKeyboardControls(layout = 'hybrid') {
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
