import { Clock, Vector3, Raycaster, Box3 } from "three";
import { Body, Box as CannonBox, Vec3 } from "cannon-es";

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
import { audioManager } from './core/audio';
import { scoringSystem } from './systems/scoring';
import { getCollisionType } from './constants/collisionTypes';
import { performanceMonitor } from './debug/performanceMonitor';

// UI Message Templates
const UI_MESSAGES = {
  CAMERA_FOLLOW: (controlScheme) => {
    const schemeLabel = controlScheme === 'arrows' ? 'the arrow keys' : 'WASD';
    return `Follow cam active. Use ${schemeLabel} to drive the scooter. Press C for a free camera (mouse only), R to reposition your ride, Esc for settings.`;
  },
  CAMERA_FREE: 'Free camera active. Drag to look around, scroll to zoom. Press C to get back on the scooter, R to reposition your ride, Esc for settings.',
  GAME_READY: 'Ready to roll! Hit the gas and see how much chaos you can cause.',
  SPAWN_SELECT: 'Click to choose spawn location, or press Enter to confirm current position.',
};

function updateHudHints(layout) {
  const accelerateEl = document.querySelector("[data-hint-accelerate]");
  const steerEl = document.querySelector("[data-hint-steer]");
  const brakeEl = document.querySelector("[data-hint-brake]");

  if (!accelerateEl || !steerEl || !brakeEl) return;

  if (layout === "arrows") {
    accelerateEl.textContent = "Tap ↑ to accelerate";
    steerEl.textContent = "Steer with ← / →";
    brakeEl.textContent = "Hold ↓ to brake or back up";
    return;
  }

  if (layout === "wasd") {
    accelerateEl.textContent = "Tap W to accelerate";
    steerEl.textContent = "Steer with A / D";
    brakeEl.textContent = "Hold S to brake or back up";
    return;
  }

  accelerateEl.textContent = "Tap W or ↑ to accelerate";
  steerEl.textContent = "Steer with A / D or the arrow keys";
  brakeEl.textContent = "Hold S or ↓ to brake or back up";
}

