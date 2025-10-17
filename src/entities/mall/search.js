import { Vector3 } from 'three';
import { randomRange } from './spawnHelpers';

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

  return {
    isPositionFree,
    findSpawnPosition,
    clampToPlayableArea,
    enforceCentralClearance,
    findNearestNavigablePoint,
  };
}
