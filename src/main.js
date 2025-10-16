import {
  Clock,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Plane,
  Raycaster,
  RingGeometry,
  Vector2,
  Vector3,
} from 'three';
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
import { loadMallAssets, loadNpcPacks } from './core/assets';
import { assertDefined, invariant } from './core/assert';

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
  assertDefined(canvas, 'Expected to find a canvas with id="app".');

  let controls = null;
  let scoreboard = null;
  let cameraMode = 'follow';
  let activeLayout = 'wasd';
  let applyEnvironmentTheme = () => {};
  let isGameOver = false;
  let spawnSelector = null;

  // Small loading overlay is visible by default; hide once assets + scene are ready
  const loadingEl = document.querySelector('[data-loading]');
  function setLoadingVisible(visible) {
    if (!loadingEl) return;
    loadingEl.hidden = !visible;
  }

  function isSpawnSelectorActive() {
    return Boolean(spawnSelector && typeof spawnSelector.isActive === 'function' && spawnSelector.isActive());
  }

  function refreshCameraMessage() {
    if (!scoreboard || isGameOver) return;
    if (isSpawnSelectorActive()) return;
    const schemeLabel = activeLayout === 'arrows' ? 'the arrow keys' : 'WASD';
    if (cameraMode === 'orbit') {
      scoreboard.setMessage(
        `Free camera active. Use ${schemeLabel} to glide the camera. Drag to look around, scroll to zoom, press C to get back on the scooter, R to reposition your ride, Esc for settings.`,
        { duration: 4200 },
      );
    } else {
      scoreboard.setMessage(
        `Follow cam active. Use ${schemeLabel} to drive the scooter. Press C for a free camera, R to reposition your ride, Esc for settings.`,
        { duration: 4200 },
      );
    }
  }

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
  invariant(renderer && typeof renderer.render === 'function', 'createEnvironment must supply a renderer with render().');
  invariant(scene && typeof scene.add === 'function', 'createEnvironment must supply a valid scene.');
  invariant(camera && typeof camera.isCamera === 'boolean', 'createEnvironment must supply a THREE camera.');
  invariant(typeof setCameraMode === 'function', 'createEnvironment must supply setCameraMode().');
  invariant(typeof updateCamera === 'function', 'createEnvironment must supply updateCamera().');
  invariant(typeof handleResize === 'function', 'createEnvironment must supply handleResize().');
  invariant(orbitControls && typeof orbitControls.update === 'function', 'createEnvironment must supply orbit controls with update().');
  invariant(typeof setColorMode === 'function', 'createEnvironment must supply setColorMode().');
  applyEnvironmentTheme = setColorMode;
  applyEnvironmentTheme(settings.getTheme());


  // Dynamic resolution scaling to reduce latency on slower machines
  const basePixelRatio = Math.min(window.devicePixelRatio, 1.5);
  let dynamicPixelRatio = basePixelRatio;
  let fpsEMA = 60; // exponential moving average of FPS

  const { world, materials } = createPhysicsWorld();
  controls = createKeyboardControls(activeLayout);
  scoreboard = createScoreboard();
  invariant(
    scoreboard
    && typeof scoreboard.updateTelemetry === 'function'
    && typeof scoreboard.setMessage === 'function'
    && typeof scoreboard.toggleDashboard === 'function',
    'createScoreboard must return an object with updateTelemetry(), setMessage(), and toggleDashboard().',
  );
  invariant(controls && typeof controls.setLayout === 'function', 'createKeyboardControls must provide setLayout().');
  scoreboard.updateTelemetry({
    speed: 0,
    topSpeed: 0,
    hits: 0,
    hazards: 0,
    runtime: 0,
    status: 'Ready',
  });

  const resetButton = document.querySelector('[data-reset]');
  const gameOverOverlay = createGameOverOverlay(() => {
    window.location.reload();
  });
  invariant(gameOverOverlay && typeof gameOverOverlay.show === 'function', 'createGameOverOverlay must provide show().');

  const scooter = createScooter(world, materials.player, assets);
  scene.add(scooter.mesh);
  scooter.sync(0);
  setCameraMode(cameraMode);

  const mall = createMall(world, scene, assets, materials);
  invariant(
    mall
    && typeof mall.populate === 'function'
    && typeof mall.handleCollision === 'function'
    && typeof mall.findNearestNavigablePoint === 'function',
    'createMall must return an object supporting populate(), handleCollision(), and findNearestNavigablePoint().',
  );
  mall.populate({ mode: assets.mallScene ? 'static' : 'default' });
  updateHudHints(activeLayout);

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
  } catch (_) { /* non-fatal */ }
  const forwardVector = new Vec3(0, 0, -1);
  const tmpForce = new Vec3();
  const clock = new Clock();
  const cameraForward = new Vector3();
  const cameraRight = new Vector3();
  const cameraMove = new Vector3();
  const worldUp = new Vector3(0, 1, 0);
  const CAMERA_AXIS_NORMALIZE_THRESHOLD = 1e-6;

  function applyDriveForce(drive) {
    if (drive === 0) return;
    forwardVector.set(0, 0, -1);
    scooter.body.quaternion.vmult(forwardVector, forwardVector);
    tmpForce.copy(forwardVector).scale(75 * drive);
    scooter.body.applyForce(tmpForce, scooter.body.position);
  }

  function applySteering(steer, delta) {
    if (steer === 0) return;
    scooter.body.angularVelocity.y -= steer * delta * 5;
  }

  function alignHorizontalAxis(target, fallbackX, fallbackZ) {
    target.y = 0;
    if (target.lengthSq() < CAMERA_AXIS_NORMALIZE_THRESHOLD) {
      target.set(fallbackX, 0, fallbackZ);
    } else {
      target.normalize();
    }
  }

  const runStats = {
    hits: 0,
    hazards: 0,
    topSpeed: 0,
    startTime: performance.now(),
    endTime: null,
  };
  let currentSpeed = 0;
  let resetInProgress = false;
  const scoreboardTagline = 'Chase points by bowling over mall patrons riding the new character models, but colliding with security gates, maintenance barriers, cleaning robots, or the mall walls will end the run instantly.';

  function createSpawnSelector({
    selectorCamera,
    selectorRenderer,
    selectorScene,
    selectorMall,
    getScooterBody,
  }) {
    invariant(
      selectorCamera && typeof selectorCamera.isCamera === 'boolean',
      'createSpawnSelector requires a THREE camera instance.',
    );
    invariant(
      selectorRenderer && selectorRenderer.domElement,
      'createSpawnSelector requires a renderer with a domElement.',
    );
    invariant(selectorScene && typeof selectorScene.add === 'function', 'createSpawnSelector requires a THREE scene.');
    invariant(
      selectorMall && typeof selectorMall.findNearestNavigablePoint === 'function',
      'createSpawnSelector requires selectorMall.findNearestNavigablePoint().',
    );
    const geometry = new RingGeometry(0.8, 1.25, 48);
    const material = new MeshBasicMaterial({
      color: '#4f8ef7',
      opacity: 0.6,
      transparent: true,
      side: DoubleSide,
      depthTest: false,
    });
    const indicator = new Mesh(geometry, material);
    indicator.rotation.x = -Math.PI / 2;
    indicator.position.y = 0.02;
    indicator.visible = false;
    selectorScene.add(indicator);

    const selectorDomElement = selectorRenderer.domElement;

    const pointer = new Vector2();
    const raycaster = new Raycaster();
    const plane = new Plane(new Vector3(0, 1, 0), 0);
    const intersection = new Vector3();
    const fallback = new Vector3();
    const candidate = new Vector3();
    let active = false;
    let resolver = null;

    function currentIgnoreBodies() {
      const body = typeof getScooterBody === 'function' ? getScooterBody() : null;
      return body ? [body] : [];
    }

    function computeSafe(point) {
      return selectorMall.findNearestNavigablePoint(point, 3.6, { ignoreBodies: currentIgnoreBodies() });
    }

    function worldPointFromEvent(event) {
      const rect = selectorDomElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      pointer.set(x, y);
      raycaster.setFromCamera(pointer, selectorCamera);
      if (!raycaster.ray.intersectPlane(plane, intersection)) {
        return null;
      }
      return intersection.clone();
    }

    function preview(point) {
      const safe = computeSafe(point ?? fallback);
      candidate.copy(safe);
      indicator.visible = true;
      indicator.position.set(safe.x, safe.y + 0.02, safe.z);
    }

    function handlePointerMove(event) {
      if (!active) return;
      event.preventDefault();
      const worldPoint = worldPointFromEvent(event);
      if (worldPoint) {
        preview(worldPoint);
      }
    }

    function finishSelection(output) {
      if (!resolver) return;
      const safe = computeSafe(output ?? candidate);
      const result = safe.clone();
      // Defensive: store resolver in a local variable before cleanup() nullifies it
      const resolve = resolver;
      cleanup();
      resolve(result);
    }

    function handleClick(event) {
      if (!active) return;
      event.preventDefault();
      const worldPoint = worldPointFromEvent(event);
      if (worldPoint) {
        preview(worldPoint);
      }
      finishSelection(candidate);
    }

    function handleKey(event) {
      if (!active) return;
      const key = event.key.toLowerCase();
      if (key === 'enter' || key === ' ') {
        event.preventDefault();
        finishSelection(candidate);
      } else if (key === 'escape') {
        event.preventDefault();
        finishSelection(fallback);
      }
    }

    function cleanup() {
      active = false;
      indicator.visible = false;
      selectorDomElement.removeEventListener('pointermove', handlePointerMove);
      selectorDomElement.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKey);
      resolver = null;
    }

    async function pick(start) {
      if (active) {
        return candidate.clone();
      }
      active = true;
      fallback.copy(computeSafe(start ?? new Vector3(0, 0, 0)));
      preview(fallback);
      selectorDomElement.addEventListener('pointermove', handlePointerMove);
      selectorDomElement.addEventListener('click', handleClick);
      window.addEventListener('keydown', handleKey);
      return new Promise((resolve) => {
        resolver = resolve;
      });
    }

    return {
      pick,
      isActive: () => active,
      dispose() {
        if (active) cleanup();
        selectorScene.remove(indicator);
        indicator.geometry.dispose();
        indicator.material.dispose();
      },
    };
  }

  spawnSelector = createSpawnSelector({
    selectorCamera: camera,
    selectorRenderer: renderer,
    selectorScene: scene,
    selectorMall: mall,
    getScooterBody: () => scooter.body,
  });

  // While the spawn selector is active, render frames so the user can see the map and indicator
  let spawnPreviewActive = false;
  function renderSpawnPreview() {
    if (!spawnPreviewActive) return;
    renderer.render(scene, camera);
    requestAnimationFrame(renderSpawnPreview);
  }


  function updateRunTelemetry() {
    if (!scoreboard) return;
    const now = performance.now();
    const elapsedMs = isGameOver && runStats.endTime
      ? runStats.endTime - runStats.startTime
      : now - runStats.startTime;
    scoreboard.updateTelemetry({
      speed: currentSpeed,
      topSpeed: runStats.topSpeed,
      hits: runStats.hits,
      hazards: runStats.hazards,
      runtime: elapsedMs / 1000,
      status: isGameOver ? 'Downed' : 'Rolling',
    });
  }

  async function resetScooter({ interactive = true } = {}) {
    if (isGameOver || resetInProgress) return;
    resetInProgress = true;
    try {
      const previous = new Vector3(spawnPoint.x, 0, spawnPoint.z);
      let target = mall.findNearestNavigablePoint(previous, 3.6, { ignoreBodies: [scooter.body] });

      if (interactive) {
        scoreboard.setMessage(
          'Click the floor to deploy your scooter. Press Enter to confirm or Esc to use the suggested spot.',
          { duration: 0 },
        );
        spawnPreviewActive = true;
        renderSpawnPreview();
        try {
          target = await spawnSelector.pick(target);
        } finally {
          spawnPreviewActive = false;
          scoreboard.clearMessage();
        }
      }

      const safe = mall.findNearestNavigablePoint(target.clone(), 3.6, { ignoreBodies: [scooter.body] });
      spawnPoint.set(safe.x, SCOOTER_SPAWN_HEIGHT, safe.z);
      scooter.body.velocity.set(0, 0, 0);
      scooter.body.angularVelocity.set(0, 0, 0);
      scooter.body.position.set(spawnPoint.x, spawnPoint.y, spawnPoint.z);
      scooter.body.quaternion.set(spawnQuaternion.x, spawnQuaternion.y, spawnQuaternion.z, spawnQuaternion.w);
      scooter.sync(0);
      orbitControls.target.copy(scooter.mesh.position);
      orbitControls.update();
      if (cameraMode !== 'follow') {
        cameraMode = 'follow';
        setCameraMode(cameraMode);
      }
      runStats.hits = 0;
      runStats.hazards = 0;
      runStats.topSpeed = 0;
      runStats.startTime = performance.now();
      runStats.endTime = null;
      currentSpeed = 0;
      scoreboard.updateTelemetry({
        speed: 0,
        topSpeed: 0,
        hits: runStats.hits,
        hazards: runStats.hazards,
        runtime: 0,
        status: 'Rolling',
      });
      scoreboard.setMessage(scoreboardTagline, { duration: 6400 });
    } finally {
      resetInProgress = false;
    }
  }

  function queueReset(options = {}) {
    resetScooter(options).catch((error) => {
      console.error('[Grand Theft Scooter] Failed to reset scooter:', error);
    });
  }

  if (resetButton) {
    resetButton.addEventListener('click', (event) => {
      event.preventDefault();
      queueReset({ interactive: true });
    });
  }

  function handleCameraModeToggle() {
    if (isGameOver || isSpawnSelectorActive()) return;
    cameraMode = cameraMode === 'orbit' ? 'follow' : 'orbit';
    setCameraMode(cameraMode);
    refreshCameraMessage();
  }

  function handleResetKey(event) {
    if (isSpawnSelectorActive()) return;
    event.preventDefault();
    queueReset({ interactive: !event.shiftKey });
  }

  function handleTelemetryKey(event) {
    event.preventDefault();
    if (isSpawnSelectorActive()) return;
    const visible = scoreboard.toggleDashboard();
    scoreboard.setMessage(
      visible ? 'Telemetry open. Press I to hide.' : 'Telemetry hidden. Press I to view stats.',
      { duration: 2600 },
    );
  }

  const keyHandlers = {
    c: handleCameraModeToggle,
    r: handleResetKey,
    i: handleTelemetryKey,
  };

  function handleKeydown(event) {
    const handler = keyHandlers[event.key.toLowerCase()];
    if (!handler) return;
    handler(event);
  }

  window.addEventListener('keydown', handleKeydown);

  function triggerGameOver(reason) {
    if (isGameOver) return;
    isGameOver = true;
    runStats.endTime = performance.now();
    if (reason) {
      runStats.hazards += 1;
    }
    currentSpeed = 0;
    scoreboard.updateTelemetry({
      speed: 0,
      hazards: runStats.hazards,
      topSpeed: runStats.topSpeed,
      hits: runStats.hits,
      runtime: (runStats.endTime - runStats.startTime) / 1000,
      status: 'Downed',
    });
    scoreboard.setMessage('Game over! Press Try Again to restart.', { duration: 0 });
    gameOverOverlay.show(reason ? `You crashed into ${reason}.` : 'You crashed!');
    scooter.body.velocity.set(0, 0, 0);
    scooter.body.angularVelocity.set(0, 0, 0);
  }

  scooter.body.addEventListener('collide', (event) => {
    const hit = mall.handleCollision(event.body, scooter.body);
    if (!hit || isGameOver) return;
    if (hit.kind === 'fatal') {
      triggerGameOver(hit.label);
      return;
    }
    if (hit.kind === 'score') {
      runStats.hits += 1;
      scoreboard.award(hit.points, hit.label);
      scoreboard.updateTelemetry({ hits: runStats.hits });
    }
  });

  function updatePhysics(delta, input) {
    if (cameraMode === 'follow') {
      const drive = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
      const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);

      if (scooter && typeof scooter.setControlsState === 'function') {
        scooter.setControlsState({ drive, steer });
      }

      applyDriveForce(drive);
      applySteering(steer, delta);
    }

    stepPhysics(world, delta);
    currentSpeed = scooter.body.velocity.length();
    if (currentSpeed > runStats.topSpeed) {
      runStats.topSpeed = currentSpeed;
    }
  }

  function handleFreeCameraMovement(delta, input) {
    if (cameraMode !== 'orbit' || isSpawnSelectorActive()) return;

    const moveZ = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (moveZ === 0 && moveX === 0) return;

    camera.getWorldDirection(cameraForward);
    alignHorizontalAxis(cameraForward, 0, -1);

    cameraRight.copy(cameraForward).cross(worldUp);
    alignHorizontalAxis(cameraRight, 1, 0);

    cameraMove.set(0, 0, 0);
    cameraMove.addScaledVector(cameraForward, moveZ);
    cameraMove.addScaledVector(cameraRight, moveX);

    if (cameraMove.lengthSq() === 0) return;
    cameraMove.normalize().multiplyScalar(delta * 22);
    camera.position.add(cameraMove);
    orbitControls.target.add(cameraMove);
    orbitControls.update();
  }

  // Hide loading overlay right before interactive scooter spawn
  setLoadingVisible(false);

  function syncGraphics(delta) {
    scooter.sync(delta);
    mall.sync(delta);
    updateCamera(scooter.mesh);

  // Kick off lazy NPC pack loading to improve startup and upgrade future spawns
  loadNpcPacks().then(({ animatedMenVariants, animatedWomenVariants }) => {
    assets.animatedMenVariants = animatedMenVariants;
    assets.animatedWomenVariants = animatedWomenVariants;
    assets.npcPacksReady = true;
    if (scoreboard) {
      scoreboard.setMessage('Character packs loaded. Upgrading the mall crowd…', { duration: 4200 });
    }
    if (mall && typeof mall.addPatrons === 'function') {
      // Add a fresh batch of higher-fidelity NPCs now that packs are ready
      mall.addPatrons(14);
    }
  }).catch((err) => console.warn('[assets] Failed to load NPC packs:', err));

    renderer.render(scene, camera);
  }

  await resetScooter({ interactive: true });
  updateRunTelemetry();
  setTimeout(() => {
    if (!isGameOver) {
      refreshCameraMessage();
    }
  }, 6500);

  function loop() {
    const delta = clock.getDelta();
    const inputState = controls.read();
    if (!isGameOver) {
      updatePhysics(delta, inputState);
    }
    handleFreeCameraMovement(delta, inputState);
    updateRunTelemetry();

    // Update dynamic resolution scaling ~once per frame with light hysteresis
    const fps = delta > 0 ? 1 / delta : 60;
    fpsEMA = fpsEMA * 0.9 + fps * 0.1;
    let nextPR = dynamicPixelRatio;
    if (fpsEMA < 40 && dynamicPixelRatio > 1.0) nextPR = Math.max(1.0, dynamicPixelRatio - 0.1);
    else if (fpsEMA > 58 && dynamicPixelRatio < basePixelRatio) nextPR = Math.min(basePixelRatio, dynamicPixelRatio + 0.1);
    if (Math.abs(nextPR - dynamicPixelRatio) > 0.05) {
      dynamicPixelRatio = nextPR;
      renderer.setPixelRatio(dynamicPixelRatio);
    }

    syncGraphics(delta);
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', handleResize);
  loop();
}

startGame().catch((error) => {
  console.error('[Grand Theft Scooter] Failed to start game loop:', error);
});