async function startGame(canvas) {
  assertDefined(canvas, 'Expected to find a canvas with id="app".');

  let scoreboard = null;
  let cameraMode = "follow";
  let activeLayout = "wasd";
  let applyEnvironmentTheme = () => { };
  let isGameOver = false;
  let spawnSelector = null;

  // Small loading overlay is visible by default; hide once assets + scene are ready
  const loadingEl = document.querySelector("[data-loading]");
  function setLoadingVisible(visible) {
    if (!loadingEl) return;
    loadingEl.hidden = !visible;
  }

  const isSpawnSelectorActive = () => Boolean(spawnSelector?.isActive?.());

  function refreshCameraMessage() {
    if (!scoreboard || isGameOver) return;
    if (isSpawnSelectorActive()) return;

    const message = cameraMode === 'orbit'
      ? UI_MESSAGES.CAMERA_FREE
      : UI_MESSAGES.CAMERA_FOLLOW(activeLayout);

    scoreboard.setMessage(message, { duration: 4200 });
  }

  // Camera sensitivity function (defined early so it's available for settings manager)
  let orbitControls = null; // Will be set after environment creation
  function applyCameraSensitivity(mode) {
    if (!orbitControls) return;

    const sensitivityMap = {
      low: { rotate: 0.3, zoom: 0.5, pan: 0.5 },
      normal: { rotate: 0.5, zoom: 1.0, pan: 1.0 },
      high: { rotate: 0.8, zoom: 1.5, pan: 1.5 }
    };

    const settings = sensitivityMap[mode] || sensitivityMap.normal;
    orbitControls.rotateSpeed = settings.rotate;
    orbitControls.zoomSpeed = settings.zoom;
    orbitControls.panSpeed = settings.pan;
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
      try {
        setShadows?.(!!g?.shadows);
      } catch (_) { }
    },
    onDebugChange: (enabled) => {
      try {
        window.DEBUG_SPAWN = !!enabled;
        debug.setEnabled(!!enabled);
        console.info(
          "[debug] markers",
          enabled ? "enabled" : "disabled",
          "(via Settings)"
        );
      } catch (_) { }
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
    controls,
    setColorMode,
    setShadowsEnabled,
    dispose: disposeEnvironment,
  } = createEnvironment(canvas, assets, { theme: settings.getTheme() });

  // Set the orbit controls for camera sensitivity
  orbitControls = controls;
  invariant(
    renderer && typeof renderer.render === 'function',
    'createEnvironment must supply a renderer with render().'
  );
  invariant(
    scene && typeof scene.add === 'function',
    'createEnvironment must supply a valid scene.'
  );
  invariant(
    camera && typeof camera.isCamera === 'boolean',
    'createEnvironment must supply a THREE camera.'
  );
  // Apply camera sensitivity based on user setting
  try {
    applyCameraSensitivity(settings.getCameraSensitivity?.() || 'normal');
  } catch (error) {
    console.warn('[Camera] Failed to apply camera sensitivity:', error);
  }

  invariant(
    typeof setCameraMode === "function",
    "createEnvironment must supply setCameraMode()."
  );
  invariant(
    typeof updateCamera === "function",
    "createEnvironment must supply updateCamera()."
  );
  invariant(
    typeof handleResize === "function",
    "createEnvironment must supply handleResize()."
  );
  invariant(
    orbitControls && typeof orbitControls.update === "function",
    "createEnvironment must supply orbit controls with update()."
  );
  invariant(
    typeof setColorMode === "function",
    "createEnvironment must supply setColorMode()."
  );
  applyEnvironmentTheme = setColorMode;
  applyEnvironmentTheme(settings.getTheme());
  const setShadows = setShadowsEnabled;
  try {
    setShadows?.(!!settings.getShadowsEnabled?.());
  } catch (_) { }

  // Camera sensitivity function (moved here after orbitControls is created)
  function applyCameraSensitivity(mode) {
    if (!orbitControls) return;

    const sensitivityMap = {
      low: { rotate: 0.3, zoom: 0.5, pan: 0.5 },
      normal: { rotate: 0.5, zoom: 1.0, pan: 1.0 },
      high: { rotate: 0.8, zoom: 1.5, pan: 1.5 },
    };

    const settings = sensitivityMap[mode] || sensitivityMap.normal;
    orbitControls.rotateSpeed = settings.rotate;
    orbitControls.zoomSpeed = settings.zoom;
    orbitControls.panSpeed = settings.pan;
  }

  // Apply camera sensitivity based on user setting
  try {
    applyCameraSensitivity(settings.getCameraSensitivity?.() || "normal");
  } catch (_) { }

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
      console.info(
        "[debug] markers",
        window.DEBUG_SPAWN ? "enabled" : "disabled"
      );
    };
    // Debug keydown handler will be consolidated with main handler below
  } catch (_) { }

  // Determine mall floor height under a given (x,z) so we can spawn above it
  const floorRaycaster = new Raycaster();
  const floorRayStart = new Vector3();
  const floorRayDir = new Vector3(0, -1, 0);
  function getMallFloorYAt(x, z) {
    const mallObj = scene.getObjectByName("shopping-mall");
    if (!mallObj) return 0;
    floorRayStart.set(x, 1000, z);
    floorRaycaster.set(floorRayStart, floorRayDir);
    const hits = floorRaycaster.intersectObject(mallObj, true);
    if (Array.isArray(hits) && hits.length > 0) {
      const y = hits[0].point.y;
      if (window.DEBUG_SPAWN) {
        try {
          debug.setFloorHit(x, y, z);
        } catch (_) { }
      }
      return y;
    }
    return 0;
  }

  // Dynamic resolution scaling knobs are handled in the loop module

  const { world, materials } = createPhysicsWorld();
  const keyboardControls = createKeyboardControls(activeLayout);
  controls = keyboardControls;
  scoreboard = createScoreboard();
  invariant(
    scoreboard &&
    typeof scoreboard.updateTelemetry === "function" &&
    typeof scoreboard.setMessage === "function" &&
    typeof scoreboard.toggleDashboard === "function",
    "createScoreboard must return an object with updateTelemetry(), setMessage(), and toggleDashboard()."
  );
  invariant(
    controls && typeof controls.setLayout === "function",
    "createKeyboardControls must provide setLayout()."
  );
  scoreboard.updateTelemetry({
    speed: 0,
    topSpeed: 0,
    hits: 0,
    hazards: 0,
    runtime: 0,
    status: "Ready",
  });

  const resetButton = document.querySelector("[data-reset]");
  let disposeAll = () => { };
  const gameOverOverlay = createGameOverOverlay(() => {
    try {
      disposeAll();
    } catch (_) { }
    window.location.reload();
  });
  invariant(
    gameOverOverlay && typeof gameOverOverlay.show === "function",
    "createGameOverOverlay must provide show()."
  );

  const scooter = createScooter(world, materials.player, assets);
  scene.add(scooter.mesh);
  scooter.sync(0);
  setCameraMode(cameraMode);

  const mall = createMall(world, scene, assets, materials);
  invariant(
    mall &&
    typeof mall.populate === "function" &&
    typeof mall.handleCollision === "function" &&
    typeof mall.findNearestNavigablePoint === "function",
    "createMall must return an object supporting populate(), handleCollision(), and findNearestNavigablePoint()."
  );
  mall.populate({ mode: assets.mallScene ? "static" : "default" });
  updateHudHints(activeLayout);

  // Add a large invisible physics floor aligned to the mall's visual floor so the scooter doesn't fall through
  try {
    const mallObj = scene.getObjectByName("shopping-mall");
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
      if (window.DEBUG_SPAWN) {
        try {
          debug.showFloorSlab({
            x: 0,
            y: floorY + slabHeight / 2,
            z: 0,
            hx: halfX,
            hy: slabHeight / 2,
            hz: halfZ,
          });
        } catch (_) { }
      }
    }
  } catch (e) {
    console.warn("[physics] Failed to add mall physics floor:", e);
  }

  let SCOOTER_SPAWN_HEIGHT = 0.45;
  const spawnPoint = new Vec3(0, SCOOTER_SPAWN_HEIGHT, 0);
  const spawnQuaternion = { x: 0, y: 0, z: 0, w: 1 };
  // Align spawn height to the actual physics half-height once the scooter is built
  try {
    const halfY = scooter?.body?.shapes?.[0]?.halfExtents?.y;
    if (typeof halfY === "number" && isFinite(halfY)) {
      SCOOTER_SPAWN_HEIGHT = Math.max(0.2, halfY + 0.05);
      spawnPoint.y = SCOOTER_SPAWN_HEIGHT;
    }
  } catch (_) {
    /* non-fatal */
  }
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

    // Enhanced drive force with speed-dependent scaling
    const currentSpeed = scooter.body.velocity.length();
    const speedFactor = Math.max(0.3, 1 - (currentSpeed / 30)); // Reduce force at high speeds
    const driveForce = 90 * drive * speedFactor; // Increased base force

    tmpForce.copy(forwardVector).scale(driveForce);
    scooter.body.applyForce(tmpForce, scooter.body.position);
  }

  function applySteering(steer, delta) {
    if (steer === 0) return;

    // Enhanced steering with speed-dependent responsiveness
    const currentSpeed = scooter.body.velocity.length();
    const speedFactor = Math.min(1.5, Math.max(0.5, currentSpeed / 10)); // More responsive at speed
    const steerForce = steer * delta * 6.5 * speedFactor; // Increased base steering

    scooter.body.angularVelocity.y -= steerForce;

    // Add slight lateral force for more realistic turning
    if (currentSpeed > 2) {
      const rightVector = new Vec3();
      scooter.body.quaternion.vmult(new Vec3(1, 0, 0), rightVector);
      const lateralForce = rightVector.scale(steer * currentSpeed * 8);
      scooter.body.applyForce(lateralForce, scooter.body.position);
    }
  }

  const runStats = {
    hits: 0,
    hazards: 0,
    topSpeed: 0,
    startTime: performance.now(),
    endTime: null,
  };

  // Initialize audio system
  let audioInitialized = false;
  async function initializeAudio() {
    if (!audioInitialized) {
      await audioManager.initialize();
      audioInitialized = true;

      // Setup scoring system callbacks
      scoringSystem.setCallbacks({
        onScoreUpdate: (score, points, breakdown) => {
          scoreboard.updateTelemetry({ score });
          scoreboard.setMessage(`+${points} ${breakdown.targetLabel}`, { duration: 1500 });
        },
        onComboUpdate: (combo, increased) => {
          if (increased && combo >= 3) {
            scoreboard.setMessage(`${combo}x COMBO!`, { duration: 1200 });
          }
        },
        onSpecialBonus: (message, bonus) => {
          scoreboard.setMessage(`${message} +${bonus}`, { duration: 2000 });
        }
      });
    }
  }
  let currentSpeed = 0;
  let npcPacksLoading = false;

  let resetInProgress = false;
  const scoreboardTagline =
    "Chase points by bowling over mall patrons riding the new character models, but colliding with security gates, maintenance barriers, cleaning robots, or the mall walls will end the run instantly.";

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
    const elapsedMs =
      isGameOver && runStats.endTime
        ? runStats.endTime - runStats.startTime
        : now - runStats.startTime;
    scoreboard.updateTelemetry({
      speed: currentSpeed,
      topSpeed: runStats.topSpeed,
      hits: runStats.hits,
      hazards: runStats.hazards,
      runtime: elapsedMs / 1000,
      status: isGameOver ? "Downed" : "Rolling",
    });
  }

  async function resetScooter({ interactive = true } = {}) {
    if (isGameOver || resetInProgress) return;
    resetInProgress = true;
    try {
      const previous = new Vector3(spawnPoint.x, 0, spawnPoint.z);
      let target = mall.findNearestNavigablePoint(previous, 3.6, {
        ignoreBodies: [scooter.body],
      });

      if (interactive) {
        // Lock UI so settings cannot be opened/changed during spawn selection
        try {
          document.documentElement.classList.add("ui-locked");
        } catch (_) { }
        try {
          settings.close?.();
        } catch (_) { }

        // Let the user orbit/pan/zoom the camera while choosing spawn
        const prevCameraMode = cameraMode;
        if (prevCameraMode !== "orbit") {
          cameraMode = "orbit";
          setCameraMode(cameraMode);
        }

        scoreboard.setMessage(
          "Click the floor to deploy your scooter. Press Enter to confirm or Esc to use the suggested spot.",
          { duration: 0 }
        );
        spawnPreviewActive = true;
        renderSpawnPreview();
        try {
          target = await spawnSelector.pick(target);
        } finally {
          spawnPreviewActive = false;
          if (spawnPreviewFrameId !== null) {
            try {
              document.documentElement.classList.remove("ui-locked");
            } catch (_) { }

            cancelAnimationFrame(spawnPreviewFrameId);
            spawnPreviewFrameId = null;
          }
          if (scoreboard) {
            scoreboard.clearMessage();
          }
        }
      }

      const safe = mall.findNearestNavigablePoint(target, 3.6, {
        ignoreBodies: [scooter.body],
      });
      const halfY =
        scooter?.body?.shapes?.[0]?.halfExtents?.y ??
        SCOOTER_SPAWN_HEIGHT - 0.05;
      const floorY = getMallFloorYAt(safe.x, safe.z);
      const spawnY = Math.max(
        SCOOTER_SPAWN_HEIGHT,
        (floorY || 0) + halfY + 0.05
      );
      if (window.DEBUG_SPAWN) {
        console.debug(
          "[spawn] floorY:",
          floorY?.toFixed?.(3),
          "halfY:",
          halfY?.toFixed?.(3),
          "spawnY:",
          spawnY?.toFixed?.(3)
        );
      }
      spawnPoint.set(safe.x, spawnY, safe.z);
      scooter.body.velocity.set(0, 0, 0);
      scooter.body.angularVelocity.set(0, 0, 0);
      scooter.body.position.set(spawnPoint.x, spawnPoint.y, spawnPoint.z);
      scooter.body.quaternion.set(
        spawnQuaternion.x,
        spawnQuaternion.y,
        spawnQuaternion.z,
        spawnQuaternion.w
      );
      scooter.sync(0);
      if (window.DEBUG_SPAWN) {
        try {
          debug.setSpawnMarker(spawnPoint.x, spawnPoint.y, spawnPoint.z);
        } catch (_) { }
      }
      try {
        scooter.body.wakeUp?.();
      } catch (_) { }
      orbitControls.target.copy(scooter.mesh.position);
      orbitControls.update();
      if (cameraMode !== "follow") {
        cameraMode = "follow";
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
        status: "Rolling",
      });
      scoreboard.setMessage(scoreboardTagline, { duration: 6400 });
    } finally {
      resetInProgress = false;
    }
  }

  function queueReset(options = {}) {
    resetScooter(options).catch((error) => {
      console.error("[Grand Theft Scooter] Failed to reset scooter:", error);
    });
  }

  let handleResetButtonClick = null;
  if (resetButton) {
    handleResetButtonClick = (event) => {
      event.preventDefault();
      queueReset({ interactive: true });
    };
    resetButton.addEventListener("click", handleResetButtonClick);
  }

  function handleCameraModeToggle() {
    if (isGameOver || isSpawnSelectorActive()) return;
    cameraMode = cameraMode === "orbit" ? "follow" : "orbit";
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
      visible
        ? "Telemetry open. Press I to hide."
        : "Telemetry hidden. Press I to view stats.",
      { duration: 2600 }
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
    'F9': (event) => {
      event.preventDefault?.();
      try { window.toggleDebugMarkers?.(); } catch (_) { }
    },
  };

  async function handleKeydown(event) {
    const key = event.key;
    const handler = keyHandlers[key.toLowerCase()] || keyHandlers[key];
    if (!handler) return;
    handler(event);
  }

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
    gameOverOverlay.show(runStats);
  }

  const onScooterCollide = (event) => {
    const hit = mall.handleCollision(event.body, scooter.body);
    if (!hit || isGameOver) return;

    if (hit.kind === 'fatal') {
      // Play crash sound
      audioManager.playCollisionSound(1.0, 'metal');
      triggerGameOver(hit.label);
      return;
    }

    if (hit.kind === 'score') {
      runStats.hits += 1;

      // Use enhanced scoring system
      const currentSpeed = scooter.body.velocity.length();
      const scoreResult = scoringSystem.awardPoints(hit.label, currentSpeed);

      // Play collision sound based on target type (optimized with type flags)
      const soundType = getCollisionType(hit.label);
      const intensity = Math.min(1.0, currentSpeed / 15);
      audioManager.playCollisionSound(intensity, soundType);

      // Monitor performance improvements
      performanceMonitor.recordCollision(hit.label, {
        angularDamping: hit.body?.angularDamping || 0,
        linearDamping: hit.body?.linearDamping || 0
      });

      // Update scoreboard with new scoring system
      scoreboard.updateTelemetry({
        hits: runStats.hits,
        score: scoringSystem.getStats().score
      });
    }
  };
  scooter.body.addEventListener('collide', onScooterCollide);

  function updatePhysics(delta, input) {
    if (!isGameOver && input) {
      const { drive, steer } = input;
      applyDriveForce(drive);
      applySteering(steer, delta);

      // Update engine sound based on throttle and speed
      if (audioInitialized) {
        const throttle = Math.abs(drive);
        audioManager.updateEngineSound(currentSpeed, throttle);
      }
    }

    stepPhysics(world, delta);
    currentSpeed = scooter.body.velocity.length();
    if (currentSpeed > runStats.topSpeed) {
      runStats.topSpeed = currentSpeed;
    }

    // Update scoring system combo timer
    scoringSystem.updateCombo(performance.now());
  }

    

  function syncGraphics(delta) {
    scooter.sync(delta);
    // Let mall know where the player is for chunk streaming
    if (typeof mall.setPlayerLocator === "function") {
      mall.setPlayerLocator(() => ({
        x: scooter.body.position.x,
        z: scooter.body.position.z,
      }));
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
        })
        .then(() => {
          try {
            if (mall && typeof mall.addPatrons === "function") {
              // Add a fresh batch of higher-fidelity NPCs now that packs are ready
              mall.addPatrons(14);
            }
          } finally {
            npcPacksLoading = false;
          }
        })
        .catch((error) => {
          console.error("[NPC] Failed to load NPC packs:", error);
          npcPacksLoading = false;
        });
    }

    renderer.render(scene, camera);
  }

  // Centralized teardown to ensure listeners and DOM are cleaned up before restart
  disposeAll = () => {
    try {
      window.removeEventListener("keydown", handleKeydown);
    } catch (_) { }
    try {
      window.removeEventListener("resize", handleResize);
    } catch (_) { }
    if (resetButton && handleResetButtonClick) {
      try {
        resetButton.removeEventListener("click", handleResetButtonClick);
      } catch (_) { }
    }
    if (spawnPreviewFrameId !== null) {
      try {
        cancelAnimationFrame(spawnPreviewFrameId);
      } catch (_) { }
      spawnPreviewFrameId = null;
    }
    try {
      scooter.body.removeEventListener("collide", onScooterCollide);
    } catch (_) { }
    try {
      spawnSelector?.dispose?.();
    } catch (_) { }
    try {
      controls?.dispose?.();
    } catch (_) { }
    try {
      scoreboard?.dispose?.();
    } catch (_) { }
    try {
      gameOverOverlay?.dispose?.();
    } catch (_) { }
    try {
      orbitControls?.dispose?.();
    } catch (_) { }
    try {
      audioManager?.dispose?.();
    } catch (_) { }
    try {
      scoringSystem?.dispose?.();
    } catch (_) { }
    try {
      disposeEnvironment?.();
    } catch (_) { }
  };


  // Check if mall is loaded and hide loading overlay
  const mallObj = scene.getObjectByName("shopping-mall");
  if (mallObj) {
    setLoadingVisible(false);
  } else {
    setLoadingVisible(true);
    try {
      const loadingEl = document.querySelector("[data-loading]");
      if (loadingEl)
        loadingEl.textContent =
          "Mall model not loaded yet… check assets/shopping_mall/scene.gltf";
      console.warn(
        "[startup] Mall model missing from scene; leaving loading overlay visible."
      );
    } catch (_) { }
  }

  await resetScooter({ interactive: true });
  updateRunTelemetry();
  setTimeout(() => {
    if (!isGameOver) {
      refreshCameraMessage();
    }
  }, 6500);

  window.addEventListener("resize", handleResize);
  window.addEventListener("keydown", handleKeydown);
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
    isFreeCameraActive: () =>
      cameraMode === "orbit" && !isSpawnSelectorActive(),
    alignHorizontalAxis,
  }).start();
  

  window.addEventListener("keydown", handleKeydown);
}  try {
    disposeEnvironment?.();
  } catch (_) { }
  ;
}