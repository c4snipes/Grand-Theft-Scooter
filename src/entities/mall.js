import { Body, Box as CannonBox, Vec3 } from 'cannon-es';
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
} from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

// --> Environment Entities: this file is me trying to make the mall feel alive with random props.
const mallBounds = {
  halfExtent: 60,
  clearRadius: 10,
};

const shirtPalette = ['#4f7cd1', '#d94f70', '#4fbfa8', '#f0821f'];
const pantsPalette = ['#383f4c', '#2f3645', '#48423c', '#2d3a4f'];
const hairPalette = ['#2b1f1a', '#d8c4a5', '#3b2f26', '#51423b'];

const propMaterials = {
  kioskPrimary: new MeshStandardMaterial({ color: '#3e7cb1', roughness: 0.55, metalness: 0.1 }),
  kioskAccent: new MeshStandardMaterial({ color: '#f3a712', roughness: 0.6 }),
  planter: new MeshStandardMaterial({ color: '#4c5a52', roughness: 0.95 }),
  foliage: new MeshStandardMaterial({ color: '#2f8f5e', roughness: 0.75 }),
  benchSeat: new MeshStandardMaterial({ color: '#a97155', roughness: 0.8 }),
  benchFrame: new MeshStandardMaterial({ color: '#2c3036', roughness: 0.5 }),
  cartPrimary: new MeshStandardMaterial({ color: '#d94f70', roughness: 0.6 }),
  cartAccent: new MeshStandardMaterial({ color: '#fce36b', roughness: 0.4 }),
  humanSkin: new MeshStandardMaterial({ color: '#f2c7a6', roughness: 0.65 }),
  humanTop: new MeshStandardMaterial({ color: '#4f7cd1', roughness: 0.75 }),
  humanBottom: new MeshStandardMaterial({ color: '#383f4c', roughness: 0.7 }),
  humanHair: new MeshStandardMaterial({ color: '#2b1f1a', roughness: 0.5 }),
  floorPrimary: new MeshStandardMaterial({ color: '#27333a', roughness: 0.95 }),
  floorAccent: new MeshStandardMaterial({ color: '#1c2329', roughness: 0.95 }),
  fountainBase: new MeshStandardMaterial({ color: '#d7dadf', roughness: 0.4 }),
  fountainWater: new MeshStandardMaterial({ color: '#4aa3d8', roughness: 0.2, metalness: 0.2 }),
};

