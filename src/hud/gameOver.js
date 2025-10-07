// --> HUD Game Over Overlay: simple blocker panel that shows the crash reason.
export function createGameOverOverlay(onReset) {
  const root = document.createElement('div');
  root.id = 'game-over-overlay';
  root.className = 'game-over';

  const title = document.createElement('h2');
  title.textContent = 'Game Over';
  title.className = 'game-over__title';
  root.appendChild(title);

  const reasonLine = document.createElement('p');
  reasonLine.textContent = '';
  reasonLine.className = 'game-over__reason';
  root.appendChild(reasonLine);

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.textContent = 'Try Again';
  resetButton.className = 'game-over__button';
  resetButton.addEventListener('click', () => {
    if (typeof onReset === 'function') {
      onReset();
    } else {
      window.location.reload();
    }
  });
  root.appendChild(resetButton);

  document.body.appendChild(root);

  function show(reason) {
    reasonLine.textContent = reason ?? 'The scooter has seen better days.';
    root.classList.add('game-over--visible');
  }

  function hide() {
    root.classList.remove('game-over--visible');
  }

  return {
    show,
    hide,
  };
}
