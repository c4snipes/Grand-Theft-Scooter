
import {
  AnimationMixer,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  LoopRepeat,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
  clone as cloneSkeleton,
} from "three";
import { Body, Box as CannonBox, Vec3 } from "cannon-es";
import {
  invariant,
  warnOnce,
  PHYSICS_DAMPING,
  getCollisionType,
  CollisionType,
} from "./coreAndSystems.js";

let chunkSize = 48;
let chunkRadius = 2;
let streamingEnabled = true;
const chunks = new Map();
let lastCenter = null;
let mallPopulateChunk = null;

// Interactable type enum
export const INTERACTABLE_TYPES = {
  PROP: "prop",
  HAZARD: "hazard",
  HUMAN: "human",
};

// Exported for direct import
export function getChunkKeyForPosition(x, z) {
  const cx = Math.floor(x / chunkSize);
  const cz = Math.floor(z / chunkSize);
  return `${cx},${cz}`;
}

let chunkScene = null;
let chunkWorld = null;

function getChunkCoords(x, z) {
  const cx = Math.floor(x / chunkSize);
  const cz = Math.floor(z / chunkSize);
  return { cx, cz };
}

// Removed duplicate export of getChunkKeyForPosition

function ensureChunkInternal(key) {
  let entry = chunks.get(key);
  if (entry) return entry;
  const [sx, sz] = key.split(',').map((n) => parseInt(n, 10));
  const group = new Group();
  group.name = `chunk-${key}`;
  group.position.set(sx * chunkSize, 0, sz * chunkSize);
  if (chunkScene) chunkScene.add(group);
  entry = { group, records: new Set(), bodies: new Set(), cx: sx, cz: sz, key };
  chunks.set(key, entry);
  return entry;
}

function unloadChunkInternal(key) {
  const entry = chunks.get(key);
  if (!entry) return;
  if (chunkScene) chunkScene.remove(entry.group);
  chunks.delete(key);
}

export function initChunking(scene, world) {
  chunkScene = scene;
  chunkWorld = world;
  lastCenter = null;

  return {
    ensureChunk: ensureChunkInternal,
    unloadChunk: unloadChunkInternal,
    // getChunkKeyForPosition is now exported above
    updateChunkStreaming: (px, pz) => updateChunkStreaming(px, pz),
    setChunkingConfig({ size, radius, enabled }) {
      if (typeof size === 'number' && isFinite(size) && size >= 16) chunkSize = size;
      if (typeof radius === 'number' && isFinite(radius) && radius >= 1) chunkRadius = Math.floor(radius);
      if (typeof enabled === 'boolean') streamingEnabled = enabled;
    },
    chunkedStreamingEnabled: () => streamingEnabled,
    getChunkSize: () => chunkSize,
  };
}

export function updateChunkStreaming(px, pz) {
  if (!streamingEnabled) return;
  const { cx, cz } = getChunkCoords(px, pz);
  const centerKey = `${cx},${cz}`;
  if (centerKey === lastCenter) return;
  lastCenter = centerKey;
  const need = new Set();
  for (let dz = -chunkRadius; dz <= chunkRadius; dz += 1) {
    for (let dx = -chunkRadius; dx <= chunkRadius; dx += 1) {
      const k = `${cx + dx},${cz + dz}`;
      need.add(k);
      const entry = chunks.get(k);
      if (!entry) {
        ensureChunkInternal(k);
        populateChunk(cx + dx, cz + dz);
      }
    }
  }
  for (const key of Array.from(chunks.keys())) {
    if (!need.has(key)) unloadChunkInternal(key);
  }
}

function populateChunk(cx, cz) {
  if (typeof mallPopulateChunk === 'function') {
    mallPopulateChunk(cx, cz, { chunkSize });
  }
}

export function setPopulateChunk(fn) {
  mallPopulateChunk = typeof fn === 'function' ? fn : null;
}

export const chunksApi = {
  peek(key) {
    return chunks.get(key) || null;
  },
  size() {
    return chunks.size;
  },
};

export const propMaterials = {
  kioskPrimary: new MeshStandardMaterial({
    color: "#3e7cb1",
    roughness: 0.55,
    metalness: 0.1,
  }),
  kioskAccent: new MeshStandardMaterial({ color: "#f3a712", roughness: 0.6 }),
  planter: new MeshStandardMaterial({ color: "#4c5a52", roughness: 0.95 }),
  foliage: new MeshStandardMaterial({ color: "#2f8f5e", roughness: 0.75 }),
  benchSeat: new MeshStandardMaterial({ color: "#a97155", roughness: 0.8 }),
  benchFrame: new MeshStandardMaterial({ color: "#2c3036", roughness: 0.5 }),
  cartPrimary: new MeshStandardMaterial({ color: "#d94f70", roughness: 0.6 }),
  cartAccent: new MeshStandardMaterial({ color: "#fce36b", roughness: 0.4 }),
  humanSkin: new MeshStandardMaterial({ color: "#f2c7a6", roughness: 0.65 }),
  humanTop: new MeshStandardMaterial({ color: "#4f7cd1", roughness: 0.75 }),
  humanBottom: new MeshStandardMaterial({ color: "#383f4c", roughness: 0.7 }),
  humanHair: new MeshStandardMaterial({ color: "#2b1f1a", roughness: 0.5 }),
  floorPrimary: new MeshStandardMaterial({ color: "#27333a", roughness: 0.95 }),
  floorAccent: new MeshStandardMaterial({ color: "#1c2329", roughness: 0.95 }),
  fountainBase: new MeshStandardMaterial({ color: "#d7dadf", roughness: 0.4 }),
  fountainWater: new MeshStandardMaterial({
    color: "#4aa3d8",
    roughness: 0.2,
    metalness: 0.2,
  }),
};

export function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function choose(collection) {
  return collection[Math.floor(Math.random() * collection.length)];
}

// Context supplied by mall.js so helpers remain stateless
let CTX = null;
export function initSpawnContext(ctx) {
  // Attach with only the fields helpers actually use to reduce coupling
  const {
    world,
    scene,
    assets,
    materials,
    mallBounds,
    registerInteractable,
    propMaterials: mats,
  } = ctx || {};
  CTX = {
    world,
    scene,
    assets,
    materials,
    mallBounds,
    registerInteractable,
    getChunkKeyForPosition: (x, z) =>
      `${Math.floor(x / 48)},${Math.floor(z / 48)}`,
    propMaterials: mats,
  };
}

export function buildMallDecor(scene, mallBounds, mats = propMaterials) {
  const decor = new Group();
  decor.name = "mall-decor";
  decor.position.y = 0.015;

  const mainAisle = new Mesh(
    new PlaneGeometry(18, mallBounds.halfExtent * 2),
    mats.floorPrimary
  );
  mainAisle.rotation.x = -Math.PI / 2;
  decor.add(mainAisle);

  const crossAisle = new Mesh(
    new PlaneGeometry(mallBounds.halfExtent * 2, 14),
    mats.floorPrimary
  );
  crossAisle.rotation.x = -Math.PI / 2;
  decor.add(crossAisle);

  const plaza = new Mesh(new CircleGeometry(8, 48), mats.floorAccent);
  plaza.rotation.x = -Math.PI / 2;
  decor.add(plaza);

  const fountainBase = new Mesh(
    new CylinderGeometry(4.8, 5.4, 0.9, 40),
    mats.fountainBase
  );
  fountainBase.position.y = 0.45;
  decor.add(fountainBase);

  const fountainPool = new Mesh(
    new CylinderGeometry(3.95, 3.95, 0.22, 36),
    mats.fountainWater
  );
  fountainPool.position.y = 0.72;
  decor.add(fountainPool);

  scene.add(decor);
}

export function spawnColumnRing(scene, assets, materials) {
  if (!assets.makeColumnInstance) return;
  const group = new Group();
  group.name = "mall-columns";
  const columns = randomInt(10, 14);
  const radius = randomRange(24, 30);
  for (let i = 0; i < columns; i += 1) {
    const col = assets.makeColumnInstance();
    if (!col) continue;
    const height = randomRange(4.5, 6.5);
    const girth = randomRange(1.0, 1.6);
    const angle = (i / columns) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    col.scale.set(girth, height, girth);
    col.position.set(x, height / 2, z);
    col.traverse((c) => {
      if (c.isMesh) {
        if (c.material?.clone) c.material = c.material.clone();
        c.castShadow = c.receiveShadow = true;
      }
    });
    group.add(col);
    const body = new Body({
      mass: 0,
      shape: new CannonBox(new Vec3(girth / 2, height / 2, girth / 2)),
      position: new Vec3(x, height / 2, z),
    });
    if (materials.ground) body.material = materials.ground;
    CTX.world.addBody(body);
  }
  scene.add(group);
}