function randomRange(min, max) {
  // Got this helper from a book. Returns a float between min and max.
  return Math.random() * (max - min) + min;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choose(collection) {
  // Tiny helper so my NPCs can wear different colors.
  return collection[Math.floor(Math.random() * collection.length)];
}

export function createMall(world, scene, assets = {}, materials = {}) {
  const interactables = [];
  const dynamicActors = [];
  let decorBuilt = false;
  let hazardsPrepared = false;
  const useMallAsset = Boolean(assets.mallScene);
  const kioskFactory = typeof assets.makeKioskInstance === 'function' ? assets.makeKioskInstance.bind(assets) : null;
  const columnFactory = typeof assets.makeColumnInstance === 'function' ? assets.makeColumnInstance.bind(assets) : null;
  const bannerFactory = typeof assets.makeBannerInstance === 'function' ? assets.makeBannerInstance.bind(assets) : null;

  function wrapAssetForCollision(object, name) {
    if (!object) return null;
    const container = new Group();
    container.name = name;
    container.add(object);

    container.updateWorldMatrix(true, true);
    const bounds = new Box3().setFromObject(container);
    if (bounds.isEmpty()) {
      return {
        mesh: container,
        size: new Vector3(1, 1, 1),
      };
    }

    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    object.position.sub(center);
    container.updateWorldMatrix(true, true);

    return {
      mesh: container,
      size,
    };
  }

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
    scene.add(mesh);
    world.addBody(body);
    return record;
  }

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
        randomRange(-mallBounds.halfExtent, mallBounds.halfExtent),
      );
      if (Math.hypot(candidate.x, candidate.z) < mallBounds.clearRadius + 1.5) continue;
      if (Math.abs(candidate.x) < 5 && Math.abs(candidate.z) < 10) continue;
      if (isPositionFree(candidate, minDistance)) {
        return candidate;
      }
    }
    return new Vector3(
      randomRange(-mallBounds.halfExtent, mallBounds.halfExtent),
      0,
      randomRange(-mallBounds.halfExtent, mallBounds.halfExtent),
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
      const safeAngle = planarDistance < 1e-4 ? Math.random() * Math.PI * 2 : Math.atan2(candidate.z, candidate.x);
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

    const base = enforceCentralClearance(clampToPlayableArea(target, padding), mallBounds.clearRadius + clearance);
    if (isPositionFree(base, minDistance, { ignoreBodies })) {
      return base;
    }

    for (const radius of searchRadii) {
      const steps = Math.max(10, Math.round(radius * 4));
      for (let i = 0; i < steps; i += 1) {
        const angle = (i / steps) * Math.PI * 2;
        const offset = new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        const candidate = enforceCentralClearance(clampToPlayableArea(base.clone().add(offset), padding), mallBounds.clearRadius + clearance);
        if (isPositionFree(candidate, minDistance, { ignoreBodies })) {
          return candidate;
        }
      }
    }

    return findSpawnPosition(minDistance);
  }

  function buildMallDecor() {
    // Big plaza pieces so the space doesn't feel empty.
    const decor = new Group();
    decor.name = 'mall-decor';
    decor.position.y = 0.015;

    const mainAisle = new Mesh(new PlaneGeometry(18, mallBounds.halfExtent * 2), propMaterials.floorPrimary);
    mainAisle.rotation.x = -Math.PI / 2;
    decor.add(mainAisle);

    const crossAisle = new Mesh(new PlaneGeometry(mallBounds.halfExtent * 2, 14), propMaterials.floorPrimary);
    crossAisle.rotation.x = -Math.PI / 2;
    decor.add(crossAisle);

    const plaza = new Mesh(new CircleGeometry(8, 48), propMaterials.floorAccent);
    plaza.rotation.x = -Math.PI / 2;
    decor.add(plaza);

    const fountainBase = new Mesh(new CylinderGeometry(4.8, 5.4, 0.9, 40), propMaterials.fountainBase);
    fountainBase.position.y = 0.45;
    decor.add(fountainBase);

    // Water sits a tiny bit below the lip so it doesn't flicker (I kept seeing z-fighting here).
    const fountainPool = new Mesh(new CylinderGeometry(3.95, 3.95, 0.22, 36), propMaterials.fountainWater);
    fountainPool.position.y = 0.72;
    decor.add(fountainPool);

    scene.add(decor);
  }

  function spawnColumnRing() {
    if (!columnFactory) return;

    const columnsGroup = new Group();
    columnsGroup.name = 'mall-columns';
    const columns = randomInt(10, 14);
    const radius = randomRange(24, 30);

    for (let i = 0; i < columns; i += 1) {
      const column = columnFactory();
      if (!column) continue;
      const height = randomRange(4.5, 6.5);
      const girth = randomRange(1.0, 1.6);
      const angle = (i / columns) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      column.scale.set(girth, height, girth);
      column.position.set(x, height / 2, z);
      column.traverse((child) => {
        if (child.isMesh) {
          if (child.material && child.material.clone) {
            child.material = child.material.clone();
          }
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      columnsGroup.add(column);

      const body = new Body({
        mass: 0,
        shape: new CannonBox(new Vec3(girth / 2, height / 2, girth / 2)),
        position: new Vec3(x, height / 2, z),
      });
      if (materials.ground) {
        body.material = materials.ground;
      }
      world.addBody(body);
    }

    scene.add(columnsGroup);
  }

  function spawnHangingBanners() {
    if (!bannerFactory) return;

    const bannersGroup = new Group();
    bannersGroup.name = 'mall-banners';
    const rows = randomInt(2, 3);
    const bannerTexture = assets.bannerTexture ?? null;

    for (let row = 0; row < rows; row += 1) {
      const z = (row - (rows - 1) / 2) * 12;
      const count = randomInt(4, 6);
      for (let i = 0; i < count; i += 1) {
        const banner = bannerFactory();
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
            if (child.material && child.material.clone) {
              child.material = child.material.clone();
            }
            if (bannerTexture) {
              child.material.map = bannerTexture;
              child.material.needsUpdate = true;
            } else if (child.material && child.material.color) {
              child.material.color = new Color('#f575ab');
            }
            child.castShadow = false;
            child.receiveShadow = false;
          }
        });
        bannersGroup.add(banner);
      }
    }

    scene.add(bannersGroup);
  }

  function spawnPlanter(positionOverride) {
    // Planters are easy points and add some green to the mall.
    const position = positionOverride ?? findSpawnPosition(4);
    const height = randomRange(0.5, 0.9);
    const radius = randomRange(0.6, 1.1);

    const planter = new Group();
    planter.name = 'planter';

    const pot = new Mesh(new CylinderGeometry(radius, radius * 1.1, height, 24), propMaterials.planter);
    planter.add(pot);

    const foliage = new Mesh(new SphereGeometry(radius * 0.95, 20, 16), propMaterials.foliage);
    foliage.position.y = height / 2 + radius * 0.6;
    planter.add(foliage);

    const centerY = height / 2;
    planter.position.set(position.x, centerY, position.z);

    const body = new Body({
      mass: 0,
      shape: new CannonBox(new Vec3(radius, centerY, radius)),
      position: new Vec3(position.x, centerY, position.z),
    });

    registerInteractable({
      mesh: planter,
      body,
      label: 'Planter',
      points: 40,
      type: 'prop',
      respawn: spawnPlanter,
    });
  }

  function spawnBench(positionOverride) {
    // Benches give comfy obstacles to slide into.
    const position = positionOverride ?? findSpawnPosition(5);
    const width = randomRange(2.2, 3.0);
    const depth = 0.65;
    const height = 0.7;

    const bench = new Group();
    bench.name = 'bench';

    const seat = new Mesh(new BoxGeometry(width, 0.12, depth), propMaterials.benchSeat);
    seat.position.y = 0;
    bench.add(seat);

    const backRest = new Mesh(new BoxGeometry(width, 0.5, 0.12), propMaterials.benchSeat);
    backRest.position.set(0, 0.31, -depth / 2);
    bench.add(backRest);

    const legGeometry = new BoxGeometry(0.12, height, 0.12);
    const frontLeft = new Mesh(legGeometry, propMaterials.benchFrame);
    frontLeft.position.set(-width / 2 + 0.15, -height / 2 + 0.06, depth / 2 - 0.1);
    bench.add(frontLeft);

    const frontRight = frontLeft.clone();
    frontRight.position.x = width / 2 - 0.15;
    bench.add(frontRight);

    const backLeft = new Mesh(legGeometry, propMaterials.benchFrame);
    backLeft.position.set(-width / 2 + 0.15, -height / 2 + 0.06, -depth / 2 + 0.1);
    bench.add(backLeft);

    const backRight = backLeft.clone();
    backRight.position.x = width / 2 - 0.15;
    bench.add(backRight);

    const centerY = height / 2;
    bench.position.set(position.x, centerY, position.z);

    const body = new Body({
      mass: 0,
      shape: new CannonBox(new Vec3(width / 2, centerY, depth / 2)),
      position: new Vec3(position.x, centerY, position.z),
    });

    registerInteractable({
      mesh: bench,
      body,
      label: 'Bench',
      points: 55,
      type: 'prop',
      respawn: spawnBench,
    });
  }

  function spawnFoodCart(positionOverride) {
    const position = positionOverride ?? findSpawnPosition(6);
    const kioskFromAsset = kioskFactory ? kioskFactory() : null;

    if (kioskFromAsset) {
      const scale = 1.8;
      kioskFromAsset.scale.set(scale, scale, scale);
      kioskFromAsset.traverse((child) => {
        if (child.isMesh) {
          if (child.material && child.material.clone) {
            child.material = child.material.clone();
          }
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      const prepared = wrapAssetForCollision(kioskFromAsset, 'mall-kiosk');
      if (!prepared) return;

      const { mesh: kioskMesh, size } = prepared;
      kioskMesh.position.set(position.x, size.y / 2, position.z);

      const body = new Body({
        mass: 6,
        shape: new CannonBox(new Vec3(size.x / 2, size.y / 2, size.z / 2)),
        position: new Vec3(kioskMesh.position.x, kioskMesh.position.y, kioskMesh.position.z),
        angularDamping: 0.9,
        linearDamping: 0.75,
      });
      body.allowSleep = false;

      registerInteractable({
        mesh: kioskMesh,
        body,
        label: 'Mall Kiosk',
        points: 120,
        type: 'prop',
        respawn: () => spawnFoodCart(),
      });
      return;
    }

    // Rolling food carts give slightly more points because why not.
    const width = 1.8;
    const depth = 1.1;

    const cart = new Group();
    cart.name = 'food-cart';

    const base = new Mesh(new BoxGeometry(width, 0.9, depth), propMaterials.cartPrimary);
    base.position.y = -0.3;
    cart.add(base);

    const canopy = new Mesh(new BoxGeometry(width + 0.4, 0.2, depth + 0.4), propMaterials.cartAccent);
    canopy.position.y = 0.6;
    cart.add(canopy);

    const poleGeometry = new CylinderGeometry(0.05, 0.05, 1.0, 12);
    const leftPole = new Mesh(poleGeometry, propMaterials.cartAccent);
    leftPole.position.set(-width / 2 + 0.2, 0.1, -depth / 2 + 0.15);
    cart.add(leftPole);

    const rightPole = leftPole.clone();
    rightPole.position.x = width / 2 - 0.2;
    cart.add(rightPole);

    const wheelGeometry = new CylinderGeometry(0.22, 0.22, depth + 0.2, 16);
    wheelGeometry.rotateZ(Math.PI / 2);
    const leftWheel = new Mesh(wheelGeometry, propMaterials.benchFrame);
    leftWheel.position.set(-width / 2 + 0.1, -0.65, 0);
    cart.add(leftWheel);

    const rightWheel = leftWheel.clone();
    rightWheel.position.x = width / 2 - 0.1;
    cart.add(rightWheel);

    const centerY = 0.8;
    cart.position.set(position.x, centerY, position.z);

    const body = new Body({
      mass: 6,
      shape: new CannonBox(new Vec3(width / 2, 0.8, depth / 2)),
      position: new Vec3(position.x, centerY, position.z),
      angularDamping: 0.85,
      linearDamping: 0.65,
    });

    registerInteractable({
      mesh: cart,
      body,
      label: 'Food Cart',
      points: 85,
      type: 'prop',
      respawn: spawnFoodCart,
    });
  }

  function spawnSecurityGate(positionOverride) {
    const position = positionOverride ?? findSpawnPosition(6);
    const gate = new Group();
    gate.name = 'security-gate';

    const frameMaterial = new MeshStandardMaterial({ color: '#4d5964', metalness: 0.65, roughness: 0.4 });
    const panelMaterial = new MeshStandardMaterial({ color: '#9fb2bf', transparent: true, opacity: 0.35, metalness: 0.2, roughness: 0.6 });

    const width = 4.5;
    const height = 3.4;
    const depth = 0.6;

    const leftPost = new Mesh(new BoxGeometry(0.4, height, depth), frameMaterial);
    leftPost.position.set(-width / 2 + 0.2, height / 2, 0);
    gate.add(leftPost);

    const rightPost = leftPost.clone();
    rightPost.position.x = width / 2 - 0.2;
    gate.add(rightPost);

    const topBar = new Mesh(new BoxGeometry(width - 0.4, 0.3, depth), frameMaterial);
    topBar.position.set(0, height - 0.15, 0);
    gate.add(topBar);

    const panel = new Mesh(new BoxGeometry(width - 0.8, height - 0.6, depth * 0.6), panelMaterial);
    panel.position.set(0, (height - 0.6) / 2, 0);
    gate.add(panel);

    gate.position.set(position.x, 0, position.z);

    const body = new Body({
      mass: 0,
      shape: new CannonBox(new Vec3(width / 2, height / 2, depth / 2)),
      position: new Vec3(position.x, height / 2, position.z),
    });

    registerInteractable({
      mesh: gate,
      body,
      label: 'Security Gate',
      type: 'hazard',
      fatal: true,
    });
  }

  function spawnCleaningRobot(positionOverride) {
    const position = positionOverride ?? findSpawnPosition(5);
    const robot = new Group();
    robot.name = 'cleaning-robot';

    const bodyMaterial = new MeshStandardMaterial({ color: '#4aa3d8', roughness: 0.35, metalness: 0.4 });
    const trimMaterial = new MeshStandardMaterial({ color: '#1a2730', roughness: 0.5 });

    const base = new Mesh(new CylinderGeometry(0.9, 0.9, 0.5, 24), bodyMaterial);
    base.position.y = 0.25;
    robot.add(base);

    const lid = new Mesh(new CylinderGeometry(0.8, 0.8, 0.25, 24), trimMaterial);
    lid.position.y = 0.6;
    robot.add(lid);

    const beacon = new Mesh(new CylinderGeometry(0.18, 0.12, 0.6, 16), new MeshStandardMaterial({ color: '#f1c40f', emissive: '#f39c12', emissiveIntensity: 0.5 }));
    beacon.position.y = 1.0;
    robot.add(beacon);

    robot.position.set(position.x, 0, position.z);

    const body = new Body({
      mass: 0,
      shape: new CannonBox(new Vec3(0.9, 0.5, 0.9)),
      position: new Vec3(position.x, 0.5, position.z),
    });

    registerInteractable({
      mesh: robot,
      body,
      label: 'Cleaning Robot',
      type: 'hazard',
      fatal: true,
      onUpdate: (delta, record) => {
        if (record.hit) return;
        record.mesh.rotation.y += delta * 0.5;
      },
    });
  }

  function spawnMaintenanceBarrier(positionOverride) {
    const position = positionOverride ?? findSpawnPosition(4);
    const barrier = new Group();
    barrier.name = 'maintenance-barrier';

    const panelMaterial = new MeshStandardMaterial({ color: '#f5a623', roughness: 0.5, metalness: 0.1 });
    const stripeMaterial = new MeshStandardMaterial({ color: '#222831', roughness: 0.7 });

    const width = 3.2;
    const height = 2.2;
    const depth = 0.4;

    const panel = new Mesh(new BoxGeometry(width, height, depth), panelMaterial);
    panel.position.y = height / 2;
    barrier.add(panel);

    const stripe = new Mesh(new BoxGeometry(width * 0.9, 0.28, depth + 0.02), stripeMaterial);
    stripe.position.set(0, height * 0.6, 0);
    barrier.add(stripe);

    const stripe2 = stripe.clone();
    stripe2.position.y = height * 0.35;
    barrier.add(stripe2);

    barrier.position.set(position.x, 0, position.z);

    const body = new Body({
      mass: 0,
      shape: new CannonBox(new Vec3(width / 2, height / 2, depth / 2)),
      position: new Vec3(position.x, height / 2, position.z),
    });

    registerInteractable({
      mesh: barrier,
      body,
      label: 'Maintenance Barrier',
      type: 'hazard',
      fatal: true,
    });
  }

  function spawnMallBoundaries() {
    const wallThickness = 2.4;
    const wallHeight = 6;
    const floorHalfExtent = mallBounds.halfExtent + wallThickness;

    const wallMaterial = new MeshStandardMaterial({
      color: '#8fb6d8',
      transparent: true,
      opacity: 0.08,
      metalness: 0.1,
      roughness: 0.6,
    });

    const planeMaterial = new MeshStandardMaterial({
      visible: false,
    });

    const segments = [
      { x: 0, z: floorHalfExtent, sx: floorHalfExtent * 2 + wallThickness, sz: wallThickness },
      { x: 0, z: -floorHalfExtent, sx: floorHalfExtent * 2 + wallThickness, sz: wallThickness },
      { x: floorHalfExtent, z: 0, sx: wallThickness, sz: floorHalfExtent * 2 + wallThickness },
      { x: -floorHalfExtent, z: 0, sx: wallThickness, sz: floorHalfExtent * 2 + wallThickness },
    ];

    for (const segment of segments) {
      const mesh = new Mesh(new BoxGeometry(segment.sx, wallHeight, segment.sz), wallMaterial.clone());
      mesh.position.set(segment.x, wallHeight / 2, segment.z);
      mesh.name = 'mall-boundary';

      const body = new Body({
        mass: 0,
        shape: new CannonBox(new Vec3(segment.sx / 2, wallHeight / 2, segment.sz / 2)),
        position: new Vec3(segment.x, wallHeight / 2, segment.z),
      });

      registerInteractable({
        mesh,
        body,
        label: 'Mall Wall',
        type: 'hazard',
        fatal: true,
      });
    }

    const ceilingHeight = 12;
    const floorSize = mallBounds.halfExtent * 2 + wallThickness * 2;

    const ceiling = new Mesh(new PlaneGeometry(floorSize, floorSize), planeMaterial);
    ceiling.rotation.x = Math.PI;
    ceiling.position.y = ceilingHeight;
    ceiling.name = 'mall-ceiling';

    const ceilingBody = new Body({
      mass: 0,
      shape: new CannonBox(new Vec3(floorSize / 2, 0.5, floorSize / 2)),
      position: new Vec3(0, ceilingHeight, 0),
    });

    registerInteractable({
      mesh: ceiling,
      body: ceilingBody,
      label: 'Mall Ceiling',
      type: 'hazard',
      fatal: true,
    });
  }

  function spawnMallPatron(positionOverride) {
    // Squishy mall patrons with random outfits (sorry, NPCs!).
    const desiredPosition = positionOverride ?? findSpawnPosition(5);
    const position = findNearestNavigablePoint(desiredPosition, 4.5);
    const group = new Group();
    group.name = 'mall-patron';

    const centerY = 0.9;
    group.position.set(position.x, centerY, position.z);
    group.rotation.y = randomRange(-Math.PI, Math.PI);

    const npcAssetPool = [];
    if (Array.isArray(assets.animatedMenVariants)) {
      assets.animatedMenVariants.forEach((variant) => {
        npcAssetPool.push({
          scene: variant.scene,
          animations: variant.animations ?? [],
          scale: 0.01,
          label: variant.label ?? 'Mall Patron',
        });
      });
    }
    if (Array.isArray(assets.animatedWomenVariants)) {
      assets.animatedWomenVariants.forEach((variant) => {
        npcAssetPool.push({
          scene: variant.scene,
          animations: variant.animations ?? [],
          scale: 0.01,
          label: variant.label ?? 'Mall Patron',
        });
      });
    }
    if (assets.characterBaseScene) {
      npcAssetPool.push({
        scene: assets.characterBaseScene,
        animations: assets.characterBaseAnimations ?? [],
        scale: 0.01,
        label: 'Mall Patron',
      });
    }

    let mixer = null;
    let npcLabel = 'Mall Patron';
    let usesFallback = false;

    if (npcAssetPool.length > 0) {
      const choiceAsset = choose(npcAssetPool);
      const actor = cloneSkeleton(choiceAsset.scene);
      actor.name = 'npc-model';
      actor.scale.setScalar(choiceAsset.scale ?? 1);
      actor.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material && child.material.map) {
            child.material.map.needsUpdate = true;
          }
        }
      });
      const actorBoundsYOffset = 0.0;
      actor.position.set(0, actorBoundsYOffset, 0);
      group.add(actor);

      const clips = choiceAsset.animations ?? [];
      if (clips.length > 0) {
        const previewMixer = new AnimationMixer(actor);
        const clip = clips.find((entry) => typeof entry.name === 'string' && /idle|stand/i.test(entry.name))
          ?? clips[0];
        const action = previewMixer.clipAction(clip);
        action.reset();
        action.play();
        const sampleTime = Math.random() * Math.max(clip.duration ?? 0.16, 0.16);
        previewMixer.update(sampleTime);
        previewMixer.stopAllAction();
      }
      npcLabel = choiceAsset.label ?? 'Mall Patron';
    } else {
      usesFallback = true;
      const torsoMaterial = propMaterials.humanTop.clone();
      torsoMaterial.color = new Color(choose(shirtPalette));
      const legMaterial = propMaterials.humanBottom.clone();
      legMaterial.color = new Color(choose(pantsPalette));
      const hairMaterial = propMaterials.humanHair.clone();
      hairMaterial.color = new Color(choose(hairPalette));

      const legs = new Mesh(new CylinderGeometry(0.22, 0.26, 0.9, 16), legMaterial);
      legs.position.y = -0.45;
      group.add(legs);

      const torso = new Mesh(new CylinderGeometry(0.28, 0.24, 0.9, 16), torsoMaterial);
      torso.position.y = 0.35;
      group.add(torso);

      const neck = new Mesh(new CylinderGeometry(0.1, 0.1, 0.15, 10), propMaterials.humanSkin);
      neck.position.y = 0.95;
      group.add(neck);

      const head = new Mesh(new SphereGeometry(0.22, 18, 14), propMaterials.humanSkin);
      head.position.y = 1.2;
      group.add(head);

      const hair = new Mesh(new SphereGeometry(0.24, 18, 14), hairMaterial);
      hair.position.set(0, 1.24, -0.02);
      hair.scale.set(1, 0.7, 1);
      group.add(hair);

      const armGeometry = new CylinderGeometry(0.1, 0.08, 0.7, 12);
      armGeometry.rotateZ(Math.PI / 16);
      const leftArm = new Mesh(armGeometry, torsoMaterial);
      leftArm.position.set(0.32, 0.5, 0.12);
      group.add(leftArm);

      const rightArm = leftArm.clone();
      rightArm.position.x = -0.32;
      rightArm.rotation.z = -leftArm.rotation.z;
      group.add(rightArm);
    }

    const body = new Body({
      mass: 3.5,
      shape: new CannonBox(new Vec3(0.32, centerY, 0.28)),
      position: new Vec3(position.x, centerY, position.z),
      angularDamping: 0.45,
      linearDamping: 0.4,
    });
    body.allowSleep = false;

    const idlePhase = Math.random() * Math.PI * 2;
    registerInteractable({
      mesh: group,
      body,
      label: npcLabel,
      points: 150,
      type: 'human',
      respawn: spawnMallPatron,
      mixer,
      onUpdate: (delta, record) => {
        if (record.hit) return;
        if (usesFallback) {
          record.mesh.rotation.y += delta * 0.1;
          const bounce = Math.sin((performance.now() / 600) + idlePhase) * 0.02;
          record.mesh.position.y = record.body.position.y + bounce;
        } else {
          record.mesh.position.y = record.body.position.y;
        }
      },
    });
  }

  const spawnDefinitions = [
    { key: 'planter', min: 12, max: 18, distance: 4, spawn: (position) => spawnPlanter(position) },
    { key: 'bench', min: 9, max: 14, distance: 5, spawn: (position) => spawnBench(position) },
    { key: 'kiosk', min: 6, max: 9, distance: 6, spawn: (position) => spawnFoodCart(position) },
    { key: 'patron', min: 16, max: 22, distance: 5, spawn: (position) => spawnMallPatron(position) },
  ];
