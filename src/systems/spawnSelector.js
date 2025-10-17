import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Plane,
  Raycaster,
  RingGeometry,
  Vector2,
  Vector3,
} from 'three';
import { invariant } from '../core/assert';

/**
 * Creates a spawn selector for choosing a safe spawn point in the mall.
 * Exports a minimal API: pick(start), isActive(), dispose()
 */
export function createSpawnSelector({
  selectorCamera,
  selectorRenderer,
  selectorScene,
  selectorMall,
  getScooterBody,
}) {
  invariant(
    selectorCamera && typeof selectorCamera.isCamera === 'boolean',
    'createSpawnSelector requires a THREE camera instance.'
  );
  invariant(
    selectorMall && typeof selectorMall.findNearestNavigablePoint === 'function',
    'createSpawnSelector requires selectorMall.findNearestNavigablePoint().'
  );

  const RING_SEGMENTS = 48;
  const geometry = new RingGeometry(0.8, 1.25, RING_SEGMENTS);
  const material = new MeshBasicMaterial({
    color: '#4f8ef7',
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
    return selectorMall.findNearestNavigablePoint(point, 3.6, { ignoreBodies: currentIgnoreBodies() });
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
    if (key === 'enter' || key === ' ') {
      event.preventDefault();
      finishSelection(candidate);
    } else if (key === 'escape') {
      event.preventDefault();
      finishSelection(fallback);
    }
  }

  function cleanup() {
    active = false;
    indicator.visible = false;
    selectorDomElement.removeEventListener('pointermove', handlePointerMove);
    selectorDomElement.removeEventListener('click', handleClick);
    window.removeEventListener('keydown', handleKey);
    resolvePromise = null;
  }

  async function pick(start) {
    if (active) {
      return candidate.clone();
    }
    active = true;
    fallback.copy(computeSafe(start ?? new Vector3(0, 0, 0)));
    preview(fallback);
    selectorDomElement.addEventListener('pointermove', handlePointerMove);
    selectorDomElement.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKey);
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