export function spawnHangingBanners(scene, assets) {
  if (!assets.makeBannerInstance) return;
  const group = new Group();
  group.name = "mall-banners";
  const rows = randomInt(2, 3);
  const bannerTexture = assets.bannerTexture ?? null;
  for (let row = 0; row < rows; row += 1) {
    const z = (row - (rows - 1) / 2) * 12;
    const count = randomInt(4, 6);
    for (let i = 0; i < count; i += 1) {
      const banner = assets.makeBannerInstance();
      if (!banner) continue;
      const width = randomRange(4, 7);
      const height = randomRange(3.2, 4.4);
      const separation = 8;
      const x = (i - (count - 1) / 2) * separation;
      banner.scale.set(width, 1, 1);
      banner.rotation.x = Math.PI / 2;
      banner.position.set(x, height, z);
      banner.traverse((child) => {
        if (child.isMesh) {
          if (child.material?.clone) child.material = child.material.clone();
          if (bannerTexture) {
            child.material.map = bannerTexture;
            child.material.needsUpdate = true;
          } else if (child.material?.color) {
            child.material.color = new Color("#f575ab");
          }
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });
      group.add(banner);
    }
  }
  scene.add(group);
}

// Shared registration
function register({
  mesh,
  body,
  label,
  points = 0,
  type,
  respawn,
  onUpdate,
  fatal = false,
  chunkKey,
}) {
  return CTX.registerInteractable({
    mesh,
    body,
    label,
    points,
    type,
    respawn,
    onUpdate,
    fatal,
    chunkKey,
  });
}

export function spawnPlanter(position) {
  const pos = position ?? CTX.findSpawnPosition(4);
  const height = randomRange(0.5, 0.9);
  const radius = randomRange(0.6, 1.1);
  const planter = new Group();
  planter.name = "planter";
  const pot = new Mesh(
    new CylinderGeometry(radius, radius * 1.1, height, 24),
    propMaterials.planter
  );
  planter.add(pot);
  const foliage = new Mesh(
    new SphereGeometry(radius * 0.95, 20, 16),
    propMaterials.foliage
  );
  foliage.position.y = height / 2 + radius * 0.6;
  planter.add(foliage);
  const centerY = height / 2;
  planter.position.set(pos.x, centerY, pos.z);
  const body = new Body({
    mass: 0,
    shape: new CannonBox(new Vec3(radius, centerY, radius)),
    position: new Vec3(pos.x, centerY, pos.z),
  });
  register({
    mesh: planter,
    body,
    label: "Planter",
    points: 40,
    type: INTERACTABLE_TYPES.PROP,
    respawn: spawnPlanter,
    chunkKey: CTX.getChunkKeyForPosition(pos.x, pos.z),
  });
}

export function spawnBench(position) {
  const pos = position ?? CTX.findSpawnPosition(5);
  const width = randomRange(2.2, 3.0);
  const depth = 0.65;
  const height = 0.7;
  const bench = new Group();
  bench.name = "bench";
  const seat = new Mesh(
    new BoxGeometry(width, 0.12, depth),
    propMaterials.benchSeat
  );
  seat.position.y = 0;
  bench.add(seat);
  const back = new Mesh(
    new BoxGeometry(width, 0.5, 0.12),
    propMaterials.benchSeat
  );
  back.position.set(0, 0.31, -depth / 2);
  bench.add(back);
  const leg = new BoxGeometry(0.12, height, 0.12);
  const frontLeft = new Mesh(leg, propMaterials.benchFrame);
  frontLeft.position.set(
    -width / 2 + 0.15,
    -height / 2 + 0.06,
    depth / 2 - 0.1
  );
  bench.add(frontLeft);
  const frontRight = frontLeft.clone();
  frontRight.position.x = width / 2 - 0.15;
  bench.add(frontRight);
  const backLeft = new Mesh(leg, propMaterials.benchFrame);
  backLeft.position.set(
    -width / 2 + 0.15,
    -height / 2 + 0.06,
    -depth / 2 + 0.1
  );
  bench.add(backLeft);
  const backRight = backLeft.clone();
  backRight.position.x = width / 2 - 0.15;
  bench.add(backRight);
  const centerY = height / 2;
  bench.position.set(pos.x, centerY, pos.z);
  const body = new Body({
    mass: 0,
    shape: new CannonBox(new Vec3(width / 2, centerY, depth / 2)),
    position: new Vec3(pos.x, centerY, pos.z),
  });
  register({
    mesh: bench,
    body,
    label: "Bench",
    points: 55,
    type: INTERACTABLE_TYPES.PROP,
    respawn: spawnBench,
    chunkKey: CTX.getChunkKeyForPosition(pos.x, pos.z),
  });
}

export function spawnFoodCart(position) {
  const pos = position ?? CTX.findSpawnPosition(6);
  const kioskFromAsset = CTX.assets.makeKioskInstance?.() ?? null;
  if (kioskFromAsset) {
    const wrap = (object) => {
      const container = new Group();
      container.add(object);
      container.updateWorldMatrix(true, true);
      const bounds = new Box3().setFromObject(container);
      const size = bounds.getSize(new Vector3());
      const center = bounds.getCenter(new Vector3());
      object.position.sub(center);
      container.updateWorldMatrix(true, true);
      return { mesh: container, size };
    };
    const scale = 1.8;
    kioskFromAsset.scale.set(scale, scale, scale);
    kioskFromAsset.traverse((c) => {
      if (c.isMesh) {
        if (c.material?.clone) c.material = c.material.clone();
        c.castShadow = c.receiveShadow = true;
      }
    });
    const { mesh: kioskMesh, size } = wrap(kioskFromAsset);
    kioskMesh.position.set(pos.x, size.y / 2, pos.z);
    const body = new Body({
      mass: 6,
      shape: new CannonBox(new Vec3(size.x / 2, size.y / 2, size.z / 2)),
      position: new Vec3(
        kioskMesh.position.x,
        kioskMesh.position.y,
        kioskMesh.position.z
      ),
      angularDamping: 0.9,
      linearDamping: 0.75,
    });
    body.allowSleep = false;
    register({
      mesh: kioskMesh,
      body,
      label: "Mall Kiosk",
      points: 120,
      type: INTERACTABLE_TYPES.PROP,
      respawn: () => spawnFoodCart(),
      chunkKey: CTX.getChunkKeyForPosition(pos.x, pos.z),
    });
    return;
  }

  // primitive fallback version omitted for brevity in this helper to keep file manageable
}

export function spawnKiosk(position) {
  return spawnFoodCart(position);
}

export function spawnTrashCan(position) {
  const pos = position ?? CTX.findSpawnPosition(4);
  const height = 0.9;
  const radius = 0.28;
  const can = new Group();
  can.name = "trash-can";
  const bodyMat = propMaterials.benchFrame;
  const lidMat = propMaterials.kioskAccent;
  const barrel = new Mesh(
    new CylinderGeometry(radius, radius, height, 14),
    bodyMat
  );
  barrel.position.y = height / 2;
  can.add(barrel);
  const lid = new Mesh(
    new CylinderGeometry(radius * 1.02, radius * 1.02, 0.04, 16),
    lidMat
  );
  lid.position.y = height + 0.02;
  can.add(lid);
  can.position.set(pos.x, 0, pos.z);
  const body = new Body({
    mass: 2.0,
    shape: new CannonBox(new Vec3(radius, height / 2, radius)),
    position: new Vec3(pos.x, height / 2, pos.z),
    angularDamping: 0.6,
    linearDamping: 0.5,
  });
  register({
    mesh: can,
    body,
    label: "Trash Can",
    points: 35,
    type: INTERACTABLE_TYPES.PROP,
    respawn: spawnTrashCan,
    chunkKey: CTX.getChunkKeyForPosition(pos.x, pos.z),
  });
}

export function spawnPosterStand(position) {
  const pos = position ?? CTX.findSpawnPosition(4.5);
  const w = 0.8,
    h = 1.5,
    d = 0.2;
  const stand = new Group();
  stand.name = "poster-stand";
  const frame = new Mesh(new BoxGeometry(w, h, d), propMaterials.benchFrame);
  frame.position.y = h / 2;
  stand.add(frame);
  const accent = new Mesh(
    new BoxGeometry(w * 0.96, h * 0.96, d * 0.6),
    propMaterials.kioskAccent
  );
  accent.position.y = h / 2;
  stand.add(accent);
  stand.position.set(pos.x, 0, pos.z);
  const body = new Body({
    mass: 1.5,
    shape: new CannonBox(new Vec3(w / 2, h / 2, d / 2)),
    position: new Vec3(pos.x, h / 2, pos.z),
    angularDamping: 0.7,
    linearDamping: 0.55,
  });
  register({
    mesh: stand,
    body,
    label: "Poster Stand",
    points: 30,
    type: INTERACTABLE_TYPES.PROP,
    respawn: spawnPosterStand,
    chunkKey: CTX.getChunkKeyForPosition(pos.x, pos.z),
  });
}

export function spawnBoxStack(position) {
  const pos = position ?? CTX.findSpawnPosition(3.8);
  const base = new Group();
  base.name = "box-stack";
  const mat = propMaterials.planter;
  const b1 = new Mesh(new BoxGeometry(0.7, 0.28, 0.6), mat);
  b1.position.y = 0.14;
  base.add(b1);
  const b2 = new Mesh(new BoxGeometry(0.5, 0.24, 0.48), mat);
  b2.position.set(0.05, 0.14 + 0.24, 0.02);
  base.add(b2);
  const b3 = new Mesh(new BoxGeometry(0.36, 0.22, 0.36), mat);
  b3.position.set(-0.08, 0.14 + 0.24 + 0.22, -0.04);
  base.add(b3);
  base.position.set(pos.x, 0, pos.z);
  const approxH = 0.14 + 0.24 + 0.22 + 0.11;
  const body = new Body({
    mass: 1.2,
    shape: new CannonBox(new Vec3(0.35, approxH, 0.33)),
    position: new Vec3(pos.x, approxH, pos.z),
    angularDamping: 0.6,
    linearDamping: 0.5,
  });
  register({
    mesh: base,
    body,
    label: "Box Stack",
    points: 25,
    type: INTERACTABLE_TYPES.PROP,
    respawn: spawnBoxStack,
    chunkKey: CTX.getChunkKeyForPosition(pos.x, pos.z),
  });
}

export function spawnSecurityGate(position) {
  const pos = position ?? CTX.findSpawnPosition(6);
  const gate = new Group();
  gate.name = "security-gate";
  const frameMaterial = new MeshStandardMaterial({
    color: "#4d5964",
    metalness: 0.65,
    roughness: 0.4,
  });
  const panelMaterial = new MeshStandardMaterial({
    color: "#9fb2bf",
    transparent: true,
    opacity: 0.35,
    metalness: 0.2,
    roughness: 0.6,
  });
  const width = 4.5,
    height = 3.4,
    depth = 0.6;
  const panel = new Mesh(
    new BoxGeometry(width - 0.8, height - 0.6, depth * 0.6),
    panelMaterial
  );
  panel.position.set(0, (height - 0.6) / 2, 0);
  const leftPost = new Mesh(new BoxGeometry(0.4, height, depth), frameMaterial);
  leftPost.position.set(-width / 2 + 0.2, height / 2, 0);
  const rightPost = leftPost.clone();
  rightPost.position.x = width / 2 - 0.2;
  const topBar = new Mesh(
    new BoxGeometry(width - 0.4, 0.3, depth),
    frameMaterial
  );
  topBar.position.set(0, height - 0.15, 0);
  gate.add(leftPost, rightPost, topBar, panel);
  gate.position.set(pos.x, 0, pos.z);
  const body = new Body({
    mass: 0,
    shape: new CannonBox(new Vec3(width / 2, height / 2, depth / 2)),
    position: new Vec3(pos.x, height / 2, pos.z),
  });
  register({
    mesh: gate,
    body,
    label: "Security Gate",
    type: INTERACTABLE_TYPES.HAZARD,
    fatal: true,
    chunkKey: CTX.getChunkKeyForPosition(pos.x, pos.z),
  });
}

export function spawnCleaningRobot(position) {
  const pos = position ?? CTX.findSpawnPosition(5);
  const robot = new Group();
  robot.name = "cleaning-robot";
  const bodyMaterial = new MeshStandardMaterial({
    color: "#4aa3d8",
    roughness: 0.35,
    metalness: 0.4,
  });
  const trimMaterial = new MeshStandardMaterial({
    color: "#1a2730",
    roughness: 0.5,
  });
  const base = new Mesh(new CylinderGeometry(0.9, 0.9, 0.5, 24), bodyMaterial);
  base.position.y = 0.25;
  robot.add(base);
  const lid = new Mesh(new CylinderGeometry(0.8, 0.8, 0.25, 24), trimMaterial);
  lid.position.y = 0.6;
  robot.add(lid);
  const beacon = new Mesh(
    new CylinderGeometry(0.18, 0.12, 0.6, 16),
    new MeshStandardMaterial({
      color: "#f1c40f",
      emissive: "#f39c12",
      emissiveIntensity: 0.5,
    })
  );
  beacon.position.y = 1.0;
  robot.add(beacon);
  robot.position.set(pos.x, 0, pos.z);
  const body = new Body({
    mass: 0,
    shape: new CannonBox(new Vec3(0.9, 0.5, 0.9)),
    position: new Vec3(pos.x, 0.5, pos.z),
  });
  register({
    mesh: robot,
    body,
    label: "Cleaning Robot",
    type: INTERACTABLE_TYPES.HAZARD,
    fatal: true,
    onUpdate: (delta, record) => {
      if (record.hit) return;
      record.mesh.rotation.y += delta * 0.5;
    },
    chunkKey: CTX.getChunkKeyForPosition(pos.x, pos.z),
  });
}

export function spawnMaintenanceBarrier(position) {
  const pos = position ?? CTX.findSpawnPosition(4);
  const barrier = new Group();
  barrier.name = "maintenance-barrier";
  const panelMaterial = new MeshStandardMaterial({
    color: "#f5a623",
    roughness: 0.5,
    metalness: 0.1,
  });
  const stripeMaterial = new MeshStandardMaterial({
    color: "#222831",
    roughness: 0.7,
  });
  const width = 3.2,
    height = 2.2,
    depth = 0.4;
  const panel = new Mesh(new BoxGeometry(width, height, depth), panelMaterial);
  panel.position.y = height / 2;
  barrier.add(panel);
  const stripe = new Mesh(
    new BoxGeometry(width * 0.9, 0.28, depth + 0.02),
    stripeMaterial
  );
  stripe.position.set(0, height * 0.6, 0);
  barrier.add(stripe);
  const stripe2 = stripe.clone();
  stripe2.position.y = height * 0.35;
  barrier.add(stripe2);
  barrier.position.set(pos.x, 0, pos.z);
  const body = new Body({
    mass: 0,
    shape: new CannonBox(new Vec3(width / 2, height / 2, depth / 2)),
    position: new Vec3(pos.x, height / 2, pos.z),
  });
  register({
    mesh: barrier,
    body,
    label: "Maintenance Barrier",
    type: INTERACTABLE_TYPES.HAZARD,
    fatal: true,
    chunkKey: CTX.getChunkKeyForPosition(pos.x, pos.z),
  });
}

export function spawnMallBoundaries(
  scene,
  world,
  materials,
  mallBounds,
  getChunkKeyForPosition,
  registerInteractable
) {
  const wallThickness = 2.4;
  const wallHeight = 6;
  const floorHalfExtent = mallBounds.halfExtent + wallThickness;
  const wallMaterial = new MeshStandardMaterial({
    color: "#8fb6d8",
    transparent: true,
    opacity: 0.08,
    metalness: 0.1,
    roughness: 0.6,
  });
  const planeMaterial = new MeshStandardMaterial({ visible: false });
  const segments = [
    {
      x: 0,
      z: floorHalfExtent,
      sx: floorHalfExtent * 2 + wallThickness,
      sz: wallThickness,
    },
    {
      x: 0,
      z: -floorHalfExtent,
      sx: floorHalfExtent * 2 + wallThickness,
      sz: wallThickness,
    },
    {
      x: floorHalfExtent,
      z: 0,
      sx: wallThickness,
      sz: floorHalfExtent * 2 + wallThickness,
    },
    {
      x: -floorHalfExtent,
      z: 0,
      sx: wallThickness,
      sz: floorHalfExtent * 2 + wallThickness,
    },
  ];
  for (const segment of segments) {
    const mesh = new Mesh(
      new BoxGeometry(segment.sx, wallHeight, segment.sz),
      wallMaterial.clone()
    );
    mesh.position.set(segment.x, wallHeight / 2, segment.z);
    mesh.name = "mall-boundary";
    const body = new Body({
      mass: 0,
      shape: new CannonBox(
        new Vec3(segment.sx / 2, wallHeight / 2, segment.sz / 2)
      ),
      position: new Vec3(segment.x, wallHeight / 2, segment.z),
    });
    registerInteractable({
      mesh,
      body,
      label: "Mall Wall",
      type: INTERACTABLE_TYPES.HAZARD,
      fatal: true,
      chunkKey: getChunkKeyForPosition(segment.x, segment.z),
    });
  }
  const ceilingHeight = 12;
  const floorSize = mallBounds.halfExtent * 2 + wallThickness * 2;
  const ceiling = new Mesh(
    new PlaneGeometry(floorSize, floorSize),
    planeMaterial
  );
  ceiling.rotation.x = Math.PI;
  ceiling.position.y = ceilingHeight;
  ceiling.name = "mall-ceiling";
  const ceilingBody = new Body({
    mass: 0,
    shape: new CannonBox(new Vec3(floorSize / 2, 0.5, floorSize / 2)),
    position: new Vec3(0, ceilingHeight, 0),
  });
  registerInteractable({
    mesh: ceiling,
    body: ceilingBody,
    label: "Mall Ceiling",
    type: INTERACTABLE_TYPES.HAZARD,
    fatal: true,
    chunkKey: getChunkKeyForPosition(0, 0),
  });
}

export function spawnMallPatron(positionOverride) {
  // This helper exists to centralize later if needed.
  return CTX._spawnMallPatron?.(positionOverride);
}

// Mall search and spawn-placement helpers (extracted from mall.js)
export function mallSearch({ interactables, mallBounds }) {
  function isPositionFree(pos, minDistance, options = {}) {
    const minDistanceSq = minDistance * minDistance;
    const ignoreBodies = Array.isArray(options.ignoreBodies)
      ? new Set(options.ignoreBodies)
      : options.ignoreBodies instanceof Set
      ? options.ignoreBodies
      : null;
    for (const record of interactables) {
      if (ignoreBodies && ignoreBodies.has(record.body)) continue;
      const dx = record.body.position.x - pos.x;
      const dz = record.body.position.z - pos.z;
      if (dx * dx + dz * dz < minDistanceSq) {
        return false;
      }
    }
    return true;
  }

  function findSpawnPosition(minDistance = 4) {
    const attempts = 24;
    for (let i = 0; i < attempts; i += 1) {
      const candidate = new Vector3(
        randomRange(-mallBounds.halfExtent, mallBounds.halfExtent),
        0,
        randomRange(-mallBounds.halfExtent, mallBounds.halfExtent)
      );
      if (Math.hypot(candidate.x, candidate.z) < mallBounds.clearRadius + 1.5)
        continue;
      if (Math.abs(candidate.x) < 5 && Math.abs(candidate.z) < 10) continue;
      if (isPositionFree(candidate, minDistance)) {
        return candidate;
      }
    }
    return new Vector3(
      randomRange(-mallBounds.halfExtent, mallBounds.halfExtent),
      0,
      randomRange(-mallBounds.halfExtent, mallBounds.halfExtent)
    );
  }

  function clampToPlayableArea(candidate, padding = 2.5) {
    const clamped = candidate.clone();
    const maxExtent = Math.max(2, mallBounds.halfExtent - padding);
    clamped.x = Math.min(maxExtent, Math.max(-maxExtent, clamped.x));
    clamped.z = Math.min(maxExtent, Math.max(-maxExtent, clamped.z));
    clamped.y = 0;
    return clamped;
  }

  function enforceCentralClearance(candidate, clearance) {
    const minimumRadius = Math.max(0, clearance);
    const planarDistance = Math.hypot(candidate.x, candidate.z);
    if (planarDistance < minimumRadius) {
      const targetRadius = minimumRadius;
      const safeAngle =
        planarDistance < 1e-4
          ? Math.random() * Math.PI * 2
          : Math.atan2(candidate.z, candidate.x);
      candidate.x = Math.cos(safeAngle) * targetRadius;
      candidate.z = Math.sin(safeAngle) * targetRadius;
    }
    return candidate;
  }

  function findNearestNavigablePoint(target, minDistance = 4, options = {}) {
    const ignoreBodies = options.ignoreBodies ?? null;
    const clearance = options.clearance ?? 1.5;
    const padding = options.padding ?? Math.max(2.5, minDistance * 0.6);
    const searchRadii = options.searchRadii ?? [
      minDistance,
      minDistance * 1.5,
      minDistance * 2,
      minDistance * 2.5,
      minDistance * 3,
    ];

    const base = enforceCentralClearance(
      clampToPlayableArea(target, padding),
      mallBounds.clearRadius + clearance
    );
    if (isPositionFree(base, minDistance, { ignoreBodies })) {
      return base;
    }

    for (const radius of searchRadii) {
      const steps = Math.max(10, Math.round(radius * 4));
      for (let i = 0; i < steps; i += 1) {
        const angle = (i / steps) * Math.PI * 2;
        const offset = new Vector3(
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius
        );
        const candidate = enforceCentralClearance(
          clampToPlayableArea(base.clone().add(offset), padding),
          mallBounds.clearRadius + clearance
        );
        if (isPositionFree(candidate, minDistance, { ignoreBodies })) {
          return candidate;
        }
      }
    }

    return findSpawnPosition(minDistance);
  }

  return {
    isPositionFree,
    findSpawnPosition,
    clampToPlayableArea,
    enforceCentralClearance,
    findNearestNavigablePoint,
  };
}

// Spawning + hit-response logic (extracted from mall.js)
function mountRecordToScene({ record, scene, chunkKey, ensureChunk }) {
  if (!ensureChunk) {
    scene.add(record.mesh);
    return;
  }
  const container = ensureChunk(chunkKey);
  container.group.add(record.mesh);
}

function applyHumanHitImpulse(record, hitterBody) {
  const launch = new Vec3(
    record.body.position.x - (hitterBody ? hitterBody.position.x : 0),
    0,
    record.body.position.z - (hitterBody ? hitterBody.position.z : 0),
  );
  if (launch.lengthSquared() < 0.01) {
    launch.set(Math.random() - 0.5, 0, Math.random() - 0.5);
  }
  launch.normalize();
  record.body.angularDamping = 0.08;
  record.body.linearDamping = 0.05;
  record.body.applyImpulse(launch.scale(12), record.body.position);
  record.body.applyImpulse(new Vec3(0, 8, 0), record.body.position);
  return 1600;
}

function applyPropHitImpulse(record, hitterBody) {
  if (!hitterBody) return;
  const push = new Vec3(
    record.body.position.x - hitterBody.position.x,
    0.2,
    record.body.position.z - hitterBody.position.z,
  );
  if (push.lengthSquared() > 0.01) {
    push.normalize();
    record.body.applyImpulse(push.scale(6), record.body.position);
  }
}

function cleanupRecord({ scene, world, record, interactables, dynamicActors }) {
  world.removeBody(record.body);
  if (!record.chunkKey) {
    scene.remove(record.mesh);
  } else {
    const container = chunksApi.peek(record.chunkKey);
    if (container) {
      container.group.remove(record.mesh);
      container.records?.delete?.(record);
      container.bodies?.delete?.(record.body);
    } else {
      scene.remove(record.mesh);
    }
  }
  record.body.userData = undefined;

  const i = interactables.indexOf(record);
  if (i !== -1) interactables.splice(i, 1);
  const di = dynamicActors.indexOf(record);
  if (di !== -1) dynamicActors.splice(di, 1);

  if (typeof record.respawn === 'function') {
    const delay = randomRange(1500, 4200);
    setTimeout(() => record.respawn(), delay);
  }
}

export const mallSpawning = {
  registerInteractable({
    opts,
    scene, world, materials,
    interactables, dynamicActors,
    chunking,
  }) {
    const {
      mesh, body, label, points = 0, type,
      respawn, onUpdate, fatal = false, mixer = null, chunkKey = null,
    } = opts;

    const record = {
      mesh,
      body,
      label,
      points,
      type,
      respawn: respawn ?? null,
      hit: false,
      onUpdate: onUpdate ?? null,
      fatal,
      mixer,
      chunkKey: null,
    };

    body.userData = record;
    if (materials) {
      if (body.mass === 0 && materials.ground) {
        body.material = materials.ground;
      } else if (body.mass > 0 && materials.dynamic) {
        body.material = materials.dynamic;
      }
    }

    interactables.push(record);
    if (record.onUpdate) dynamicActors.push(record);

    if (chunking?.chunkedStreamingEnabled?.()) {
      const key = chunkKey ?? `${Math.floor(body.position.x / 48)},${Math.floor(body.position.z / 48)}`;
      record.chunkKey = key;
      mountRecordToScene({ record, scene, chunkKey: key, ensureChunk: chunking.ensureChunk });
    } else {
      scene.add(mesh);
    }
    world.addBody(body);
    return record;
  },

  createHitHandlers({ scene, world, interactables, dynamicActors }) {
    function queueCleanup(record, delay = 0) {
      if (delay <= 0) {
        cleanupRecord({ scene, world, record, interactables, dynamicActors });
      } else {
        setTimeout(() => cleanupRecord({ scene, world, record, interactables, dynamicActors }), delay);
      }
    }

    function handleHit(record, hitterBody) {
      if (!record || typeof record !== 'object') {
        warnOnce('mall:handleHit:invalidRecord', '[mall.handleHit] Record missing or not an object.');
        return null;
      }
      if (record.hit) return null;
      record.hit = true;

      if (!record.body || typeof record.body.applyImpulse !== 'function') {
        warnOnce(
          'mall:handleHit:missingBody',
          '[mall.handleHit] Record is missing a physics body or applyImpulse().',
          { label: record.label ?? record.type ?? 'unknown' },
        );
        return null;
      }
      if (!record.type) {
        warnOnce('mall:handleHit:missingType', '[mall.handleHit] Record is missing a type.', { label: record.label ?? 'unknown' });
        return null;
      }
      let cleanupDelay = 0;
      if (record.type === INTERACTABLE_TYPES?.HUMAN || record.type === "human") {
        cleanupDelay = applyHumanHitImpulse(record, hitterBody);
      } else if (record.type === INTERACTABLE_TYPES?.PROP || record.type === "prop") {
        applyPropHitImpulse(record, hitterBody);
      }
      queueCleanup(record, cleanupDelay);
      return record;
    }

    return { handleHit, queueCleanup };
  },
};

// Increased to give the enlarged mall asset plenty of room for walls/streaming
const DEFAULT_HALF_EXTENT = 160;
const mallBounds = { halfExtent: DEFAULT_HALF_EXTENT, clearRadius: 10 };

export function createMall({ world, scene, assets = {}, materials = {} } = {}) {
  const interactables = [];
  const dynamicActors = [];
  let decorBuilt = false;
  let hazardsPrepared = false;
  const useMallAsset = Boolean(assets.mallScene);
  const kioskFactory =
    typeof assets.makeKioskInstance === "function"
      ? assets.makeKioskInstance.bind(assets)
      : null;
  const columnFactory =
    typeof assets.makeColumnInstance === "function"
      ? assets.makeColumnInstance.bind(assets)
      : null;
  const bannerFactory =
    typeof assets.makeBannerInstance === "function"
      ? assets.makeBannerInstance.bind(assets)
      : null;

  const {
    ensureChunk,
    unloadChunk,
    chunkedStreamingEnabled,
    setChunkingConfig,
    getChunkSize,
  } = initChunking(scene, world);

  function registerInteractable({
    mesh,
    body,
    label,
    points = 0,
    type,
    respawn,
    onUpdate,
    fatal = false,
    mixer = null,
    // optional: chunk routing
    chunkKey = null,
  }) {
    const record = {
      mesh,
      body,
      label,
      points,
      type,
      respawn: respawn ?? null,
      hit: false,
      onUpdate: onUpdate ?? null,
      fatal,
      mixer,
      chunkKey: null,
    };
    body.userData = record;
    if (materials) {
      if (body.mass === 0 && materials.ground) {
        body.material = materials.ground;
      } else if (body.mass > 0 && materials.dynamic) {
        body.material = materials.dynamic;
      }
    }
    interactables.push(record);
    if (record.onUpdate) {
      dynamicActors.push(record);
    }
    // Route to chunk group if chunking is enabled
    if (chunkedStreamingEnabled()) {
      const key =
        chunkKey ?? getChunkKeyForPosition(body.position.x, body.position.z);
      record.chunkKey = key;
      const container = ensureChunk(key);
      container.group.add(mesh);
    } else {
      scene.add(mesh);
    }
    world.addBody(body);
    return record;
  }

  initSpawnContext({
    world,
    scene,
    assets,
    materials,
    mallBounds,
    getChunkKeyForPosition,
    registerInteractable,
    propMaterials,
  });

  function isPositionFree(pos, minDistance, options = {}) {
    const minDistanceSq = minDistance * minDistance;
    const ignoreBodies = Array.isArray(options.ignoreBodies)
      ? new Set(options.ignoreBodies)
      : options.ignoreBodies instanceof Set
      ? options.ignoreBodies
      : null;
    for (const record of interactables) {
      if (ignoreBodies && ignoreBodies.has(record.body)) continue;
      const dx = record.body.position.x - pos.x;
      const dz = record.body.position.z - pos.z;
      if (dx * dx + dz * dz < minDistanceSq) {
        return false;
      }
    }
    return true;
  }

  function findSpawnPosition(minDistance = 4) {
    // I just keep rerolling positions until I find a clear spot.
    const attempts = 24;
    for (let i = 0; i < attempts; i += 1) {
      const candidate = new Vector3(
        randomRange(-mallBounds.halfExtent, mallBounds.halfExtent),
        0,
        randomRange(-mallBounds.halfExtent, mallBounds.halfExtent)
      );
      if (Math.hypot(candidate.x, candidate.z) < mallBounds.clearRadius + 1.5)
        continue;
      if (Math.abs(candidate.x) < 5 && Math.abs(candidate.z) < 10) continue;
      if (isPositionFree(candidate, minDistance)) {
        return candidate;
      }
    }
    return new Vector3(
      randomRange(-mallBounds.halfExtent, mallBounds.halfExtent),
      0,
      randomRange(-mallBounds.halfExtent, mallBounds.halfExtent)
    );
  }

  function clampToPlayableArea(candidate, padding = 2.5) {
    const clamped = candidate.clone();
    const maxExtent = Math.max(2, mallBounds.halfExtent - padding);
    clamped.x = Math.min(maxExtent, Math.max(-maxExtent, clamped.x));
    clamped.z = Math.min(maxExtent, Math.max(-maxExtent, clamped.z));
    clamped.y = 0;
    return clamped;
  }

  function enforceCentralClearance(candidate, clearance) {
    const minimumRadius = Math.max(0, clearance);
    const planarDistance = Math.hypot(candidate.x, candidate.z);
    if (planarDistance < minimumRadius) {
      const targetRadius = minimumRadius;
      const safeAngle =
        planarDistance < 1e-4
          ? Math.random() * Math.PI * 2
          : Math.atan2(candidate.z, candidate.x);
      candidate.x = Math.cos(safeAngle) * targetRadius;
      candidate.z = Math.sin(safeAngle) * targetRadius;
    }
    return candidate;
  }

  function findNearestNavigablePoint(target, minDistance = 4, options = {}) {
    const ignoreBodies = options.ignoreBodies ?? null;
    const clearance = options.clearance ?? 1.5;
    const padding = options.padding ?? Math.max(2.5, minDistance * 0.6);
    const searchRadii = options.searchRadii ?? [
      minDistance,
      minDistance * 1.5,
      minDistance * 2,
      minDistance * 2.5,
      minDistance * 3,
    ];

    const base = enforceCentralClearance(
      clampToPlayableArea(target, padding),
      mallBounds.clearRadius + clearance
    );
    if (isPositionFree(base, minDistance, { ignoreBodies })) {
      return base;
    }

    for (const radius of searchRadii) {
      const steps = Math.max(10, Math.round(radius * 4));
      for (let i = 0; i < steps; i += 1) {
        const angle = (i / steps) * Math.PI * 2;
        const offset = new Vector3(
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius
        );
        const candidate = enforceCentralClearance(
          clampToPlayableArea(base.clone().add(offset), padding),
          mallBounds.clearRadius + clearance
        );
        if (isPositionFree(candidate, minDistance, { ignoreBodies })) {
          return candidate;
        }
      }
    }

    return findSpawnPosition(minDistance);
  }

  const spawnDefinitions = [
    {
      key: "planter",
      min: 16,
      max: 22,
      distance: 4,
      spawn: (p) => spawnPlanter(p),
    },
    {
      key: "bench",
      min: 12,
      max: 18,
      distance: 5,
      spawn: (p) => spawnBench(p),
    },
    { key: "kiosk", min: 7, max: 10, distance: 6, spawn: (p) => spawnKiosk(p) },
    {
      key: "trash",
      min: 10,
      max: 16,
      distance: 4,
      spawn: (p) => spawnTrashCan(p),
    },
    {
      key: "poster",
      min: 8,
      max: 12,
      distance: 4.5,
      spawn: (p) => spawnPosterStand(p),
    },
    {
      key: "boxstack",
      min: 10,
      max: 16,
      distance: 3.8,
      spawn: (p) => spawnBoxStack(p),
    },
    {
      key: "patron",
      min: 6,
      max: 10,
      distance: 5,
      spawn: (p) => spawnMallPatron(p),
    },
  ];
  const hazardSpawners = [
    spawnSecurityGate,
    spawnCleaningRobot,
    spawnMaintenanceBarrier,
  ];

  function populate(options = {}) {
    const mode = options.mode ?? (useMallAsset ? "static" : "default");

    if (!decorBuilt) {
      if (!useMallAsset) {
        buildMallDecor(scene, mallBounds, propMaterials);
        spawnColumnRing(scene, assets, materials);
        spawnHangingBanners(scene, assets, materials);
      }
      decorBuilt = true;
    }

    if (!hazardsPrepared) {
      spawnMallBoundaries(
        scene,
        world,
        materials,
        mallBounds,
        getChunkKeyForPosition,
        registerInteractable
      );
      hazardsPrepared = true;
    }

    if (mode === "static" && useMallAsset) {
      return;
    }

    for (const definition of spawnDefinitions) {
      const total = randomInt(definition.min, definition.max);
      for (let i = 0; i < total; i += 1) {
        const position = findSpawnPosition(definition.distance);
        definition.spawn(position);
      }
    }
    const hazardCount = randomInt(4, 6);
    for (let i = 0; i < hazardCount; i += 1) {
      const hazardSpawner = choose(hazardSpawners);
      hazardSpawner();
    }
  }

  function cleanup(record) {
    // Remove meshes/bodies once the scooter smacks them.
    world.removeBody(record.body);
    if (!record.chunkKey) {
      scene.remove(record.mesh);
    } else {
      const container = chunksApi.peek(record.chunkKey);
      if (container) {
        container.group.remove(record.mesh);
        container.records?.delete?.(record);
        container.bodies?.delete?.(record.body);
      } else {
        scene.remove(record.mesh);
      }
    }
    record.body.userData = undefined;

    const index = interactables.indexOf(record);
    if (index !== -1) {
      interactables.splice(index, 1);
    }

    const dynamicIndex = dynamicActors.indexOf(record);
    if (dynamicIndex !== -1) {
      dynamicActors.splice(dynamicIndex, 1);
    }

    if (typeof record.respawn === "function") {
      const delay = randomRange(1500, 4200);
      setTimeout(() => {
        record.respawn();
      }, delay);
    }
  }

  function queueCleanup(record, delay = 0) {
    if (delay <= 0) {
      cleanup(record);
    } else {
      setTimeout(() => cleanup(record), delay);
    }
  }

  function handleHit(record, hitterBody) {
    if (!record || typeof record !== "object") {
      warnOnce(
        "mall:handleHit:invalidRecord",
        "[mall.handleHit] Record missing or not an object."
      );
      return null;
    }
    // Mark it as hit so we don't double count.
    if (record.hit) return null;
    record.hit = true;

    if (!record.body || typeof record.body.applyImpulse !== "function") {
      warnOnce(
        "mall:handleHit:missingBody",
        "[mall.handleHit] Record is missing a physics body or applyImpulse().",
        { label: record.label ?? record.type ?? "unknown" }
      );
      return null;
    }

    if (!record.type) {
      warnOnce(
        "mall:handleHit:missingType",
        "[mall.handleHit] Record is missing a type; skipping hit response.",
        { label: record.label ?? "unknown" }
      );
      return null;
    }

    let cleanupDelay = 0;

    if (record.type === INTERACTABLE_TYPES.HUMAN) {
      cleanupDelay = applyHumanHitImpulse(record, hitterBody);
    } else if (record.type === INTERACTABLE_TYPES.PROP) {
      applyPropHitImpulse(record, hitterBody);
    }

    queueCleanup(record, cleanupDelay);

    return record;

    // Small helpers to keep handleHit() simple and readable
    function applyHumanHitImpulse(record, hitterBody) {
      const launch = new Vec3(
        record.body.position.x - (hitterBody ? hitterBody.position.x : 0),
        0,
        record.body.position.z - (hitterBody ? hitterBody.position.z : 0)
      );
      if (launch.lengthSquared() < 0.01) {
        launch.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      }
      launch.normalize();
      record.body.angularDamping = 0.08;
      record.body.linearDamping = 0.05;
      record.body.applyImpulse(launch.scale(12), record.body.position);
      record.body.applyImpulse(new Vec3(0, 8, 0), record.body.position);
      return 1600;
    }
    function applyPropHitImpulse(record, hitterBody) {
      if (!hitterBody) return;
      const push = new Vec3(
        record.body.position.x - hitterBody.position.x,
        0.2,
        record.body.position.z - hitterBody.position.z
      );
      if (push.lengthSquared() > 0.01) {
        push.normalize();
        record.body.applyImpulse(push.scale(6), record.body.position);
      }
    }
  }

  function addPatrons(count = 12) {
    const n = Math.max(0, Math.floor(count));
    for (let i = 0; i < n; i += 1) {
      spawnMallPatron();
    }
  }

  return {
    populate,
    addPatrons,
    sync(delta) {
      // Stream chunks around player if enabled (based on scooter body or camera target)
      if (
        chunkedStreamingEnabled() &&
        typeof this.getPlayerPosition === "function"
      ) {
        const p = this.getPlayerPosition();
        if (p) {
          updateChunkStreaming(p.x, p.z);
        }
      }
      for (const record of interactables) {
        record.mesh.position.set(
          record.body.position.x,
          record.body.position.y,
          record.body.position.z
        );
        record.mesh.quaternion.set(
          record.body.quaternion.x,
          record.body.quaternion.y,
          record.body.quaternion.z,
          record.body.quaternion.w
        );
        if (record.mixer && !record.hit) {
          record.mixer.update(delta);
        }
      }

      for (const actor of dynamicActors) {
        if (!actor.hit && actor.onUpdate) {
          actor.onUpdate(delta, actor);
        }
      }
    },
    handleCollision(body, hitterBody) {
      const record = body?.userData;
      if (!record) return null;
      if (typeof record !== "object") {
        warnOnce(
          "mall:handleCollision:invalidRecord",
          "[mall.handleCollision] Expected body.userData to be an object.",
          { bodyId: body?.id }
        );
        return null;
      }
      if (record.fatal) {
        return {
          kind: "fatal",
          label: record.label ?? "Hazard",
        };
      }
      const hit = handleHit(record, hitterBody);
      return hit
        ? {
            kind: "score",
            label: hit.label ?? "Hit",
            points: hit.points ?? 0,
          }
        : null;
    },
    findNearestNavigablePoint,
    isPositionNavigable(position, minDistance = 4, options = {}) {
      return isPositionFree(position, minDistance, options);
    },
    // Public controls for map size and streaming knobs
    setMapSize({ halfExtent } = {}) {
      if (
        typeof halfExtent === "number" &&
        isFinite(halfExtent) &&
        halfExtent > 10
      ) {
        mallBounds.halfExtent = halfExtent;
      }
    },
    setChunking({ size, radius, enabled } = {}) {
      setChunkingConfig({ size, radius, enabled });
    },
    setPlayerLocator(fn) {
      this.getPlayerPosition = typeof fn === "function" ? fn : null;
    },
    getPlayerPosition: null,
  };
}
  Box3,
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

const TARGET_SCOOTER_SIZE = new Vector3(0.5, 0.9, 1.05);

export function buildFallbackScooterMesh() {
  const scooterGroup = new Group();
  scooterGroup.name = 'scooter';

  const primaryPaint = new MeshStandardMaterial({ color: '#f0567d', metalness: 0.3, roughness: 0.55 });
  const accentPaint = new MeshStandardMaterial({ color: '#292d36', roughness: 0.9 });
  const polishedMetal = new MeshStandardMaterial({ color: '#d7d9dc', metalness: 1, roughness: 0.25 });
  const seatMaterial = new MeshStandardMaterial({ color: '#4b3f3a', roughness: 0.7 });
  const skinMaterial = new MeshStandardMaterial({ color: '#f7d7c4', roughness: 0.6 });
  const fabricMaterial = new MeshStandardMaterial({ color: '#78b0a0', roughness: 0.8 });
  const hairMaterial = new MeshStandardMaterial({ color: '#dad0c6', roughness: 0.4 });
  const glassMaterial = new MeshStandardMaterial({
    color: '#fff7c7',
    emissive: '#ffd36e',
    emissiveIntensity: 0.6,
    roughness: 0.3,
  });

  const deck = new Mesh(new BoxGeometry(0.6, 0.12, 1.8), primaryPaint);
  deck.position.set(0, -0.35, -0.1);
  scooterGroup.add(deck);

  const wheelGeometry = new CylinderGeometry(0.35, 0.35, 0.2, 24);
  wheelGeometry.rotateZ(Math.PI / 2);

  const rearWheel = new Mesh(wheelGeometry, accentPaint);
  rearWheel.position.set(0, -0.35, -1.05);
  scooterGroup.add(rearWheel);

  const frontWheel = rearWheel.clone();
  frontWheel.position.z = 1.15;
  scooterGroup.add(frontWheel);

  rearWheel.name = 'rearWheel';
  frontWheel.name = 'frontWheel';

  const hubGeometry = new CylinderGeometry(0.12, 0.12, 0.24, 16);
  hubGeometry.rotateZ(Math.PI / 2);

  const rearHub = new Mesh(hubGeometry, polishedMetal);
  rearHub.position.copy(rearWheel.position);
  scooterGroup.add(rearHub);

  const frontHub = rearHub.clone();
  frontHub.position.z = frontWheel.position.z;
  scooterGroup.add(frontHub);

  rearHub.name = 'rearHub';
  frontHub.name = 'frontHub';

  const frontFork = new Mesh(new BoxGeometry(0.12, 0.9, 0.24), polishedMetal);
  frontFork.position.set(0, -0.05, 1.05);
  scooterGroup.add(frontFork);
  frontFork.name = 'fork';

  const seatPost = new Mesh(new CylinderGeometry(0.07, 0.07, 0.9, 16), polishedMetal);
  seatPost.position.set(0, 0.1, -0.55);
  scooterGroup.add(seatPost);

  const seat = new Mesh(new BoxGeometry(0.36, 0.09, 0.42), seatMaterial);
  seat.position.set(0, 0.58, -0.55);
  seat.name = 'seat';
  scooterGroup.add(seat);

  const steeringColumn = new Mesh(new CylinderGeometry(0.08, 0.08, 1.5, 20), polishedMetal);
  steeringColumn.position.set(0, 0.42, 0.6);
  steeringColumn.rotation.x = -Math.PI / 10;
  scooterGroup.add(steeringColumn);

  const handlebarGeometry = new CylinderGeometry(0.05, 0.05, 0.65, 18);
  handlebarGeometry.rotateZ(Math.PI / 2);
  const handlebar = new Mesh(handlebarGeometry, polishedMetal);
  handlebar.position.set(0, 1.08, 0.22);
  scooterGroup.add(handlebar);
  handlebar.name = 'handlebar';

  const gripGeometry = new CylinderGeometry(0.07, 0.07, 0.14, 12);
  gripGeometry.rotateZ(Math.PI / 2);
  const leftGrip = new Mesh(gripGeometry, primaryPaint);
  leftGrip.position.set(0.33, 1.08, 0.22);
  scooterGroup.add(leftGrip);
  const rightGrip = leftGrip.clone();
  rightGrip.position.x = -leftGrip.position.x;
  scooterGroup.add(rightGrip);
  leftGrip.name = 'leftGrip';
  rightGrip.name = 'rightGrip';

  const headlight = new Mesh(new SphereGeometry(0.12, 16, 16), glassMaterial);
  headlight.position.set(0, 0.35, 1.25);
  scooterGroup.add(headlight);

  const grandma = new Group();
  grandma.position.set(0, 0.25, -0.55);
  const skirt = new Mesh(new CylinderGeometry(0.28, 0.36, 0.5, 24), fabricMaterial);
  skirt.position.set(0, 0.15, 0);
  grandma.add(skirt);
  const torso = new Mesh(new CylinderGeometry(0.22, 0.22, 0.4, 20), primaryPaint);
  torso.position.set(0, 0.55, 0);
  grandma.add(torso);
  const head = new Mesh(new SphereGeometry(0.18, 20, 20), skinMaterial);
  head.position.set(0, 0.92, 0.06);
  grandma.add(head);
  const bun = new Mesh(new SphereGeometry(0.12, 16, 16), hairMaterial);
  bun.position.set(0, 1.08, -0.05);
  grandma.add(bun);

  const armGeometry = new CylinderGeometry(0.06, 0.06, 0.5, 16);
  const leftArm = new Mesh(armGeometry, primaryPaint);
  leftArm.position.set(0.18, 0.68, 0.2);
  leftArm.rotation.set(-Math.PI / 2.4, Math.PI / 14, Math.PI / 8);
  grandma.add(leftArm);
  const rightArm = leftArm.clone();
  rightArm.position.x = -leftArm.position.x;
  rightArm.rotation.set(-Math.PI / 2.4, -Math.PI / 14, -Math.PI / 8);
  grandma.add(rightArm);

  const handGeometry = new SphereGeometry(0.07, 12, 12);
  const leftHand = new Mesh(handGeometry, skinMaterial);
  leftHand.position.set(0.34, 0.94, 0.2);
  scooterGroup.add(leftHand);
  const rightHand = leftHand.clone();
  rightHand.position.x = -leftHand.position.x;
  scooterGroup.add(rightHand);

  function createLeg(side) {
    const legGroup = new Group();
    const thigh = new Mesh(new CylinderGeometry(0.11, 0.12, 0.5, 16), fabricMaterial);
    thigh.position.set(0, 0.1, 0.12);
    thigh.rotation.x = Math.PI / 2.1;
    legGroup.add(thigh);
    const calf = new Mesh(new CylinderGeometry(0.09, 0.09, 0.42, 16), fabricMaterial);
    calf.position.set(0, -0.12, 0.48);
    calf.rotation.x = Math.PI / 2.8;
    legGroup.add(calf);
    const foot = new Mesh(new BoxGeometry(0.26, 0.1, 0.42), accentPaint);
    foot.position.set(0, -0.28, 0.7);
    foot.rotation.x = Math.PI / 14;
    legGroup.add(foot);
    legGroup.position.set(0.14 * side, -0.12, 0.12);
    legGroup.rotation.y = (side * Math.PI) / 28;
    return legGroup;
  }
  grandma.add(createLeg(1));
  grandma.add(createLeg(-1));

  const cane = new Mesh(new CylinderGeometry(0.03, 0.03, 0.8, 12), new MeshStandardMaterial({ color: '#a77855', roughness: 0.9 }));
  cane.position.set(0.38, 0.22, 0.65);
  cane.rotation.set(Math.PI / 2.8, 0, Math.PI / 8);
  scooterGroup.add(cane);
  const caneTip = new Mesh(new SphereGeometry(0.05, 10, 10), accentPaint);
  caneTip.position.set(0.56, -0.24, 0.85);
  scooterGroup.add(caneTip);
  scooterGroup.add(grandma);

  scooterGroup.updateMatrixWorld(true);
  const fallbackBounds = new Box3().setFromObject(scooterGroup);
  const fallbackSize = fallbackBounds.getSize(new Vector3());
  const fallbackScale = fallbackSize.z > 0 ? TARGET_SCOOTER_SIZE.z / fallbackSize.z : 1;
  scooterGroup.scale.setScalar(fallbackScale);
  scooterGroup.updateMatrixWorld(true);
  const normalizedBounds = new Box3().setFromObject(scooterGroup);
  const normalizedCenter = normalizedBounds.getCenter(new Vector3());
  scooterGroup.position.sub(normalizedCenter);
  scooterGroup.position.y -= normalizedBounds.min.y;

  const wheelsMeta = scooterGroup.userData.wheels || {};
  wheelsMeta.frontWheel = wheelsMeta.frontWheel || frontWheel;
  wheelsMeta.rearWheel = wheelsMeta.rearWheel || rearWheel;
  wheelsMeta.fork = wheelsMeta.fork || frontFork;
  wheelsMeta.handlebar = wheelsMeta.handlebar || handlebar;
  wheelsMeta.frontRadius = computeWheelRadius(wheelsMeta.frontWheel) ?? wheelsMeta.frontRadius ?? 0.18;
  wheelsMeta.rearRadius = computeWheelRadius(wheelsMeta.rearWheel) ?? wheelsMeta.rearRadius ?? 0.18;
  scooterGroup.userData.wheels = wheelsMeta;
  return scooterGroup;
}

export function findWheelsAndSteering(root) {
  const result = { frontWheel: null, rearWheel: null, fork: null, handlebar: null };
  const wheelCandidates = [];
  const forkCandidates = [];
  const handleCandidates = [];
  root.traverse((obj) => {
    const name = (obj?.name || '').toLowerCase();
    if (!name) return;
    // Wheels: accept "wheel", and be lenient with spelling/aliases
    if (name.includes('wheel') || name.includes('tyre') || name.includes('tire')) wheelCandidates.push(obj);
    // Fork/steering column synonyms
    if (name.includes('fork') || name.includes('steer') || name.includes('stem') || name.includes('tiller') || name.includes('column')) forkCandidates.push(obj);
    // Handle/handlebar synonyms
    if (name.includes('handle') || name.includes('bar') || name.includes('handlebar') || name.includes('grip')) handleCandidates.push(obj);
  });

  if (wheelCandidates.length >= 2) {
    wheelCandidates.sort((a, b) => (a.position?.z ?? 0) - (b.position?.z ?? 0));
    result.rearWheel = wheelCandidates[0];
    result.frontWheel = wheelCandidates[wheelCandidates.length - 1];
  } else if (wheelCandidates.length === 1) {
    result.frontWheel = wheelCandidates[0];
  }

  // Prefer explicit matches if present
  result.fork = forkCandidates[0] || null;
  result.handlebar = handleCandidates[0] || null;

  // Graceful fallbacks: if steering parts are missing, steer using the front wheel (or its parent) as a pivot
  if (!result.fork && result.frontWheel) {
    result.fork = result.frontWheel.parent || result.frontWheel;
  }
  if (!result.handlebar && result.fork) {
    result.handlebar = result.fork;
  }

  return result;
}

export function computeWheelRadius(object3d) {
  if (!object3d) return null;
  const bounds = new Box3().setFromObject(object3d);
  const size = bounds.getSize(new Vector3());
  const diameter = Math.max(size.x, size.y);
  return diameter > 0 ? diameter / 2 : null;
}

export function findSeatAnchor(root) {
  let seatNode = null;
  root.traverse((obj) => {
    const name = (obj?.name || '').toLowerCase();
    if (!name) return;
    if (!seatNode && (name.includes('seat') || name.includes('saddle'))) {
      seatNode = obj;
    }
  });
  if (seatNode) {
    const b = new Box3().setFromObject(seatNode);
    const c = b.getCenter(new Vector3());
    c.y = b.max.y + 0.01;
    return c;
  }
  const bounds = new Box3().setFromObject(root);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  return new Vector3(center.x, bounds.min.y + size.y * 0.62, center.z - size.z * 0.18);
}

const SCOOTER_DIMENSIONS = {
  width: 0.5,
  height: 0.9,
  length: 1.05,
};
const TARGET_SCOOTER_SIZE = new Vector3(
  SCOOTER_DIMENSIONS.width,
  SCOOTER_DIMENSIONS.height,
  SCOOTER_DIMENSIONS.length
);
const TARGET_RIDER_HEIGHT = 0.82;

function getBoneDescriptors() {
  return [
    { key: "hip", name: "CC_Base_Hip_02", critical: true },
    { key: "spine", name: "CC_Base_Spine01_034", critical: true },
    { key: "head", name: "CC_Base_Head_038", critical: true },
    { key: "leftThigh", name: "CC_Base_L_Thigh_04" },
    { key: "leftCalf", name: "CC_Base_L_Calf_05" },
    { key: "leftFoot", name: "CC_Base_L_Foot_06" },
    { key: "rightThigh", name: "CC_Base_R_Thigh_018" },
    { key: "rightCalf", name: "CC_Base_R_Calf_019" },
    { key: "rightFoot", name: "CC_Base_R_Foot_021" },
    { key: "leftUpperArm", name: "CC_Base_L_Upperarm_050" },
    { key: "leftForearm", name: "CC_Base_L_Forearm_051" },
    { key: "leftHand", name: "CC_Base_L_Hand_055" },
    { key: "rightUpperArm", name: "CC_Base_R_Upperarm_078" },
    { key: "rightForearm", name: "CC_Base_R_Forearm_079" },
    { key: "rightHand", name: "CC_Base_R_Hand_083" },
  ];
}

function validateAndCollectBones(rider) {
  const boneDescriptors = getBoneDescriptors();
  const bones = {};
  const descriptorNameByKey = {};
  const missingCritical = [];

  boneDescriptors.forEach((descriptor) => {
    descriptorNameByKey[descriptor.key] = descriptor.name;
    const node = rider.getObjectByName(descriptor.name);
    bones[descriptor.key] = node;
    if (!node && descriptor.critical) {
      missingCritical.push(descriptor.name);
    }
  });

  return { bones, descriptorNameByKey, missingCritical };
}

function applyBasePose(bones) {
  const { hip, spine, head } = bones;
  hip.rotation.x = 0.45;
  hip.position.y -= 0.05;
  spine.rotation.x = -0.35;
  head.rotation.x = 0.12;
}

function applyLimbPoses(bones, descriptorNameByKey) {
  const missingNames = (keys) =>
    keys.filter((key) => !bones[key]).map((key) => descriptorNameByKey[key]);

  function setPoseOrWarn(keys, poseFn, warnKey, warnMsg) {
    const missing = missingNames(keys);
    if (missing.length === 0) {
      poseFn();
    } else {
      warnOnce(warnKey, warnMsg, { bones: missing });
    }
  }

  const {
    leftThigh,
    leftCalf,
    leftFoot,
    rightThigh,
    rightCalf,
    rightFoot,
    leftUpperArm,
    leftForearm,
    leftHand,
    rightUpperArm,
    rightForearm,
    rightHand,
  } = bones;

  setPoseOrWarn(
    ["leftThigh", "leftCalf", "leftFoot"],
    () => {
      leftThigh.rotation.x = 1.65;
      leftCalf.rotation.x = -1.85;
      leftFoot.rotation.x = 0.55;
    },
    "poseRiderForScooter:leftLeg",
    "[poseRiderForScooter] Missing bones for left leg pose."
  );

  setPoseOrWarn(
    ["rightThigh", "rightCalf", "rightFoot"],
    () => {
      rightThigh.rotation.x = 1.65;
      rightCalf.rotation.x = -1.85;
      rightFoot.rotation.x = 0.55;
    },
    "poseRiderForScooter:rightLeg",
    "[poseRiderForScooter] Missing bones for right leg pose."
  );

  setPoseOrWarn(
    ["leftUpperArm", "leftForearm", "leftHand"],
    () => {
      leftUpperArm.rotation.set(-1.35, 0.25, 0.55);
      leftForearm.rotation.x = -0.85;
      leftHand.rotation.x = -0.25;
    },
    "poseRiderForScooter:leftArm",
    "[poseRiderForScooter] Missing bones for left arm pose."
  );

  setPoseOrWarn(
    ["rightUpperArm", "rightForearm", "rightHand"],
    () => {
      rightUpperArm.rotation.set(-1.35, -0.25, -0.55);
      rightForearm.rotation.x = -0.85;
      rightHand.rotation.x = -0.25;
    },
    "poseRiderForScooter:rightArm",
    "[poseRiderForScooter] Missing bones for right arm pose."
  );
}

function poseRiderForScooter(rider) {
  invariant(
    rider && typeof rider.getObjectByName === "function",
    "poseRiderForScooter requires a rider with getObjectByName()."
  );

  const { bones, descriptorNameByKey, missingCritical } =
    validateAndCollectBones(rider);

  if (missingCritical.length > 0) {
    warnOnce(
      "poseRiderForScooter:criticalBones",
      "[poseRiderForScooter] Missing critical rider bones; skipping pose adjustments.",
      { bones: missingCritical }
    );
  } else {
    applyBasePose(bones);
    applyLimbPoses(bones, descriptorNameByKey);
  }
}

function buildScooterMeshFromAssets(assets = {}) {
  invariant(
    assets && typeof assets === "object",
    "buildScooterMeshFromAssets expects an assets object."
  );
  if (!assets.scooterScene) {
    return { group: buildFallbackScooterMesh(), mixers: [] };
  }

  const group = new Group();

  group.name = "scooter";
  const mixers = [];

  invariant(
    assets.scooterScene && typeof assets.scooterScene.traverse === "function",
    "Expected assets.scooterScene to be a THREE.Object3D."
  );
  const scooterRoot = cloneSkeleton(assets.scooterScene);
  scooterRoot.rotation.y = Math.PI;
  scooterRoot.position.set(0, 0, 0);
  scooterRoot.updateMatrixWorld(true);

  const scooterBounds = new Box3().setFromObject(scooterRoot);
  const scooterSize = scooterBounds.getSize(new Vector3());
  const scale = scooterSize.z > 0 ? TARGET_SCOOTER_SIZE.z / scooterSize.z : 1;
  scooterRoot.scale.setScalar(scale);
  scooterRoot.updateMatrixWorld(true);

  const scaledBounds = new Box3().setFromObject(scooterRoot);
  const scaledCenter = scaledBounds.getCenter(new Vector3());
  scooterRoot.position.sub(scaledCenter);
  // Keep model centered at the physics body's origin so visuals match physics.
  // (We no longer raise the model; the physics body spawn height handles ground clearance.)
  scooterRoot.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  group.add(scooterRoot);

  // Collect wheel/steering parts from the imported scooter and compute radii (after scaling)
  const wheelsMetaFromAsset = findWheelsAndSteering(scooterRoot);
  wheelsMetaFromAsset.frontRadius =
    computeWheelRadius(wheelsMetaFromAsset.frontWheel) ??
    wheelsMetaFromAsset.frontRadius ??
    null;
  wheelsMetaFromAsset.rearRadius =
    computeWheelRadius(wheelsMetaFromAsset.rearWheel) ??
    wheelsMetaFromAsset.rearRadius ??
    null;
  group.userData.wheels = wheelsMetaFromAsset;

  const scooterClips = Array.isArray(assets.scooterAnimations)
    ? assets.scooterAnimations
    : [];
  if (scooterClips.length > 0) {
    const scooterMixer = new AnimationMixer(scooterRoot);
    const clip = scooterClips[0];
    const action = scooterMixer.clipAction(clip);
    action.reset();
    action.setLoop(LoopRepeat, Infinity);
    action.play();
    mixers.push(scooterMixer);
  }

  if (assets.riderScene) {
    invariant(
      typeof assets.riderScene.traverse === "function",
      "Expected assets.riderScene to be a THREE.Object3D."
    );
    const rider = cloneSkeleton(assets.riderScene);
    rider.rotation.y = Math.PI;
    rider.position.set(0, 0, 0);
    rider.updateMatrixWorld(true);

    const riderBounds = new Box3().setFromObject(rider);
    const riderSize = riderBounds.getSize(new Vector3());
    const riderScale = riderSize.y > 0 ? TARGET_RIDER_HEIGHT / riderSize.y : 1;
    rider.scale.setScalar(riderScale);
    rider.updateMatrixWorld(true);

    // Temporarily add rider to group to compute world-aligned placement using hip bone
    group.add(rider);
    rider.updateMatrixWorld(true);

    const { bones } = validateAndCollectBones(rider);
    const hip = bones.hip;

    // Compute desired seat anchor in group space and move rider so hip aligns with it
    const seatAnchor = findSeatAnchor(scooterRoot);
    const seatWorld = seatAnchor.clone();
    group.localToWorld(seatWorld);

    const hipWorld = new Vector3();
    if (hip && typeof hip.getWorldPosition === "function") {
      hip.getWorldPosition(hipWorld);
    } else {
      // Fallback to using rider bottom as approximate hip position
      const rb = new Box3().setFromObject(rider);
      const rc = rb.getCenter(new Vector3());
      hipWorld.copy(rc);
      hipWorld.y = rb.min.y + rb.getSize(new Vector3()).y * 0.55;
    }

    const delta = seatWorld.sub(hipWorld);
    rider.position.add(delta);
    rider.updateMatrixWorld(true);

    // Ensure rider sits down onto the seat surface with tiny downward bias if needed
    try {
      const seatNode =
        scooterRoot.getObjectByName("seat") ||
        scooterRoot.getObjectByName("Seat");
      const riderBounds = new Box3().setFromObject(rider);
      const riderBottom = riderBounds.min.y;
      if (seatNode) {
        const seatBounds = new Box3().setFromObject(seatNode);
        const seatTop = seatBounds.max.y;
        const gap = seatTop - riderBottom;
        if (!Number.isNaN(gap)) {
          const nudge = gap - 0.005; // place just on top
          rider.position.y += nudge;
          rider.updateMatrixWorld(true);
        }
      } else {
        // Fallback: use computed seat anchor height even if no explicit seat node exists
        const anchorTop = seatWorld.y;
        const gap = anchorTop - riderBottom;
        if (!Number.isNaN(gap)) {
          const nudge = gap - 0.005;
          rider.position.y += nudge;
          rider.updateMatrixWorld(true);
        }
      }
    } catch (_) {
      /* best effort placement */
    }

    poseRiderForScooter(rider);
    rider.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  return { group, mixers };
}

export function createScooter({ world, material, assets = {} } = {}) {
  invariant(
    world && typeof world.addBody === "function",
    "createScooter requires a physics world with addBody()."
  );
  invariant(
    material === undefined || material === null || typeof material === "object",
    "createScooter expects material to be an object when provided."
  );
  invariant(
    assets && typeof assets === "object",
    "createScooter expects an assets object."
  );

  // Enhanced physics body with better stability
  const body = new Body({
    mass: 35, // Increased mass for better stability
    shape: new CannonBox(
      new Vec3(
        SCOOTER_DIMENSIONS.width / 2,
        SCOOTER_DIMENSIONS.height / 2,
        SCOOTER_DIMENSIONS.length / 2
      )
    ),
    position: new Vec3(0, SCOOTER_DIMENSIONS.height / 2 + 0.1, 0), // Slightly higher spawn
    angularDamping: 0.7, // Increased angular damping for better control
    linearDamping: 0.15, // Reduced linear damping for more responsive movement
  });

  // Enhanced inertia for more realistic physics
  body.updateMassProperties();

  if (material) {
    body.material = material;
  }
  world.addBody(body);

  const { group, mixers } = buildScooterMeshFromAssets(assets);
  const mesh = group;

  let controlsState = { drive: 0, steer: 0 };
  let wheelSpin = 0;
  function updateVisualWheels(delta) {
    const wheels =
      mesh.userData && mesh.userData.wheels ? mesh.userData.wheels : null;
    if (!wheels) return;
    const speed = body.velocity.length();
    if (delta > 0) {
      const radius = wheels.frontRadius || wheels.rearRadius || 0.2;
      if (radius > 0) {
        const distance = speed * delta;
        const dir = (controlsState.drive || 0) < 0 ? -1 : 1;
        const spinDelta = (distance / radius) * dir;
        wheelSpin = (wheelSpin + spinDelta) % (Math.PI * 2);
        if (wheels.frontWheel) wheels.frontWheel.rotation.x -= spinDelta;
        if (wheels.rearWheel) wheels.rearWheel.rotation.x -= spinDelta;
      }
    }
    const steerAngle = (controlsState.steer || 0) * 0.35;
    if (wheels.fork) wheels.fork.rotation.y = steerAngle;
    if (wheels.handlebar) wheels.handlebar.rotation.y = steerAngle;
    if (wheels.frontWheel) wheels.frontWheel.rotation.y = steerAngle;
  }

  return {
    mesh,
    body,
    setControlsState(next) {
      if (next && typeof next === "object") {
        controlsState = { ...controlsState, ...next };
      }
    },
    sync(delta = 0) {
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
      if (delta > 0 && Array.isArray(mixers)) {
        for (const mixer of mixers) {
          mixer.update(delta);
        }
      }
      updateVisualWheels(delta);
    },
  };
}
// Simple visual debug markers for spawn/floor diagnostics
// Toggle via window.DEBUG_SPAWN or call setEnabled(true)
export function createDebugMarkers(scene) {
  const root = new Group();
  root.name = "debug-markers";
  scene.add(root);

  let enabled = false;

  // Reusable objects
  const spawnMat = new MeshBasicMaterial({ color: 0x00ff55, depthTest: false });
  const hitMat = new MeshBasicMaterial({ color: 0xff3344, depthTest: false });
  const lineMat = new LineBasicMaterial({ color: 0xff3344, depthTest: false });
  const wireMat = new LineBasicMaterial({ color: 0x3399ff, depthTest: true });

  let spawnSphere = null;
  let hitSphere = null;
  let hitLine = null;
  let slabWire = null;

  function ensureSpawnSphere() {
    if (!spawnSphere) {
      spawnSphere = new Mesh(new SphereGeometry(0.15, 12, 8), spawnMat);
      spawnSphere.renderOrder = 9999;
      root.add(spawnSphere);
    }
  }

  function ensureHitSphere() {
    if (!hitSphere) {
      hitSphere = new Mesh(new SphereGeometry(0.12, 10, 8), hitMat);
      hitSphere.renderOrder = 9999;
      root.add(hitSphere);
    }
  }

  function ensureHitLine() {
    if (!hitLine) {
      const geom = new BufferGeometry();
      geom.setAttribute(
        "position",
        new Float32BufferAttribute(new Float32Array(6), 3)
      );
      hitLine = new Line(geom, lineMat);
      hitLine.renderOrder = 9999;
      root.add(hitLine);
    }
  }

  function setSpawnMarker(x, y, z) {
    if (!enabled) return;
    ensureSpawnSphere();
    spawnSphere.position.set(x, y, z);
    spawnSphere.visible = true;
  }

  function setFloorHit(x, y, z) {
    if (!enabled) return;
    ensureHitSphere();
    ensureHitLine();
    hitSphere.position.set(x, y, z);
    hitSphere.visible = true;
    // Vertical line from just above to the hit point
    const p = hitLine.geometry.getAttribute("position");
    p.setXYZ(0, x, y + 1.0, z);
    p.setXYZ(1, x, y, z);
    p.needsUpdate = true;
    hitLine.visible = true;
  }

  function showFloorSlab({
    x = 0,
    y = 0,
    z = 0,
    hx = 1,
    hy = 0.5,
    hz = 1,
  } = {}) {
    if (!enabled) return;
    const sizeX = Math.max(0.01, hx * 2);
    const sizeY = Math.max(0.01, hy * 2);
    const sizeZ = Math.max(0.01, hz * 2);
    const box = new BoxGeometry(sizeX, sizeY, sizeZ);
    const edges = new EdgesGeometry(box);
    if (!slabWire) {
      slabWire = new LineSegments(edges, wireMat);
      slabWire.name = "debug-floor-slab-wire";
      root.add(slabWire);
    } else {
      slabWire.geometry.dispose?.();
      slabWire.geometry = edges;
    }
    slabWire.position.set(x, y, z);
    slabWire.visible = true;
  }

  function clear() {
    if (spawnSphere) spawnSphere.visible = false;
    if (hitSphere) hitSphere.visible = false;
    if (hitLine) hitLine.visible = false;
    if (slabWire) slabWire.visible = false;
  }

  function setEnabled(next) {
    enabled = !!next;
    root.visible = enabled;
    if (!enabled) clear();
  }

  // Default hidden
  setEnabled(false);

  return {
    setEnabled,
    setSpawnMarker,
    setFloorHit,
    showFloorSlab,
    clear,
    get enabled() {
      return enabled;
    },
  };
}
export class PerformanceMonitor {
  constructor() {
    this.startTime = performance.now();
    this.memorySnapshots = [];
    this.physicsMetrics = {
      collisionCount: 0,
      avgFrameTime: 0,
      memoryLeaks: 0,
    };
    this.isMonitoring = false;
  }

  startMonitoring() {
    this.isMonitoring = true;
    this.takeMemorySnapshot("start");
    console.log("🔍 Performance monitoring started");
  }

  takeMemorySnapshot(label) {
    if (!this.isMonitoring) return;

    const memory = performance.memory
      ? {
          used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
          limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
        }
      : { used: "N/A", total: "N/A", limit: "N/A" };

    this.memorySnapshots.push({
      label,
      timestamp: performance.now() - this.startTime,
      memory,
    });

    console.log(
      `📊 Memory [${label}]: ${memory.used}MB used / ${memory.total}MB total`
    );
  }

  recordCollision(targetType, physicsResponse) {
    if (!this.isMonitoring) return;

    this.physicsMetrics.collisionCount++;

    // Check for consistent physics behavior
    const expectedDamping = this.getExpectedDamping(targetType);
    const actualDamping = {
      angular: physicsResponse.angularDamping,
      linear: physicsResponse.linearDamping,
    };

    const isConsistent =
      Math.abs(expectedDamping.angular - actualDamping.angular) < 0.01 &&
      Math.abs(expectedDamping.linear - actualDamping.linear) < 0.01;

    if (!isConsistent) {
      this.physicsMetrics.physicsInconsistencies++;
      console.warn(`⚠️ Physics inconsistency detected for ${targetType}`);
    }
  }

  getExpectedDamping(targetType) {
    const collisionType = getCollisionType(targetType);
    return (
      PHYSICS_DAMPING[collisionType] ||
      PHYSICS_DAMPING[CollisionType.DEFAULT] || { angular: 0.6, linear: 0.4 }
    );
  }

  generateReport() {
    if (!this.isMonitoring) return;

    this.takeMemorySnapshot("end");

    const startMemory = this.memorySnapshots[0]?.memory.used || 0;
    const endMemory =
      this.memorySnapshots[this.memorySnapshots.length - 1]?.memory.used || 0;
    const memoryGrowth = endMemory - startMemory;

    const report = {
      duration: Math.round(performance.now() - this.startTime),
      memoryGrowth: memoryGrowth,
      memoryLeakSuspected: memoryGrowth > 50, // More than 50MB growth is suspicious
      collisionCount: this.physicsMetrics.collisionCount,
      physicsConsistency: this.physicsMetrics.physicsInconsistencies === 0,
      snapshots: this.memorySnapshots,
    };

    console.log("📈 Performance Report:", report);
    return report;
  }

  // REMOVED: Demo functions - keeping only essential monitoring functionality
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Auto-start monitoring in development
if (typeof window !== "undefined" && window.location.hostname === "localhost") {
  performanceMonitor.startMonitoring();
}
