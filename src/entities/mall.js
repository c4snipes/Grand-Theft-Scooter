import { Body, Box as CannonBox, Vec3 } from 'cannon-es';
import { Group, Mesh, MeshStandardMaterial, Vector3, Color } from 'three';
import { warnOnce } from '../core/assert';
import {
  randomRange, randomInt, choose,
  propMaterials, buildMallDecor, spawnColumnRing, spawnHangingBanners,
  spawnPlanter, spawnBench, spawnKiosk, spawnTrashCan,
  spawnPosterStand, spawnBoxStack, spawnSecurityGate, spawnCleaningRobot,
  spawnMaintenanceBarrier, spawnMallBoundaries, spawnMallPatron,
  initSpawnContext
} from './mall/spawnHelpers';
import { initChunking, getChunkKeyForPosition, updateChunkStreaming, chunksApi, InteractableType } from './mall/streaming';

// Increased to give the enlarged mall asset plenty of room for walls/streaming
const DEFAULT_HALF_EXTENT = 160;
const mallBounds = { halfExtent: DEFAULT_HALF_EXTENT, clearRadius: 10 };

export function createMall(world, scene, assets = {}, materials = {}) {
  const interactables = [];
  const dynamicActors = [];
  let decorBuilt = false;
  let hazardsPrepared = false;
  const useMallAsset = Boolean(assets.mallScene);
  const kioskFactory = typeof assets.makeKioskInstance === 'function' ? assets.makeKioskInstance.bind(assets) : null;
  const columnFactory = typeof assets.makeColumnInstance === 'function' ? assets.makeColumnInstance.bind(assets) : null;
  const bannerFactory = typeof assets.makeBannerInstance === 'function' ? assets.makeBannerInstance.bind(assets) : null;

  const { ensureChunk, unloadChunk, chunkedStreamingEnabled, setChunkingConfig, getChunkSize } =
    initChunking(scene, world);

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
      const key = chunkKey ?? getChunkKeyForPosition(body.position.x, body.position.z);
      record.chunkKey = key;
      const container = ensureChunk(key);
      container.group.add(mesh);
    } else {
      scene.add(mesh);
    }
    world.addBody(body);
    return record;
  }

  initSpawnContext({ world, scene, assets, materials, mallBounds, getChunkKeyForPosition, registerInteractable, propMaterials });

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

  const spawnDefinitions = [
    { key: 'planter', min: 16, max: 22, distance: 4, spawn: (p) => spawnPlanter(p) },
    { key: 'bench', min: 12, max: 18, distance: 5, spawn: (p) => spawnBench(p) },
    { key: 'kiosk', min: 7, max: 10, distance: 6, spawn: (p) => spawnKiosk(p) },
    { key: 'trash', min: 10, max: 16, distance: 4, spawn: (p) => spawnTrashCan(p) },
    { key: 'poster', min: 8, max: 12, distance: 4.5, spawn: (p) => spawnPosterStand(p) },
    { key: 'boxstack', min: 10, max: 16, distance: 3.8, spawn: (p) => spawnBoxStack(p) },
    { key: 'patron', min: 6, max: 10, distance: 5, spawn: (p) => spawnMallPatron(p) },
  ];
  const hazardSpawners = [spawnSecurityGate, spawnCleaningRobot, spawnMaintenanceBarrier];

  function populate(options = {}) {
    const mode = options.mode ?? (useMallAsset ? 'static' : 'default');

    if (!decorBuilt) {
      if (!useMallAsset) {
        buildMallDecor(scene, mallBounds, propMaterials);
        spawnColumnRing(scene, assets, materials);
        spawnHangingBanners(scene, assets, materials);
      }
      decorBuilt = true;
    }

    if (!hazardsPrepared) {
      spawnMallBoundaries(scene, world, materials, mallBounds, getChunkKeyForPosition, registerInteractable);
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
    if (!record || typeof record !== 'object') {
      warnOnce('mall:handleHit:invalidRecord', '[mall.handleHit] Record missing or not an object.');
      return null;
    }
    // Mark it as hit so we don't double count.
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
      warnOnce(
        'mall:handleHit:missingType',
        '[mall.handleHit] Record is missing a type; skipping hit response.',
        { label: record.label ?? 'unknown' },
      );
      return null;
    }

    let cleanupDelay = 0;

    if (record.type === InteractableType.HUMAN) {
      cleanupDelay = applyHumanHitImpulse(record, hitterBody);
    } else if (record.type === InteractableType.PROP) {
      applyPropHitImpulse(record, hitterBody);
    }

    queueCleanup(record, cleanupDelay);

    return record;

  // Small helpers to keep handleHit() simple and readable
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
      if (chunkedStreamingEnabled() && typeof this.getPlayerPosition === 'function') {
        const p = this.getPlayerPosition();
        if (p) {
          updateChunkStreaming(p.x, p.z);
        }
      }
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
      const record = body?.userData;
      if (!record) return null;
      if (typeof record !== 'object') {
        warnOnce(
          'mall:handleCollision:invalidRecord',
          '[mall.handleCollision] Expected body.userData to be an object.',
          { bodyId: body?.id },
        );
        return null;
      }
      if (record.fatal) {
        return {
          kind: 'fatal',
          label: record.label ?? 'Hazard',
        };
      }
      const hit = handleHit(record, hitterBody);
      return hit
        ? {
            kind: 'score',
            label: hit.label ?? 'Hit',
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
      if (typeof halfExtent === 'number' && isFinite(halfExtent) && halfExtent > 10) {
        mallBounds.halfExtent = halfExtent;
      }
    },
    setChunking({ size, radius, enabled } = {}) {
      setChunkingConfig({ size, radius, enabled });
    },
    setPlayerLocator(fn) {
      this.getPlayerPosition = typeof fn === 'function' ? fn : null;
    },
    getPlayerPosition: null,
  };
}
