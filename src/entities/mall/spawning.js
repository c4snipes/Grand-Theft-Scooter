import { Vec3 } from 'cannon-es';
import { randomRange } from './spawnHelpers';
import { InteractableType } from './streaming';
import { chunksApi } from './streaming';
import { warnOnce } from '../../core/assert';

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
      if (record.type === InteractableType?.HUMAN || record.type === 'human') {
        cleanupDelay = applyHumanHitImpulse(record, hitterBody);
      } else if (record.type === InteractableType?.PROP || record.type === 'prop') {
        applyPropHitImpulse(record, hitterBody);
      }
      queueCleanup(record, cleanupDelay);
      return record;
    }

    return { handleHit, queueCleanup };
  },
};
