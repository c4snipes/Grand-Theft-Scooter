import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Body,
  ContactMaterial,
  Material,
  Plane as CannonPlane,
  SAPBroadphase,
  Vec3,
  World,
} from 'cannon-es';
import { buildProceduralMallScene } from './proceduralMallScene.js';

// -----------------------------------------------------------------------------
// Assertions and guards
// -----------------------------------------------------------------------------

const WARNED_MESSAGES = new Set();

function buildDetails(context) {
  if (!context) {
    return '';
  }
  if (typeof context === 'string') {
    return ` ${context}`;
  }
  try {
    return ` ${JSON.stringify(context)}`;
  } catch (error) {
    return ` ${String(context)}`;
  }
}

export function invariant(condition, message, context) {
  if (condition) return;
  const error = new Error(`${message}${buildDetails(context)}`);
  error.name = 'InvariantViolation';
  throw error;
}

export function assertDefined(value, message, context) {
  invariant(value !== undefined && value !== null, message, context);
  return value;
}

export function warnOnce(key, message, context) {
  const identifier = key ?? message;
  if (WARNED_MESSAGES.has(identifier)) return;
  WARNED_MESSAGES.add(identifier);
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    if (context !== undefined) {
      console.warn(message, context);
    } else {
      console.warn(message);
    }
  }
}

export function noop() {}

// -----------------------------------------------------------------------------
// Asset loading utilities
// -----------------------------------------------------------------------------

const textureLoader = new TextureLoader();
const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
dracoLoader.setCrossOrigin('anonymous');
dracoLoader.preload();
gltfLoader.setDRACOLoader(dracoLoader);

async function safeLoad(label, loaderFn) {
  try {
    return await loaderFn();
  } catch (error) {
    const hintedSrc = error?.target?.src ?? error?.path?.[0]?.src ?? 'unknown-src';
    console.warn(`[assets] Failed to load ${label} (${hintedSrc}):`, error);
    return null;
  }
}

function isAbsoluteUrl(path) {
  return /^[a-z][a-z0-9+\-.]*:/i.test(path);
}

function getBaseUrl() {
  const rawBase =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    typeof import.meta.env.BASE_URL === 'string'
      ? import.meta.env.BASE_URL
      : '/';
  return rawBase;
}

