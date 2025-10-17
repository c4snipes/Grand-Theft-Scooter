export function createGameOverOverlay(onRestart = () => {}) {
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
  Object.assign(message.style, { margin: '0 0 16px', fontSize: '16px', opacity: '0.9' });
  panel.appendChild(message);

  const buttons = document.createElement('div');
  Object.assign(buttons.style, { display: 'flex', gap: '12px', justifyContent: 'center' });
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
    if (text) {
      message.textContent = text;
    } else {
      message.textContent = '';
    }
    root.style.display = 'flex';
  }

  function hide() {
    root.style.display = 'none';
  }

  retry.addEventListener('click', () => {
    try { hide(); } catch (_) {}
    try { onRestart(); } catch (_) {}
  });
  close.addEventListener('click', hide);

  return { show, hide, dispose() { if (root && root.parentNode) root.parentNode.removeChild(root); } };
}
