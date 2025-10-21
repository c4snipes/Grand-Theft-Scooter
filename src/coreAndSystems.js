import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  RepeatWrapping,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Body,
  ContactMaterial,
  Material,
  Plane as CannonPlane,
  SAPBroadphase,
  Vec3,
  World,
} from "cannon-es";

// -----------------------------------------------------------------------------
// Assertions and guards
// -----------------------------------------------------------------------------

const WARNED_MESSAGES = new Set();

function buildDetails(context) {
  if (!context) {
    return "";
  }
  if (typeof context === "string") {
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
  error.name = "InvariantViolation";
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
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    if (context !== undefined) {
      console.warn(message, context);
    } else {
      console.warn(message);
    }
  }
}

export function noop() { }

// -----------------------------------------------------------------------------
// Asset loading utilities
// -----------------------------------------------------------------------------

const textureLoader = new TextureLoader();
const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
dracoLoader.setCrossOrigin("anonymous");
dracoLoader.preload();
gltfLoader.setDRACOLoader(dracoLoader);

async function safeLoad(label, loaderFn) {
  try {
    return await loaderFn();
  } catch (error) {
    const hintedSrc = error?.target?.src ?? error?.path?.[0]?.src ?? "unknown-src";
    console.warn(`[assets] Failed to load ${label} (${hintedSrc}):`, error);
    return null;
  }
}

function isAbsoluteUrl(path) {
  return /^[a-z][a-z0-9+\-.]*:/i.test(path);
}

function getBaseUrl() {
  const rawBase =
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    typeof import.meta.env.BASE_URL === "string"
      ? import.meta.env.BASE_URL
      : "/";
  return rawBase;
}