function normalizeBasePath(base) {
  if (!base) return '/';
  if (isAbsoluteUrl(base)) {
    return base.endsWith('/') ? base : `${base}/`;
  }
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function encodePath(path) {
  const trimmed = path.startsWith('/') ? path.slice(1) : path;
  return trimmed
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function resolveAssetPath(inputPath) {
  if (!inputPath) return '';
  if (isAbsoluteUrl(inputPath)) return inputPath;
  const base = normalizeBasePath(getBaseUrl());
  const encoded = encodePath(inputPath);
  return `${base}${encoded}`;
}

function toFriendlyLabel(fileName) {
  return fileName
    .replace(/\.(glb|gltf)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b([a-z])/g, (_, char) => char.toUpperCase())
    .trim();
}

async function loadNpcPack(labelPrefix, basePath, files) {
  const results = await Promise.all(
    files.map(async (file) => {
      const gltf = await safeLoad(`${labelPrefix} ${file}`, () =>
        gltfLoader.loadAsync(resolveAssetPath(`${basePath}/${file}`))
      );
      if (!gltf) return null;
      return {
        scene: gltf.scene,
        animations: gltf.animations ?? [],
        label: toFriendlyLabel(file),
      };
    })
  );
  return results.filter((item) => item);
}

export async function loadMallAssets() {
  const [
    kioskGltf,
    columnGltf,
    bannerGltf,
    bannerTexture,
    scooterGltf,
    characterBaseGltf,
  ] = await Promise.all([
    safeLoad('mall kiosk model', () =>
      gltfLoader.loadAsync(resolveAssetPath('assets/mall_kiosk.gltf'))
    ),
    safeLoad('column model', () =>
      gltfLoader.loadAsync(resolveAssetPath('assets/mall_column.gltf'))
    ),
    safeLoad('banner model', () =>
      gltfLoader.loadAsync(resolveAssetPath('assets/mall_banner.gltf'))
    ),
    safeLoad('banner texture', () =>
      textureLoader.loadAsync(resolveAssetPath('assets/mall_banner.png'))
    ),
    safeLoad('mobility scooter model', () =>
      gltfLoader.loadAsync(resolveAssetPath('assets/mobility_scooter_animated/scene.gltf'))
    ),
    safeLoad('base npc model', () =>
      gltfLoader.loadAsync(resolveAssetPath('assets/Character Base.gltf'))
    ),
  ]);

  const kioskScene = kioskGltf ? kioskGltf.scene : null;
  const columnScene = columnGltf ? columnGltf.scene : null;
  const bannerScene = bannerGltf ? bannerGltf.scene : null;
  const mallScene = buildProceduralMallScene();
  if (mallScene) {
    mallScene.userData = mallScene.userData ?? {};
    mallScene.userData.isProceduralMall = true;
  }
  const scooterScene = scooterGltf ? scooterGltf.scene : null;
  const characterBaseScene = characterBaseGltf ? characterBaseGltf.scene : null;

  const animatedMenVariants = [];
  const animatedWomenVariants = [];

  if (bannerTexture) {
    bannerTexture.wrapS = RepeatWrapping;
    bannerTexture.wrapT = RepeatWrapping;
    bannerTexture.repeat.set(1, 1);
    bannerTexture.colorSpace = SRGBColorSpace;
  }

  return {
    kioskScene,
    columnScene,
    bannerScene,
    bannerTexture,
    mallScene,
    scooterScene,
    scooterAnimations: scooterGltf ? scooterGltf.animations ?? [] : [],
    characterBaseScene,
    characterBaseAnimations: characterBaseGltf ? characterBaseGltf.animations ?? [] : [],
    animatedMenVariants,
    animatedWomenVariants,
    collisionOnlyMall: false,
    makeKioskInstance() {
      return kioskScene ? kioskScene.clone(true) : null;
    },
    makeColumnInstance() {
      return columnScene ? columnScene.clone(true) : null;
    },
    makeBannerInstance() {
      return bannerScene ? bannerScene.clone(true) : null;
    },
  };
}

export async function loadNpcPacks() {
  const menNpcGltfs = await loadNpcPack('animated men npc', 'assets/Animated Men Pack-glb', [
    'Man.gltf',
    'Man in Suit.gltf',
    'Man in Long Sleeves.gltf',
    'Man-fjHyMd5Wxw.gltf',
  ]);

  const womenNpcGltfs = await loadNpcPack(
    'animated women npc',
    'assets/Ultimate Modular Women Pack-glb',
    [
      'Animated Woman.gltf',
      'Animated Woman-nIItLV9nxS.gltf',
      'Adventurer.gltf',
      'Medieval.gltf',
      'Punk.gltf',
      'Sci Fi Character.gltf',
      'Soldier.gltf',
      'Suit.gltf',
      'Witch.gltf',
      'Worker.gltf',
    ]
  );

  return {
    animatedMenVariants: menNpcGltfs,
    animatedWomenVariants: womenNpcGltfs,
  };
}

// -----------------------------------------------------------------------------
// Physics helpers
// -----------------------------------------------------------------------------

export function createPhysicsWorld() {
  const world = new World({ gravity: new Vec3(0, -9.82, 0) });
  world.allowSleep = true;
  world.broadphase = new SAPBroadphase(world);
  if (world.solver) {
    world.solver.iterations = Math.min(10, Math.max(5, (world.solver.iterations ?? 10) - 3));
    world.solver.tolerance = 0.001;
  }

  const materials = {
    ground: new Material('ground'),
    dynamic: new Material('dynamic'),
    player: new Material('player'),
  };

  world.defaultContactMaterial.friction = 0.45;
  world.defaultContactMaterial.restitution = 0.05;
  world.defaultContactMaterial.contactEquationStiffness = 1.2e7;
  world.defaultContactMaterial.contactEquationRelaxation = 2;

  const groundBody = new Body({
    mass: 0,
    shape: new CannonPlane(),
    material: materials.ground,
  });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  world.addContactMaterial(
    new ContactMaterial(materials.player, materials.ground, {
      friction: 0.65,
      restitution: 0.05,
      contactEquationStiffness: 10000000,
      contactEquationRelaxation: 2,
    })
  );

  world.addContactMaterial(
    new ContactMaterial(materials.dynamic, materials.ground, {
      friction: 0.8,
      restitution: 0.15,
      contactEquationStiffness: 5000000,
      contactEquationRelaxation: 3,
    })
  );

  return { world, materials };
}

export function stepPhysics(world, delta) {
  world.step(1 / 60, delta, 4);
}

// -----------------------------------------------------------------------------
// Environment setup
// -----------------------------------------------------------------------------

export function createEnvironment(canvas, assets = {}, options = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const shadowsEnabled = false;
  renderer.shadowMap.enabled = shadowsEnabled;

  const scene = new Scene();
  scene.background = new Color('#dfe6ef');

  const camera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(50, 28, 50);
  scene.add(camera);

  renderer.domElement.style.cursor = 'grab';
  renderer.domElement.style.touchAction = 'none';

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.target.set(0, 2, 0);
  controls.enabled = false;
  controls.enableKeys = false;
  controls.update();
  controls.addEventListener('start', () => {
    renderer.domElement.style.cursor = 'grabbing';
  });
  controls.addEventListener('end', () => {
    renderer.domElement.style.cursor = 'grab';
  });

  const ambient = new AmbientLight(0xffffff, 0.7);
  scene.add(ambient);

  const ceilingGlow = new HemisphereLight(0xf1f5fd, 0xcfd8e3, 0.6);
  scene.add(ceilingGlow);

  const sun = new DirectionalLight(0xfff5dd, 1.2);
  sun.position.set(12, 24, 10);
  sun.castShadow = shadowsEnabled;
  scene.add(sun);

  const groundMaterial = new MeshStandardMaterial({
    color: '#d1d9e6',
    metalness: 0.02,
    roughness: 0.75,
  });
  let ground = null;

  if (assets.mallScene) {
    const mall = assets.mallScene.clone(true);
    mall.name = 'shopping-mall';
    const characterNamePattern =
      /character|people|person|crowd|npc|male|female|man|woman|boy|girl|standee|cutout|cardboard/;
    mall.traverse((child) => {
      const name = typeof child.name === 'string' ? child.name.toLowerCase() : '';
      if (name && characterNamePattern.test(name)) {
        child.visible = false;
        return;
      }
      if (child.isMesh) {
        child.castShadow = shadowsEnabled;
        child.receiveShadow = shadowsEnabled;
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            if (mat && mat.map) {
              mat.map.colorSpace = mat.map.colorSpace ?? renderer.outputColorSpace;
            }
          });
        } else if (child.material && child.material.map) {
          child.material.map.colorSpace =
            child.material.map.colorSpace ?? renderer.outputColorSpace;
        }
      }
    });
    mall.updateMatrixWorld(true);

    const bounds = new Box3().setFromObject(mall);
    const center = bounds.getCenter(new Vector3());
    const min = bounds.min.clone();
    const groundOffset = ground ? ground.position.y : 0;
    mall.position.set(-center.x, groundOffset - min.y, -center.z);
    mall.updateMatrixWorld(true);
    scene.add(mall);
  }

  const cameraOffset = new Vector3(-6, 5, 9);
  const cameraTarget = new Vector3();
  const desiredCamera = new Vector3();
  const tmpOffset = new Vector3();
  let cameraMode = 'orbit';

  function updateCameraFollow(target) {
    if (cameraMode !== 'follow' || !target) return;
    cameraTarget.copy(target.position);
    tmpOffset.copy(cameraOffset).applyQuaternion(target.quaternion);
    desiredCamera.copy(target.position).add(tmpOffset);
    camera.position.lerp(desiredCamera, 0.15);
    camera.lookAt(cameraTarget);
  }

  function handleResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  const palettes = {
    light: {
      background: '#dfe6ef',
      ambientColor: '#ffffff',
      ambientIntensity: 0.7,
      hemisphereSky: '#f3f7fe',
      hemisphereGround: '#c9d6e6',
      hemisphereIntensity: 0.6,
      sunColor: '#fff3db',
      sunIntensity: 1.2,
      groundColor: '#d1d9e6',
    },
    dark: {
      background: '#0b1014',
      ambientColor: '#1d2939',
      ambientIntensity: 0.6,
      hemisphereSky: '#1e293b',
      hemisphereGround: '#0b1014',
      hemisphereIntensity: 0.32,
      sunColor: '#94a3b8',
      sunIntensity: 0.85,
      groundColor: '#111c27',
    },
  };

  let currentPalette = palettes.light;
  function applyPalette(palette) {
    scene.background.set(palette.background);
    ambient.color.set(palette.ambientColor);
    ambient.intensity = palette.ambientIntensity;
    ceilingGlow.color.set(palette.hemisphereSky);
    ceilingGlow.groundColor.set(palette.hemisphereGround);
    ceilingGlow.intensity = palette.hemisphereIntensity;
    sun.color.set(palette.sunColor);
    sun.intensity = palette.sunIntensity;

    if (ground) {
      groundMaterial.color.set(palette.groundColor);
      groundMaterial.needsUpdate = true;
    }
  }

  function setColorMode(mode) {
    const nextPalette = palettes[mode] ?? palettes.light;
    currentPalette = nextPalette;
    applyPalette(currentPalette);
  }

  function setCameraMode(mode) {
    cameraMode = mode === 'follow' ? 'follow' : 'orbit';
    controls.enabled = cameraMode === 'orbit';
    if (controls.enabled) {
      controls.update();
    }
    camera.far = cameraMode === 'orbit' ? 3000 : 2000;
    camera.updateProjectionMatrix();
  }

  function updateCamera(target) {
    if (cameraMode === 'orbit') {
      controls.update();
    } else {
      updateCameraFollow(target);
    }
  }

  return {
    renderer,
    scene,
    camera,
    ground,
    setCameraMode,
    updateCamera,
    updateCameraFollow,
    handleResize,
    controls,
    setColorMode,
    dispose: () => {
      try {
        controls?.dispose?.();
      } catch (_) {}
    },
  };
}

