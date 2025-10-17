import { Clock, Vector3, Raycaster, Box3 } from 'three';
import { Body, Box as CannonBox, Vec3 } from 'cannon-es';

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
import { createSpawnSelector } from './systems/spawnSelector';
import { createGameLoop } from './systems/gameLoop';
import { createDebugMarkers } from './debug/markers';

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

  const isSpawnSelectorActive = () => Boolean(spawnSelector?.isActive?.());

  function refreshCameraMessage() {
    if (!scoreboard || isGameOver) return;
    if (isSpawnSelectorActive()) return;
  function applyCameraSensitivity(mode) {
    const s = (mode === 'low') ? { rot: 0.6, zoom: 0.8, pan: 0.6 }
      : (mode === 'high') ? { rot: 1.6, zoom: 1.4, pan: 1.6 }
      : { rot: 1.0, zoom: 1.0, pan: 1.0 };
    try {
      if (orbitControls) {
        orbitControls.rotateSpeed = s.rot;
        orbitControls.zoomSpeed = s.zoom;
        orbitControls.panSpeed = s.pan;
        orbitControls.update();
      }
    } catch (_) {}
  }

    const schemeLabel = activeLayout === 'arrows' ? 'the arrow keys' : 'WASD';
    if (cameraMode === 'orbit') {
      scoreboard.setMessage(
        'Free camera active. Drag to look around, scroll to zoom. Press C to get back on the scooter, R to reposition your ride, Esc for settings.',
        { duration: 4200 },
      );
    } else {
      scoreboard.setMessage(
        `Follow cam active. Use ${schemeLabel} to drive the scooter. Press C for a free camera (mouse only), R to reposition your ride, Esc for settings.`,
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
    onCameraSensitivityChange: (mode) => {
      applyCameraSensitivity(mode);
    },
    onGraphicsChange: (g) => {
      try { setShadows?.(!!g?.shadows); } catch (_) {}
    },
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
    controls: orbitControls,
    setColorMode,
    setShadowsEnabled,
    dispose: disposeEnvironment,
  } = createEnvironment(canvas, assets, { theme: settings.getTheme() });
  invariant(renderer && typeof renderer.render === 'function', 'createEnvironment must supply a renderer with render().');
  invariant(scene && typeof scene.add === 'function', 'createEnvironment must supply a valid scene.');
  invariant(camera && typeof camera.isCamera === 'boolean', 'createEnvironment must supply a THREE camera.');
  // Apply camera sensitivity based on user setting
  try { applyCameraSensitivity(settings.getCameraSensitivity?.() || 'normal'); } catch (_) {}

  invariant(typeof setCameraMode === 'function', 'createEnvironment must supply setCameraMode().');
  invariant(typeof updateCamera === 'function', 'createEnvironment must supply updateCamera().');
  invariant(typeof handleResize === 'function', 'createEnvironment must supply handleResize().');
  invariant(orbitControls && typeof orbitControls.update === 'function', 'createEnvironment must supply orbit controls with update().');
  invariant(typeof setColorMode === 'function', 'createEnvironment must supply setColorMode().');
  applyEnvironmentTheme = setColorMode;
  applyEnvironmentTheme(settings.getTheme());
  const setShadows = setShadowsEnabled;
  try { setShadows?.(!!settings.getShadowsEnabled?.()); } catch (_) {}

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
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'F9') { ev.preventDefault?.(); window.toggleDebugMarkers(); }
    });
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
      if (window.DEBUG_SPAWN) { try { debug.setFloorHit(x, y, z); } catch (_) {} }
      return y;
    }
    return 0;
  }

  // Dynamic resolution scaling knobs are handled in the loop module

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
  let disposeAll = () => {};
  const gameOverOverlay = createGameOverOverlay(() => {
    try { disposeAll(); } catch (_) {}
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

  // Add a large invisible physics floor aligned to the mall's visual floor so the scooter doesn't fall through
  try {
    const mallObj = scene.getObjectByName('shopping-mall');
    if (mallObj) {
      const bounds = new Box3().setFromObject(mallObj);
      const size = bounds.getSize(new Vector3());
      const center = bounds.getCenter(new Vector3());
      const floorY = getMallFloorYAt(center.x, center.z);
      const slabHeight = 1.0; // thicker slab to reduce chance of tunneling
      const halfX = Math.max(2, size.x / 2 + 1.0);
      const halfZ = Math.max(2, size.z / 2 + 1.0);
      const floorBody = new Body({
        mass: 0,
        shape: new CannonBox(new Vec3(halfX, slabHeight / 2, halfZ)),
        position: new Vec3(0, floorY + slabHeight / 2, 0),
      });
      if (materials && materials.ground) floorBody.material = materials.ground;
      world.addBody(floorBody);
      if (window.DEBUG_SPAWN) { try { debug.showFloorSlab({ x: 0, y: floorY + slabHeight / 2, z: 0, hx: halfX, hy: slabHeight / 2, hz: halfZ }); } catch (_) {} }
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
  } catch (_) { /* non-fatal */ }
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
    tmpForce.copy(forwardVector).scale(75 * drive);
    scooter.body.applyForce(tmpForce, scooter.body.position);
  }

  function applySteering(steer, delta) {
    if (steer === 0) return;
    scooter.body.angularVelocity.y -= steer * delta * 5;
  }

  const runStats = {
    hits: 0,
    hazards: 0,
    topSpeed: 0,
    startTime: performance.now(),
    endTime: null,
  };
  let currentSpeed = 0;
  let npcPacksLoading = false;

  let resetInProgress = false;
  const scoreboardTagline = 'Chase points by bowling over mall patrons riding the new character models, but colliding with security gates, maintenance barriers, cleaning robots, or the mall walls will end the run instantly.';

  // Build spawn selector UI module
  spawnSelector = createSpawnSelector({
    selectorCamera: camera,
    selectorRenderer: renderer,
    selectorScene: scene,
    selectorMall: mall,
    getScooterBody: () => scooter.body,
  });

  // While the spawn selector is active, render frames so the user can see the map and indicator
  let spawnPreviewActive = false;
  let spawnPreviewFrameId = null;
  function renderSpawnPreview() {
    if (!spawnPreviewActive) {
      spawnPreviewFrameId = null;
      return;
    }
    renderer.render(scene, camera);
    if (spawnPreviewFrameId === null) {
      spawnPreviewFrameId = requestAnimationFrame(() => {
        spawnPreviewFrameId = null;
        renderSpawnPreview();
      });
    }
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
        // Lock UI so settings cannot be opened/changed during spawn selection
        try { document.documentElement.classList.add('ui-locked'); } catch (_) {}
        try { settings.close?.(); } catch (_) {}


	        // Let the user orbit/pan/zoom the camera while choosing spawn
	        const prevCameraMode = cameraMode;
	        if (prevCameraMode !== 'orbit') {
	          cameraMode = 'orbit';
	          setCameraMode(cameraMode);
	        }

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
          if (spawnPreviewFrameId !== null) {
              try { document.documentElement.classList.remove('ui-locked'); } catch (_) {}

            cancelAnimationFrame(spawnPreviewFrameId);
            spawnPreviewFrameId = null;
          }
          if (scoreboard) {
            scoreboard.clearMessage();
          }
        }
      }

      const safe = mall.findNearestNavigablePoint(target, 3.6, { ignoreBodies: [scooter.body] });
      const halfY = scooter?.body?.shapes?.[0]?.halfExtents?.y ?? (SCOOTER_SPAWN_HEIGHT - 0.05);
      const floorY = getMallFloorYAt(safe.x, safe.z);
      const spawnY = Math.max(SCOOTER_SPAWN_HEIGHT, (floorY || 0) + halfY + 0.05);
      if (window.DEBUG_SPAWN) {
        console.debug('[spawn] floorY:', floorY?.toFixed?.(3), 'halfY:', halfY?.toFixed?.(3), 'spawnY:', spawnY?.toFixed?.(3));
      }
      spawnPoint.set(safe.x, spawnY, safe.z);
      scooter.body.velocity.set(0, 0, 0);
      scooter.body.angularVelocity.set(0, 0, 0);
      scooter.body.position.set(spawnPoint.x, spawnPoint.y, spawnPoint.z);
      scooter.body.quaternion.set(spawnQuaternion.x, spawnQuaternion.y, spawnQuaternion.z, spawnQuaternion.w);
      scooter.sync(0);
      if (window.DEBUG_SPAWN) { try { debug.setSpawnMarker(spawnPoint.x, spawnPoint.y, spawnPoint.z); } catch (_) {} }
      try { scooter.body.wakeUp?.(); } catch (_) {}
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

  let handleResetButtonClick = null;
  if (resetButton) {
    handleResetButtonClick = (event) => {
      event.preventDefault();
      queueReset({ interactive: true });
    };
    resetButton.addEventListener('click', handleResetButtonClick);
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
    '+': () => mall.setChunking({ radius: (mall.chunkRadius ?? 2) + 1 }),
    '-': () => mall.setChunking({ radius: (mall.chunkRadius ?? 2) - 1 }),
    '[': () => mall.setChunking({ size: (mall.chunkSize ?? 48) - 8 }),
    ']': () => mall.setChunking({ size: (mall.chunkSize ?? 48) + 8 }),
  };

  function handleKeydown(event) {
    const key = event.key;
    const handler = keyHandlers[key.toLowerCase()] || keyHandlers[key];
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

  const onScooterCollide = (event) => {
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
  };
  scooter.body.addEventListener('collide', onScooterCollide);

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

  function syncGraphics(delta) {
    scooter.sync(delta);
    // Let mall know where the player is for chunk streaming
    if (typeof mall.setPlayerLocator === 'function') {
      mall.setPlayerLocator(() => ({ x: scooter.body.position.x, z: scooter.body.position.z }));
    }
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
          if (scoreboard) {
            scoreboard.setMessage('Character packs loaded. Upgrading the mall crowd…', { duration: 4200 });
          }
          if (mall && typeof mall.addPatrons === 'function') {
            // Add a fresh batch of higher-fidelity NPCs now that packs are ready
            mall.addPatrons(14);
          }
        })
        .catch((err) => console.warn('[assets] Failed to load NPC packs:', err))
        .finally(() => { npcPacksLoading = false; });
    }

    renderer.render(scene, camera);
  }

  // Centralized teardown to ensure listeners and DOM are cleaned up before restart
  disposeAll = () => {
    try { window.removeEventListener('keydown', handleKeydown); } catch (_) {}
    try { window.removeEventListener('resize', handleResize); } catch (_) {}
    if (resetButton && handleResetButtonClick) {
      try { resetButton.removeEventListener('click', handleResetButtonClick); } catch (_) {}
    }
    if (spawnPreviewFrameId !== null) {
      try { cancelAnimationFrame(spawnPreviewFrameId); } catch (_) {}
      spawnPreviewFrameId = null;
    }
    try { scooter.body.removeEventListener('collide', onScooterCollide); } catch (_) {}
    try { spawnSelector?.dispose?.(); } catch (_) {}
    try { controls?.dispose?.(); } catch (_) {}
    try { scoreboard?.dispose?.(); } catch (_) {}
    try { gameOverOverlay?.dispose?.(); } catch (_) {}
    try { orbitControls?.dispose?.(); } catch (_) {}
    try { disposeEnvironment?.(); } catch (_) {}
  };

  // Hide loading overlay right before interactive scooter spawn
  setLoadingVisible(false);

  await resetScooter({ interactive: true });
  updateRunTelemetry();
  setTimeout(() => {
    if (!isGameOver) {
      refreshCameraMessage();
    }
  }, 6500);

  window.addEventListener('resize', handleResize);
  // Hand off to centralized loop controller
  createGameLoop({
    clock,
    readInput: () => controls.read(),
    updatePhysics: (delta, input) => updatePhysics(delta, input),
    updateRunTelemetry,
    syncGraphics,
    renderer,
    camera,
    orbitControls,
    isFreeCameraActive: () => cameraMode === 'orbit' && !isSpawnSelectorActive(),
    alignHorizontalAxis,
  }).start();
}

(async () => {
  try {
    await startGame();
  } catch (error) {
    console.error('[Grand Theft Scooter] Failed to start game loop:', error);
  }
})();

// end
