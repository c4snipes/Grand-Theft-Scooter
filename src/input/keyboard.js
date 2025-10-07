// --> Input Layer: basic keyboard setup so both WASD and arrows work.
export function createKeyboardControls(layout = 'hybrid') {
  const activeKeys = new Set();

  function handleKeyDown(event) {
    activeKeys.add(event.key.toLowerCase());
  }

  function handleKeyUp(event) {
    activeKeys.delete(event.key.toLowerCase());
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  // I just keep both layouts active at the same time. Super forgiving.
  const bindings = {
    forward: new Set(['arrowup', 'w']),
    backward: new Set(['arrowdown', 's']),
    left: new Set(['arrowleft', 'a']),
    right: new Set(['arrowright', 'd']),
  };

  function checkBinding(keys) {
    for (const key of keys) {
      if (activeKeys.has(key)) return true;
    }
    return false;
  }

  return {
    layout,
    read() {
      const forward = checkBinding(bindings.forward);
      const backward = checkBinding(bindings.backward);
      const left = checkBinding(bindings.left);
      const right = checkBinding(bindings.right);
      return { forward, backward, left, right };
    },
  };
}