// -----------------------------------------------------------------------------
// Collision constants
// -----------------------------------------------------------------------------

export const CollisionType = {
  HUMAN: 'human',
  METAL: 'metal',
  DEFAULT: 'default',
  WOOD: 'wood',
  PLASTIC: 'plastic',
};

export const TARGET_COLLISION_TYPES = {
  'Mall Patron': CollisionType.HUMAN,
  'Security Guard': CollisionType.HUMAN,
  'Store Employee': CollisionType.HUMAN,
  Janitor: CollisionType.HUMAN,
  'Mall Manager': CollisionType.HUMAN,
  'Mall Santa': CollisionType.HUMAN,
  'Mime Artist': CollisionType.HUMAN,
  'Street Performer': CollisionType.HUMAN,
  'Mall Kiosk': CollisionType.METAL,
  'Vending Machine': CollisionType.METAL,
  ATM: CollisionType.METAL,
  'Shopping Cart': CollisionType.METAL,
  'Trash Can': CollisionType.METAL,
  Bench: CollisionType.WOOD,
  'Poster Stand': CollisionType.WOOD,
  'Box Stack': CollisionType.DEFAULT,
  Planter: CollisionType.DEFAULT,
  'Flower Pot': CollisionType.DEFAULT,
  default: CollisionType.DEFAULT,
};

