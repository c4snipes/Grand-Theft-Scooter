import { Body, Box as CannonBox, Vec3 } from "cannon-es";
import {
  AnimationMixer,
  Box3,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { getChunkKeyForPosition, InteractableType } from "./streaming";

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
    type: InteractableType.PROP,
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
    type: InteractableType.PROP,
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
      type: InteractableType.PROP,
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
    type: InteractableType.PROP,
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
    type: InteractableType.PROP,
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
    type: InteractableType.PROP,
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
    type: InteractableType.HAZARD,
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
    type: InteractableType.HAZARD,
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
    type: InteractableType.HAZARD,
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
      type: InteractableType.HAZARD,
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
    type: InteractableType.HAZARD,
    fatal: true,
    chunkKey: getChunkKeyForPosition(0, 0),
  });
}

export function spawnMallPatron(positionOverride) {
  // This helper exists to centralize later if needed.
  return CTX._spawnMallPatron?.(positionOverride);
}
