import { Clock } from 'three';
import { Vec3 } from 'cannon-es';

// --> Game Bootstrap: this is basically the glue code I wrote to bolt all the pieces together.
import { createEnvironment } from './core/environment';
import { createPhysicsWorld, stepPhysics } from './core/physics';
import { createScoreboard } from './hud/scoreboard';
import { createMall } from './entities/mall';
import { createScooter } from './entities/scooter';
import { createGameOverOverlay } from './hud/gameOver';
import { createKeyboardControls } from './input/keyboard';
import { requestControlScheme } from './input/controlPrompt';
import { loadMallAssets } from './core/assets';

function updateHudHints(layout) {
  const accelerateEl = document.querySelector('[data-hint-accelerate]');
  const steerEl = document.querySelector('[data-hint-steer]');
  const brakeEl = document.querySelector('[data-hint-brake]');

  if (!accelerateEl || !steerEl || !brakeEl) return;

  if (layout === 'arrows') {
    accelerateEl.textContent = 'Tap ↑ to accelerate (W also works)';
    steerEl.textContent = 'Steer with ← / → (A / D also work)';
    brakeEl.textContent = 'Hold ↓ to brake or back up (S also works)';
  } else {
    accelerateEl.textContent = 'Tap W to accelerate (↑ also works)';
    steerEl.textContent = 'Steer with A / D (arrow keys also work)';
    brakeEl.textContent = 'Hold S to brake or back up (↓ also works)';
  }
}

async function startGame() {
  // Ask the player how they want to drive. I just use window.confirm because it's easy.
  const layout = await requestControlScheme();
  const canvas = document.getElementById('app');

  // Set up the Three.js stuff and Cannon physics. Most of this came from docs.
  const assets = await loadMallAssets();
  const { renderer, scene, camera, updateCameraFollow, handleResize } = createEnvironment(canvas, assets);
  const { world, materials } = createPhysicsWorld();
  const controls = createKeyboardControls(layout);
  const scoreboard = createScoreboard();
  scoreboard.setMessage('Rack up points by clipping mall patrons, but dodge gates, barriers, cleaning bots, and walls.');
  const gameOverOverlay = createGameOverOverlay(() => {
    window.location.reload();
  });
  const scooter = createScooter(world, materials.player, assets);
  scene.add(scooter.mesh);

  const mall = createMall(world, scene, assets, materials);
  mall.populate();
  updateHudHints(layout);

  const forwardVector = new Vec3(0, 0, -1);
  const tmpForce = new Vec3();
  const clock = new Clock();
  let isGameOver = false;

  function triggerGameOver(reason) {
    if (isGameOver) return;
    isGameOver = true;
    scoreboard.setMessage('Game over! Press Try Again to restart.');
    gameOverOverlay.show(reason ? `You crashed into ${reason}.` : 'You crashed!');
    scooter.body.velocity.set(0, 0, 0);
    scooter.body.angularVelocity.set(0, 0, 0);
  }

  scooter.body.addEventListener('collide', (event) => {
    // Whenever I hit something I add points and respawn it later.
    const hit = mall.handleCollision(event.body, scooter.body);
    if (!hit || isGameOver) return;
    if (hit.kind === 'fatal') {
      triggerGameOver(hit.label);
      return;
    }
    if (hit.kind === 'score') {
      scoreboard.award(hit.points, hit.label);
    }
  });

  function updatePhysics(delta) {
    if (isGameOver) return;
    // Read keyboard and push the scooter around. Numbers are mostly guess-and-check.
    const { forward, backward, left, right } = controls.read();
    const drive = (forward ? 1 : 0) - (backward ? 1 : 0);
    const steer = (right ? 1 : 0) - (left ? 1 : 0);

    if (drive !== 0) {
      forwardVector.set(0, 0, -1);
      scooter.body.quaternion.vmult(forwardVector, forwardVector);
      tmpForce.copy(forwardVector).scale(75 * drive);
      scooter.body.applyForce(tmpForce, scooter.body.position);
    }

    if (steer !== 0) {
      scooter.body.angularVelocity.y -= steer * delta * 5;
    }

    stepPhysics(world, delta);
  }

  function syncGraphics(delta) {
    if (isGameOver) return;
    scooter.sync(delta);
    mall.sync(delta);
    updateCameraFollow(scooter.mesh);
    // Finally draw everything. If this lags I probably added too many props.
    renderer.render(scene, camera);
  }

  function loop() {
    if (isGameOver) return;
    const delta = clock.getDelta();
    updatePhysics(delta);
    syncGraphics(delta);
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', handleResize);
  loop();
}

startGame().catch((error) => {
  console.error('[Grand Theft Scooter] Failed to start game loop:', error);
});