function normalizeBasePath(base) {
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function encodePath(path) {
  const trimmed = path.startsWith("/") ? path.slice(1) : path;
  return trimmed
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function resolveAssetPath(inputPath) {
  if (!inputPath) return "";
  if (isAbsoluteUrl(inputPath)) return inputPath;
  const base = normalizeBasePath(getBaseUrl());
  const encoded = encodePath(inputPath);
  return `${base}${encoded}`;
}

function toFriendlyLabel(fileName) {
  return fileName
    .replace(/\.(glb|gltf)$/i, "")
    .replace(/[-_]+/g, " ")
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
    mallSceneGltf,
    scooterGltf,
    riderGltf,
    characterBaseGltf,
  ] = await Promise.all([
    safeLoad("mall kiosk model", () =>
      gltfLoader.loadAsync(resolveAssetPath("assets/mall_kiosk.gltf"))
    ),
    safeLoad("column model", () =>
      gltfLoader.loadAsync(resolveAssetPath("assets/mall_column.gltf"))
    ),
    safeLoad("banner model", () =>
      gltfLoader.loadAsync(resolveAssetPath("assets/mall_banner.gltf"))
    ),
    safeLoad("banner texture", () =>
      textureLoader.loadAsync(resolveAssetPath("assets/mall_banner.png"))
    ),
    safeLoad("shopping mall model", () =>
      gltfLoader.loadAsync(resolveAssetPath("assets/shopping_mall/scene.gltf"))
    ),
    safeLoad("mobility scooter model", () =>
      gltfLoader.loadAsync(
        resolveAssetPath("assets/mobility_scooter_animated/scene.gltf")
      )
    ),
    safeLoad("evil old lady model", () =>
      gltfLoader.loadAsync(resolveAssetPath("assets/evil_old_lady/scene.gltf"))
    ),
    safeLoad("base npc model", () =>
      gltfLoader.loadAsync(resolveAssetPath("assets/Character Base.gltf"))
    ),
  ]);

  const kioskScene = kioskGltf ? kioskGltf.scene : null;
  const columnScene = columnGltf ? columnGltf.scene : null;
  const bannerScene = bannerGltf ? bannerGltf.scene : null;
  const mallScene = mallSceneGltf ? mallSceneGltf.scene : null;
  const scooterScene = scooterGltf ? scooterGltf.scene : null;
  const riderScene = riderGltf ? riderGltf.scene : null;
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
    riderScene,
    riderAnimations: riderGltf ? riderGltf.animations ?? [] : [],
    characterBaseScene,
    characterBaseAnimations: characterBaseGltf
      ? characterBaseGltf.animations ?? []
      : [],
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
  const menNpcGltfs = await loadNpcPack(
    "animated men npc",
    "assets/Animated Men Pack-glb",
    ["Man.gltf", "Man in Suit.gltf", "Man in Long Sleeves.gltf", "Man-fjHyMd5Wxw.gltf"]
  );

  const womenNpcGltfs = await loadNpcPack(
    "animated women npc",
    "assets/Ultimate Modular Women Pack-glb",
    [
      "Animated Woman.gltf",
      "Animated Woman-nIItLV9nxS.gltf",
      "Adventurer.gltf",
      "Medieval.gltf",
      "Punk.gltf",
      "Sci Fi Character.gltf",
      "Soldier.gltf",
      "Suit.gltf",
      "Witch.gltf",
      "Worker.gltf",
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
    world.solver.iterations = Math.min(
      10,
      Math.max(5, (world.solver.iterations ?? 10) - 3)
    );
    world.solver.tolerance = 0.001;
  }

  const materials = {
    ground: new Material("ground"),
    dynamic: new Material("dynamic"),
    player: new Material("player"),
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

  let shadowsEnabled = false;
  renderer.shadowMap.enabled = shadowsEnabled;

  const scene = new Scene();
  scene.background = new Color("#dfe6ef");

  const camera = new PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  camera.position.set(50, 28, 50);
  scene.add(camera);

  renderer.domElement.style.cursor = "grab";
  renderer.domElement.style.touchAction = "none";

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.target.set(0, 2, 0);
  controls.enabled = false;
  controls.enableKeys = false;
  controls.update();
  controls.addEventListener("start", () => {
    renderer.domElement.style.cursor = "grabbing";
  });
  controls.addEventListener("end", () => {
    renderer.domElement.style.cursor = "grab";
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
    color: "#d1d9e6",
    metalness: 0.02,
    roughness: 0.75,
  });
  let ground = null;

  if (assets.mallScene) {
    const mall = assets.mallScene.clone(true);
    mall.name = "shopping-mall";
    const mallScale = 24;
    mall.scale.setScalar(mallScale);
    const characterNamePattern =
      /character|people|person|crowd|npc|male|female|man|woman|boy|girl|standee|cutout|cardboard/;
    mall.traverse((child) => {
      const name = typeof child.name === "string" ? child.name.toLowerCase() : "";
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
  let cameraMode = "orbit";

  function updateCameraFollow(target) {
    if (cameraMode !== "follow" || !target) return;
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
      background: "#dfe6ef",
      ambientColor: "#ffffff",
      ambientIntensity: 0.7,
      hemisphereSky: "#f3f7fe",
      hemisphereGround: "#c9d6e6",
      hemisphereIntensity: 0.6,
      sunColor: "#fff3db",
      sunIntensity: 1.2,
      groundColor: "#d1d9e6",
    },
    dark: {
      background: "#0b1014",
      ambientColor: "#1d2939",
      ambientIntensity: 0.6,
      hemisphereSky: "#1e293b",
      hemisphereGround: "#0b1014",
      hemisphereIntensity: 0.32,
      sunColor: "#94a3b8",
      sunIntensity: 0.85,
      groundColor: "#111c27",
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
    cameraMode = mode === "follow" ? "follow" : "orbit";
    controls.enabled = cameraMode === "orbit";
    if (controls.enabled) {
      controls.update();
    }
    camera.far = cameraMode === "orbit" ? 3000 : 2000;
    camera.updateProjectionMatrix();
  }

  function updateCamera(target) {
    if (cameraMode === "orbit") {
      controls.update();
    } else {
      updateCameraFollow(target);
    }
  }

  function setShadowsEnabled(enabled) {
    const next = !!enabled;
    if (shadowsEnabled === next) return;
    shadowsEnabled = next;
    renderer.shadowMap.enabled = shadowsEnabled;
    try {
      sun.castShadow = shadowsEnabled;
    } catch (_) { }
    try {
      scene.traverse((child) => {
        if (child && child.isMesh) {
          child.castShadow = shadowsEnabled;
          child.receiveShadow = shadowsEnabled;
        }
      });
    } catch (_) { }
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
    setShadowsEnabled,
    dispose: () => {
      try {
        controls?.dispose?.();
      } catch (_) { }
    },
  };
}

// -----------------------------------------------------------------------------
// Audio system
// -----------------------------------------------------------------------------

export class AudioManager {
  constructor() {
    this.context = null;
    this.sounds = new Map();
    this.masterVolume = 0.7;
    this.sfxVolume = 0.8;
    this.musicVolume = 0.6;
    this.initialized = false;
    this.engineSource = null;
    this.engineGain = null;
    this.currentEngineSpeed = 0;
    this.activeNodes = new Set();
    this.bufferPool = new Map();
  }

  async initialize() {
    if (this.initialized) return;

    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();

      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.context.destination);

      this.sfxGain = this.context.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.context.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.masterGain);

      await this.initializeEngineSound();

      this.initialized = true;
      console.log("[Audio] Audio system initialized");
    } catch (error) {
      console.warn("[Audio] Failed to initialize audio system:", error);
    }
  }

  async initializeEngineSound() {
    if (!this.context) return;

    this.engineGain = this.context.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.sfxGain);

    this.engineOsc1 = this.context.createOscillator();
    this.engineOsc1.type = "sawtooth";
    this.engineOsc1.frequency.value = 40;

    this.engineOsc2 = this.context.createOscillator();
    this.engineOsc2.type = "square";
    this.engineOsc2.frequency.value = 80;

    this.engineOsc3 = this.context.createOscillator();
    this.engineOsc3.type = "sine";
    this.engineOsc3.frequency.value = 200;

    const gain1 = this.context.createGain();
    gain1.gain.value = 0.6;
    this.engineOsc1.connect(gain1);
    gain1.connect(this.engineGain);

    const gain2 = this.context.createGain();
    gain2.gain.value = 0.3;
    this.engineOsc2.connect(gain2);
    gain2.connect(this.engineGain);

    const gain3 = this.context.createGain();
    gain3.gain.value = 0.1;
    this.engineOsc3.connect(gain3);
    gain3.connect(this.engineGain);

    this.engineOsc1.start();
    this.engineOsc2.start();
    this.engineOsc3.start();
  }

  updateEngineSound(speed, throttle = 0) {
    if (!this.engineGain || !this.context) return;

    const normalizedSpeed = Math.min(speed / 20, 1);
    const engineVolume = Math.max(0.1, normalizedSpeed * 0.4 + throttle * 0.3);

    this.engineGain.gain.linearRampToValueAtTime(
      engineVolume,
      this.context.currentTime + 0.1
    );

    if (this.engineOsc1) {
      this.engineOsc1.frequency.linearRampToValueAtTime(
        40 + normalizedSpeed * 30,
        this.context.currentTime + 0.1
      );
    }
    if (this.engineOsc2) {
      this.engineOsc2.frequency.linearRampToValueAtTime(
        80 + normalizedSpeed * 60,
        this.context.currentTime + 0.1
      );
    }
    if (this.engineOsc3) {
      this.engineOsc3.frequency.linearRampToValueAtTime(
        200 + normalizedSpeed * 400,
        this.context.currentTime + 0.1
      );
    }
  }

  getCollisionBuffer(type, duration) {
    const key = `collision_${type}_${Math.round(duration * 10)}`;

    if (!this.bufferPool.has(key)) {
      const bufferSize = this.context.sampleRate * duration;
      const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        if (type === "metal") {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        } else if (type === "human") {
          data[i] =
            (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.5)) * 0.7;
        } else {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
        }
      }

      this.bufferPool.set(key, buffer);
    }

    return this.bufferPool.get(key);
  }

  playCollisionSound(intensity = 1, type = "default") {
    if (!this.context || !this.initialized) return;

    const duration = 0.2 + intensity * 0.3;
    const volume = Math.min(0.8, 0.3 + intensity * 0.5);

    const buffer = this.getCollisionBuffer(type, duration);
    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const gain = this.context.createGain();
    gain.gain.value = volume;

    const filter = this.context.createBiquadFilter();
    if (type === "metal") {
      filter.type = "highpass";
      filter.frequency.value = 800;
    } else if (type === "human") {
      filter.type = "lowpass";
      filter.frequency.value = 400;
    } else {
      filter.type = "bandpass";
      filter.frequency.value = 600;
    }

    this.activeNodes.add(source);
    this.activeNodes.add(gain);
    this.activeNodes.add(filter);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    source.onended = () => {
      this.cleanupAudioNodes([source, gain, filter]);
    };

    source.start();
    source.stop(this.context.currentTime + duration);
  }

  playScoreSound(points) {
    if (!this.context || !this.initialized) return;

    const frequency = 400 + (points / 100) * 200;
    const duration = 0.3;

    const osc = this.context.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, this.context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      frequency * 1.5,
      this.context.currentTime + 0.1
    );
    osc.frequency.exponentialRampToValueAtTime(
      frequency * 0.8,
      this.context.currentTime + duration
    );

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.4, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.01,
      this.context.currentTime + duration
    );

    this.activeNodes.add(osc);
    this.activeNodes.add(gain);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.onended = () => {
      this.cleanupAudioNodes([osc, gain]);
    };

    osc.start();
    osc.stop(this.context.currentTime + duration);
  }

  playComboSound(comboCount) {
    if (!this.context || !this.initialized) return;

    const baseFreq = 600;
    const nodes = [];

    for (let i = 0; i < Math.min(comboCount, 5); i++) {
      const delay = i * 0.08;
      const freq = baseFreq + i * 100;

      const osc = this.context.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;

      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0, this.context.currentTime + delay);
      gain.gain.linearRampToValueAtTime(
        0.3,
        this.context.currentTime + delay + 0.05
      );
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        this.context.currentTime + delay + 0.2
      );

      nodes.push(osc, gain);
      this.activeNodes.add(osc);
      this.activeNodes.add(gain);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      if (i === Math.min(comboCount, 5) - 1) {
        osc.onended = () => {
          this.cleanupAudioNodes(nodes);
        };
      }

      osc.start(this.context.currentTime + delay);
      osc.stop(this.context.currentTime + delay + 0.2);
    }
  }

  setMasterVolume(volume) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.masterVolume;
    }
  }

  setSFXVolume(volume) {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.sfxVolume;
    }
  }

  resume() {
    if (this.context && this.context.state === "suspended") {
      this.context.resume();
    }
  }

  cleanupAudioNodes(nodes) {
    nodes.forEach((node) => {
      try {
        if (node && typeof node.disconnect === "function") {
          node.disconnect();
        }
        this.activeNodes.delete(node);
      } catch (_) {
        // ignore cleanup errors
      }
    });
  }

  cleanupAllNodes() {
    this.activeNodes.forEach((node) => {
      try {
        if (node && typeof node.disconnect === "function") {
          node.disconnect();
        }
        if (node && typeof node.stop === "function") {
          node.stop();
        }
      } catch (_) {
        // ignore cleanup errors
      }
    });
    this.activeNodes.clear();
  }

  dispose() {
    if (this.engineOsc1) {
      try {
        this.engineOsc1.stop();
        this.engineOsc1.disconnect();
      } catch (_) { }
    }
    if (this.engineOsc2) {
      try {
        this.engineOsc2.stop();
        this.engineOsc2.disconnect();
      } catch (_) { }
    }

    this.cleanupAllNodes();
    this.bufferPool.clear();
    this.sounds.clear();

    if (this.context) {
      try {
        this.context.close();
      } catch (error) {
        console.warn("[Audio] Error closing audio context:", error);
      }
    }

    this.initialized = false;
  }
}

