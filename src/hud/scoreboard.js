// --> HUD Scoreboard: nothing fancy, just a couple lines of text so I can see my score.
export function createScoreboard() {
  const root = document.createElement('div');
  root.id = 'scoreboard';
  Object.assign(root.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    left: 'auto',
    padding: '8px 12px',
    background: 'rgba(0, 0, 0, 0.55)',
    color: '#fff',
    fontFamily: 'Arial, sans-serif',
    fontSize: '16px',
    borderRadius: '6px',
    pointerEvents: 'none',
    zIndex: '10',
    maxWidth: '220px',
    lineHeight: '1.35',
    textAlign: 'right',
  });

  const scoreLine = document.createElement('div');
  scoreLine.textContent = 'Score: 0';
  root.appendChild(scoreLine);

  const lastLine = document.createElement('div');
  lastLine.textContent = '';
  lastLine.style.fontSize = '13px';
  lastLine.style.opacity = '0.8';
  root.appendChild(lastLine);

  document.body.appendChild(root);

  let score = 0;
  let lastTimeout = null;

  return {
    award(points, label) {
      score += points;
      scoreLine.textContent = `Score: ${score}`;
      lastLine.textContent = `Last hit: +${points} for ${label}`;

      if (lastTimeout) clearTimeout(lastTimeout);
      lastTimeout = setTimeout(() => {
        lastLine.textContent = '';
      }, 2500);

      return score;
    },
    getScore() {
      return score;
    },
    setMessage(message) {
      lastLine.textContent = message ?? '';
      if (lastTimeout) {
        clearTimeout(lastTimeout);
        lastTimeout = null;
      }
    },
  };
}
