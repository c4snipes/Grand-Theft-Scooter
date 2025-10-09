import { Clock, Vector3 } from 'three';
import { Vec3 } from 'cannon-es';

// --> Game Bootstrap: this is basically the glue code I wrote to bolt all the pieces together.
import { createEnvironment } from './core/environment';
import { createPhysicsWorld, stepPhysics } from './core/physics';
import { createScoreboard } from './hud/scoreboard';
import { createMall } from './entities/mall';
import { createScooter } from './entities/scooter';
import { createGameOverOverlay } from './hud/gameOver';
import { createKeyboardControls } from './input/keyboard';
import { createSettingsManager } from './input/controlPrompt';
import { loadMallAssets } from './core/assets';

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

async function startGame() {
  const canvas = document.getElementById('app');
  if (!canvas) {
    throw new Error('Expected to find a canvas with id="app"');
  }

  let controls = null;
  let scoreboard = null;
  let cameraMode = 'follow';
  let activeLayout = 'wasd';
  let applyEnvironmentTheme = () => {};

  const settings = createSettingsManager({
    onControlSchemeChange: (nextLayout) => {
      activeLayout = nextLayout;
      if (controls) {
        controls.setLayout(nextLayout);
      }
      updateHudHints(nextLayout);
      refreshCameraMessage();
    },
    onThemeChange: (themeMode) => {
      applyEnvironmentTheme(themeMode);
    },
  });

  activeLayout = settings.getControlScheme();
  updateHudHints(activeLayout);

  // Set up the Three.js stuff and Cannon physics. Most of this came from docs.
  const assets = await loadMallAssets();
  const {
    renderer,
    scene,
    camera,
    setCameraMode,
    updateCamera,
    handleResize,
    controls: orbitControls,
    setColorMode,
  } = createEnvironment(canvas, assets, { theme: settings.getTheme() });
  applyEnvironmentTheme = setColorMode;
  applyEnvironmentTheme(settings.getTheme());

  const { world, materials } = createPhysicsWorld();
  controls = createKeyboardControls(activeLayout);
  scoreboard = createScoreboard();
  const resetButton = document.querySelector('[data-reset]');
  const gameOverOverlay = createGameOverOverlay(() => {
    window.location.reload();
  });
  const scooter = createScooter(world, materials.player, assets);
  scene.add(scooter.mesh);
  scooter.sync(0);
  setCameraMode(cameraMode);
  const mall = createMall(world, scene, assets, materials);
  mall.populate({ mode: assets.mallScene ? 'static' : 'default' });
  updateHudHints(activeLayout);

  const forwardVector = new Vec3(0, 0, -1);
  const tmpForce = new Vec3();
  const clock = new Clock();
  const cameraForward = new Vector3();
  const cameraRight = new Vector3();
  const cameraMove = new Vector3();
  const worldUp = new Vector3(0, 1, 0);
  const spawnPosition = { x: 0, y: 0.35, z: 0 };
  const spawnQuaternion = { x: 0, y: 0, z: 0, w: 1 };
  let isGameOver = false;

  function refreshCameraMessage() {
    if (!scoreboard || isGameOver) return;
    const schemeLabel = activeLayout === 'arrows' ? 'the arrow keys' : 'WASD';
    if (cameraMode === 'orbit') {
      scoreboard.setMessage(`Free camera active. Use ${schemeLabel} to glide the camera. Drag to look around, scroll to zoom, press C to get back on the scooter, R to reset your ride, Esc for settings.`);
    } else {
      scoreboard.setMessage(`Follow cam active. Use ${schemeLabel} to drive the scooter. Press C for a free camera, R to reset your ride, Esc for settings.`);
    }
  }

  function resetScooter() {
    if (isGameOver) return;
    scooter.body.velocity.set(0, 0, 0);
    scooter.body.angularVelocity.set(0, 0, 0);
    scooter.body.position.set(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    scooter.body.quaternion.set(spawnQuaternion.x, spawnQuaternion.y, spawnQuaternion.z, spawnQuaternion.w);
    scooter.sync(0);
    orbitControls.target.copy(scooter.mesh.position);
    orbitControls.update();
    if (cameraMode !== 'follow') {
      cameraMode = 'follow';
      setCameraMode(cameraMode);
    }
    refreshCameraMessage();
  }

  refreshCameraMessage();
  resetScooter();

  if (resetButton) {
    resetButton.addEventListener('click', (event) => {
      event.preventDefault();
      resetScooter();
    });
  }

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key === 'c' && !isGameOver) {
      cameraMode = cameraMode === 'orbit' ? 'follow' : 'orbit';
      setCameraMode(cameraMode);
      refreshCameraMessage();
    }
    if (key === 'r') {
      event.preventDefault();
      resetScooter();
    }
  });

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

  function updatePhysics(delta, input) {
    if (isGameOver) return;
    if (cameraMode === 'follow') {
      const drive = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
      const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);

      if (drive !== 0) {
        forwardVector.set(0, 0, -1);
        scooter.body.quaternion.vmult(forwardVector, forwardVector);
        tmpForce.copy(forwardVector).scale(75 * drive);
        scooter.body.applyForce(tmpForce, scooter.body.position);
      }

      if (steer !== 0) {
        scooter.body.angularVelocity.y -= steer * delta * 5;
      }
    }

    stepPhysics(world, delta);
  }

  function handleFreeCameraMovement(delta, input) {
    if (isGameOver || cameraMode !== 'orbit') return;

    const moveZ = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (moveZ === 0 && moveX === 0) return;

    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    if (cameraForward.lengthSq() < 1e-6) {
      cameraForward.set(0, 0, -1);
    } else {
      cameraForward.normalize();
    }

    cameraRight.copy(cameraForward).cross(worldUp);
    cameraRight.y = 0;
    if (cameraRight.lengthSq() < 1e-6) {
      cameraRight.set(1, 0, 0);
    } else {
      cameraRight.normalize();
    }

    cameraMove.set(0, 0, 0);
    cameraMove.addScaledVector(cameraForward, moveZ);
    cameraMove.addScaledVector(cameraRight, moveX);

    if (cameraMove.lengthSq() === 0) return;

    cameraMove.normalize().multiplyScalar(delta * 22);
    camera.position.add(cameraMove);
    orbitControls.target.add(cameraMove);
    orbitControls.update();
  }

  function syncGraphics(delta) {
    if (isGameOver) return;
    scooter.sync(delta);
    mall.sync(delta);
    updateCamera(scooter.mesh);
    // Finally draw everything. If this lags I probably added too many props.
    renderer.render(scene, camera);
  }

  function loop() {
    if (isGameOver) return;
    const delta = clock.getDelta();
    const inputState = controls.read();
    updatePhysics(delta, inputState);
    handleFreeCameraMovement(delta, inputState);
    syncGraphics(delta);
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', handleResize);
  loop();
}

startGame().catch((error) => {
  console.error('[Grand Theft Scooter] Failed to start game loop:', error);
});