export const audioManager = new AudioManager();

// -----------------------------------------------------------------------------
// Collision constants
// -----------------------------------------------------------------------------

export const CollisionType = {
  HUMAN: "human",
  METAL: "metal",
  DEFAULT: "default",
  WOOD: "wood",
  PLASTIC: "plastic",
};

export const TARGET_COLLISION_TYPES = {
  "Mall Patron": CollisionType.HUMAN,
  "Security Guard": CollisionType.HUMAN,
  "Store Employee": CollisionType.HUMAN,
  Janitor: CollisionType.HUMAN,
  "Mall Manager": CollisionType.HUMAN,
  "Mall Santa": CollisionType.HUMAN,
  "Mime Artist": CollisionType.HUMAN,
  "Street Performer": CollisionType.HUMAN,
  "Mall Kiosk": CollisionType.METAL,
  "Vending Machine": CollisionType.METAL,
  ATM: CollisionType.METAL,
  "Shopping Cart": CollisionType.METAL,
  "Trash Can": CollisionType.METAL,
  Bench: CollisionType.WOOD,
  "Poster Stand": CollisionType.WOOD,
  "Box Stack": CollisionType.DEFAULT,
  Planter: CollisionType.DEFAULT,
  "Flower Pot": CollisionType.DEFAULT,
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
// Spawn selector
// -----------------------------------------------------------------------------

export function createSpawnSelector({
  selectorCamera,
  selectorRenderer,
  selectorScene,
  selectorMall,
  getScooterBody,
}) {
  invariant(
    selectorCamera && typeof selectorCamera.isCamera === "boolean",
    "createSpawnSelector requires a THREE camera instance."
  );
  invariant(
    selectorMall && typeof selectorMall.findNearestNavigablePoint === "function",
    "createSpawnSelector requires selectorMall.findNearestNavigablePoint()."
  );

  const RING_SEGMENTS = 48;
  const geometry = new RingGeometry(0.8, 1.25, RING_SEGMENTS);
  const material = new MeshBasicMaterial({
    color: "#4f8ef7",
    opacity: 0.6,
    transparent: true,
    side: DoubleSide,
    depthTest: false,
  });
  const indicator = new Mesh(geometry, material);
  indicator.rotation.x = -Math.PI / 2;
  indicator.visible = false;
  selectorScene.add(indicator);

  const selectorDomElement = selectorRenderer.domElement;

  const pointer = new Vector2();
  const raycaster = new Raycaster();
  const plane = new Plane(new Vector3(0, 1, 0), 0);
  const intersection = new Vector3();
  const fallback = new Vector3();
  let active = false;
  let resolvePromise = null;
  const candidate = new Vector3();

  function currentIgnoreBodies() {
    const scooter = getScooterBody?.();
    return scooter ? [scooter] : [];
  }

  function computeSafe(point) {
    return selectorMall.findNearestNavigablePoint(point, 3.6, {
      ignoreBodies: currentIgnoreBodies(),
    });
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
    if (!resolvePromise) return;
    const safe = computeSafe(output ?? candidate);
    const result = safe.clone();
    const resolve = resolvePromise;
    cleanup();
    resolve(result);
  }

  function handleClick(event) {
    if (!active) return;
    event.preventDefault();
    const worldPoint = worldPointFromEvent(event);
    if (worldPoint) preview(worldPoint);
    finishSelection(candidate);
  }

  function handleKey(event) {
    if (!active) return;
    const key = event.key.toLowerCase();
    if (key === "enter" || key === " ") {
      event.preventDefault();
      finishSelection(candidate);
    } else if (key === "escape") {
      event.preventDefault();
      finishSelection(fallback);
    }
  }

  function cleanup() {
    active = false;
    indicator.visible = false;
    selectorDomElement.removeEventListener("pointermove", handlePointerMove);
    selectorDomElement.removeEventListener("click", handleClick);
    window.removeEventListener("keydown", handleKey);
    resolvePromise = null;
  }

  async function pick(start) {
    if (active) {
      return candidate.clone();
    }
    active = true;
    fallback.copy(computeSafe(start ?? new Vector3(0, 0, 0)));
    preview(fallback);
    selectorDomElement.addEventListener("pointermove", handlePointerMove);
    selectorDomElement.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKey);
    return new Promise((resolve) => {
      resolvePromise = resolve;
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
      "Mall Kiosk": 120,
      "Trash Can": 35,
      "Poster Stand": 30,
      "Box Stack": 25,
      "Food Cart": 80,
      "Vending Machine": 90,
      "Shopping Cart": 45,
      "Display Stand": 60,
      "Flower Pot": 35,
      "Newspaper Stand": 40,
      ATM: 150,
      "Phone Booth": 100,
      "Mall Patron": 1600,
      "Security Guard": 2000,
      "Store Employee": 1400,
      Janitor: 1200,
      "Mall Manager": 2500,
      "Mall Santa": 5000,
      "Mime Artist": 3000,
      "Street Performer": 2200,
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
    let message = "";

    if (speed > 20) {
      bonus += 200;
      message = "SPEED DEMON!";
    }

    if (this.combo > 0 && this.combo % 10 === 0) {
      bonus += this.combo * 50;
      message = `${this.combo}X COMBO MASTER!`;
    }

    const rareTargets = [
      "Mall Santa",
      "Mime Artist",
      "Street Performer",
      "Mall Manager",
    ];
    if (rareTargets.includes(targetLabel)) {
      bonus += 1000;
      message = `RARE TARGET BONUS!`;
    }

    if (currentTime - this.lastHitTime < 500 && this.combo >= 3) {
      bonus += 300;
      message = "RAPID FIRE!";
    }

    return { bonus, message };
  }

  playScoringSounds(points, combo) {
    audioManager.playScoreSound(points);

    if (combo >= 3) {
      audioManager.playComboSound(combo);
    }

    if (points > 1000) {
      if (this._scoreSoundTimeout) {
        clearTimeout(this._scoreSoundTimeout);
      }
      this._scoreSoundTimeout = setTimeout(() => {
        audioManager.playScoreSound(points * 0.5);
        this._scoreSoundTimeout = null;
      }, 200);
    }
  }

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
    if (this.combo < 2) return "";
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

    if (this._scoreSoundTimeout) {
      clearTimeout(this._scoreSoundTimeout);
      this._scoreSoundTimeout = null;
    }

    this.reset();
  }
}

export const scoringSystem = new ScoringSystem({
  comboTimeWindow: 2500,
  multiplierLevels: [1, 1.15, 1.35, 1.6, 1.9, 2.2],
  maxScorePerHit: 15000,
});