const hazardSpawners = [spawnSecurityGate, spawnCleaningRobot, spawnMaintenanceBarrier];

const staticLayout = {
  planters: [
    { x: -18, z: -14 },
    { x: -18, z: 14 },
    { x: 18, z: -14 },
    { x: 18, z: 14 },
    { x: -6, z: -18 },
    { x: 6, z: -18 },
    { x: -6, z: 18 },
    { x: 6, z: 18 },
  ],
  benches: [
    { x: -14, z: 0 },
    { x: 14, z: 0 },
    { x: 0, z: -14 },
    { x: 0, z: 14 },
  ],
  kiosks: [
    { x: -10, z: -6 },
    { x: 10, z: -6 },
    { x: -10, z: 6 },
    { x: 10, z: 6 },
  ],
  patrons: [
    { x: -8, z: -2 },
    { x: 8, z: -2 },
    { x: -6, z: 8 },
    { x: 6, z: 8 },
  ],
  hazards: {
    barriers: [
      { x: 0, z: -24 },
      { x: 0, z: 24 },
    ],
    robots: [
      { x: -12, z: 12 },
      { x: 12, z: -12 },
    ],
  },
};

  function spawnStaticLayout() {
    staticLayout.planters.forEach((entry) => {
      spawnPlanter(new Vector3(entry.x, 0, entry.z));
    });
    staticLayout.benches.forEach((entry) => {
      spawnBench(new Vector3(entry.x, 0, entry.z));
    });
    staticLayout.kiosks.forEach((entry) => {
      spawnFoodCart(new Vector3(entry.x, 0, entry.z));
    });
    staticLayout.patrons.forEach((entry) => {
      spawnMallPatron(new Vector3(entry.x, 0, entry.z));
    });
    staticLayout.hazards.barriers.forEach((entry) => {
      spawnMaintenanceBarrier(new Vector3(entry.x, 0, entry.z));
    });
    staticLayout.hazards.robots.forEach((entry) => {
      spawnCleaningRobot(new Vector3(entry.x, 0, entry.z));
    });
  }

  function populate(options = {}) {
    const mode = options.mode ?? (useMallAsset ? 'static' : 'default');

    if (!decorBuilt) {
      if (!useMallAsset) {
        buildMallDecor();
        spawnColumnRing();
        spawnHangingBanners();
      }
      decorBuilt = true;
    }

    if (!hazardsPrepared) {
      spawnMallBoundaries();
      hazardsPrepared = true;
    }

    if (mode === 'static' && useMallAsset) {
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
    scene.remove(record.mesh);
    record.body.userData = undefined;

    const index = interactables.indexOf(record);
    if (index !== -1) {
      interactables.splice(index, 1);
    }

    const dynamicIndex = dynamicActors.indexOf(record);
    if (dynamicIndex !== -1) {
      dynamicActors.splice(dynamicIndex, 1);
    }

    if (typeof record.respawn === 'function') {
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
    // Mark it as hit so we don't double count.
    if (record.hit) return null;
    record.hit = true;

    let cleanupDelay = 0;

    if (record.type === 'human') {
      const launchDirection = new Vec3(
        record.body.position.x - (hitterBody ? hitterBody.position.x : 0),
        0,
        record.body.position.z - (hitterBody ? hitterBody.position.z : 0),
      );
      if (launchDirection.lengthSquared() < 0.01) {
        launchDirection.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      }
      launchDirection.normalize();
      record.body.angularDamping = 0.08;
      record.body.linearDamping = 0.05;
      record.body.applyImpulse(launchDirection.scale(12), record.body.position);
      record.body.applyImpulse(new Vec3(0, 8, 0), record.body.position);
      cleanupDelay = 1600;
    } else if (record.type === 'prop' && hitterBody) {
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

    queueCleanup(record, cleanupDelay);

    return record;
  }

  return {
    populate,
    sync(delta) {
      for (const record of interactables) {
        record.mesh.position.set(
          record.body.position.x,
          record.body.position.y,
          record.body.position.z,
        );
        record.mesh.quaternion.set(
          record.body.quaternion.x,
          record.body.quaternion.y,
          record.body.quaternion.z,
          record.body.quaternion.w,
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
      if (!body) return null;
      const record = body.userData;
      if (!record) return null;
      if (record.fatal) {
        return {
          kind: 'fatal',
          label: record.label ?? 'Hazard',
        };
      }
      const hit = handleHit(record, hitterBody);
      if (!hit) return null;
      return {
        kind: 'score',
        label: hit.label ?? 'Hit',
        points: hit.points ?? 0,
      };
    },
    findNearestNavigablePoint,
    isPositionNavigable(position, minDistance = 4, options = {}) {
      return isPositionFree(position, minDistance, options);
    },
  };
}