export function getCollisionType(targetLabel) {
  return TARGET_COLLISION_TYPES[targetLabel] || CollisionType.DEFAULT;
}

export const PHYSICS_DAMPING = {
  [CollisionType.HUMAN]: {
    angular: 0.8,
    linear: 0.6,
  },
  [CollisionType.METAL]: {
    angular: 0.9,
    linear: 0.75,
  },
  [CollisionType.WOOD]: {
    angular: 0.7,
    linear: 0.5,
  },
  [CollisionType.DEFAULT]: {
    angular: 0.6,
    linear: 0.4,
  },
};

export function getDampingValues(collisionType) {
  return PHYSICS_DAMPING[collisionType] || PHYSICS_DAMPING[CollisionType.DEFAULT];
}

// -----------------------------------------------------------------------------
// Game loop
// -----------------------------------------------------------------------------

export function createGameLoop({
  clock,
  readInput,
  updatePhysics,
  updateRunTelemetry,
  syncGraphics,
  renderer,
  camera,
  orbitControls,
  isFreeCameraActive,
  alignHorizontalAxis,
}) {
  const cameraForward = new Vector3();
  const cameraRight = new Vector3();
  const cameraMove = new Vector3();
  const worldUp = new Vector3(0, 1, 0);

  const basePixelRatio = Math.min(window.devicePixelRatio, 1.5);
  let dynamicPixelRatio = basePixelRatio;
  let fpsEMA = 60;

  const FREECAM_KEYBOARD_ENABLED = false;
  function updateFreeCameraMovement(delta, input) {
    if (!isFreeCameraActive() || !FREECAM_KEYBOARD_ENABLED) return;
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

  function updateDynamicResolution(delta) {
    const fps = delta > 0 ? 1 / delta : 60;
    fpsEMA = fpsEMA * 0.9 + fps * 0.1;
    let nextPR = dynamicPixelRatio;
    if (fpsEMA < 40 && dynamicPixelRatio > 1.0) {
      nextPR = Math.max(1.0, dynamicPixelRatio - 0.1);
    } else if (fpsEMA > 58 && dynamicPixelRatio < basePixelRatio) {
      nextPR = Math.min(basePixelRatio, dynamicPixelRatio + 0.1);
    }
    if (Math.abs(nextPR - dynamicPixelRatio) > 0.05) {
      dynamicPixelRatio = nextPR;
      renderer.setPixelRatio(dynamicPixelRatio);
    }
  }

  function frame() {
    const delta = clock.getDelta();
    const input = readInput();
    updatePhysics(delta, input);
    updateFreeCameraMovement(delta, input);
    updateRunTelemetry();
    updateDynamicResolution(delta);
    syncGraphics(delta);
    requestAnimationFrame(frame);
  }

  return { start: () => requestAnimationFrame(frame) };
}

// -----------------------------------------------------------------------------
// Scoring system
// -----------------------------------------------------------------------------

export class ScoringSystem {
  constructor(options = {}) {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lastHitTime = 0;
    this.comboTimeWindow = options.comboTimeWindow || 2500;
    this.speedBonusThreshold = 8;
    this.multiplierLevels = options.multiplierLevels || [1, 1.15, 1.35, 1.6, 1.9, 2.2];
    this.totalHits = 0;
    this.consecutiveHits = 0;
    this.lastHitType = null;
    this.maxScorePerHit = options.maxScorePerHit || 15000;

    this.basePoints = {
      Planter: 40,
      Bench: 55,
      'Mall Kiosk': 120,
      'Trash Can': 35,
      'Poster Stand': 30,
      'Box Stack': 25,
      'Food Cart': 80,
      'Vending Machine': 90,
      'Shopping Cart': 45,
      'Display Stand': 60,
      'Flower Pot': 35,
      'Newspaper Stand': 40,
      ATM: 150,
      'Phone Booth': 100,
      'Mall Patron': 1600,
      'Security Guard': 2000,
      'Store Employee': 1400,
      Janitor: 1200,
      'Mall Manager': 2500,
      'Mall Santa': 5000,
      'Mime Artist': 3000,
      'Street Performer': 2200,
    };

    this.speedBonusMultipliers = {
      slow: 1.0,
      medium: 1.15,
      fast: 1.35,
      extreme: 1.6,
    };

    this.callbacks = {
      onScoreUpdate: null,
      onComboUpdate: null,
      onSpecialBonus: null,
    };
  }

  setCallbacks({ onScoreUpdate, onComboUpdate, onSpecialBonus }) {
    if (onScoreUpdate) this.callbacks.onScoreUpdate = onScoreUpdate;
    if (onComboUpdate) this.callbacks.onComboUpdate = onComboUpdate;
    if (onSpecialBonus) this.callbacks.onSpecialBonus = onSpecialBonus;
  }

  getSpeedBonus(speed) {
    if (speed < this.speedBonusThreshold) return this.speedBonusMultipliers.slow;
    if (speed < 15) return this.speedBonusMultipliers.medium;
    if (speed < 25) return this.speedBonusMultipliers.fast;
    return this.speedBonusMultipliers.extreme;
  }

  getComboMultiplier() {
    const index = Math.min(this.combo, this.multiplierLevels.length - 1);
    return this.multiplierLevels[index];
  }

  updateCombo(currentTime) {
    if (currentTime - this.lastHitTime > this.comboTimeWindow) {
      if (this.combo > 0) {
        this.combo = 0;
        this.consecutiveHits = 0;
        if (this.callbacks.onComboUpdate) {
          this.callbacks.onComboUpdate(this.combo, false);
        }
      }
    }
  }

  awardPoints(targetLabel, speed = 0, currentTime = performance.now()) {
    this.updateCombo(currentTime);

    const basePoints = this.basePoints[targetLabel] || 50;
    const speedBonus = this.getSpeedBonus(speed);
    const comboMultiplier = this.getComboMultiplier();

    let finalPoints = Math.floor(basePoints * speedBonus * comboMultiplier);

    if (this.lastHitType === targetLabel && this.consecutiveHits >= 2) {
      finalPoints = Math.floor(finalPoints * 1.2);
    }

    finalPoints = Math.min(finalPoints, this.maxScorePerHit);

    const bonusInfo = this.checkSpecialBonuses(targetLabel, speed, currentTime);
    if (bonusInfo.bonus > 0) {
      finalPoints += bonusInfo.bonus;
      if (this.callbacks.onSpecialBonus) {
        this.callbacks.onSpecialBonus(bonusInfo.message, bonusInfo.bonus);
      }
    }

    this.combo++;
    this.totalHits++;
    this.lastHitTime = currentTime;

    if (this.lastHitType === targetLabel) {
      this.consecutiveHits++;
    } else {
      this.consecutiveHits = 1;
      this.lastHitType = targetLabel;
    }

    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }

    this.score += finalPoints;

    this.playScoringSounds(finalPoints, this.combo);

    if (this.callbacks.onScoreUpdate) {
      this.callbacks.onScoreUpdate(this.score, finalPoints, {
        basePoints,
        speedBonus,
        comboMultiplier,
        targetLabel,
        speed,
      });
    }

    if (this.callbacks.onComboUpdate) {
      this.callbacks.onComboUpdate(this.combo, true);
    }

    return {
      points: finalPoints,
      breakdown: {
        base: basePoints,
        speedMultiplier: speedBonus,
        comboMultiplier,
        specialBonus: bonusInfo.bonus,
      },
    };
  }

  checkSpecialBonuses(targetLabel, speed, currentTime) {
    let bonus = 0;
    let message = '';

    if (speed > 20) {
      bonus += 200;
      message = 'SPEED DEMON!';
    }

    if (this.combo > 0 && this.combo % 10 === 0) {
      bonus += this.combo * 50;
      message = `${this.combo}X COMBO MASTER!`;
    }

    const rareTargets = ['Mall Santa', 'Mime Artist', 'Street Performer', 'Mall Manager'];
    if (rareTargets.includes(targetLabel)) {
      bonus += 1000;
      message = `RARE TARGET BONUS!`;
    }

    if (currentTime - this.lastHitTime < 500 && this.combo >= 3) {
      bonus += 300;
      message = 'RAPID FIRE!';
    }

    return { bonus, message };
  }

  playScoringSounds() {}

  getStats() {
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      totalHits: this.totalHits,
      averagePointsPerHit: this.totalHits > 0 ? Math.floor(this.score / this.totalHits) : 0,
      comboMultiplier: this.getComboMultiplier(),
    };
  }

  reset() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.totalHits = 0;
    this.consecutiveHits = 0;
    this.lastHitTime = 0;
    this.lastHitType = null;
  }

  getFormattedScore() {
    return this.score.toLocaleString();
  }

  getComboDisplay() {
    if (this.combo < 2) return '';
    return `${this.combo}x COMBO!`;
  }

  calculatePotentialPoints(targetLabel, speed = 0) {
    const basePoints = this.basePoints[targetLabel] || 50;
    const speedBonus = this.getSpeedBonus(speed);
    const comboMultiplier = this.getComboMultiplier();

    return Math.floor(basePoints * speedBonus * comboMultiplier);
  }

  dispose() {
    this.callbacks = {
      onScoreUpdate: null,
      onComboUpdate: null,
      onSpecialBonus: null,
    };

    this.reset();
  }
}

export const scoringSystem = new ScoringSystem({
  comboTimeWindow: 2500,
  multiplierLevels: [1, 1.15, 1.35, 1.6, 1.9, 2.2],
  maxScorePerHit: 15000,
});
