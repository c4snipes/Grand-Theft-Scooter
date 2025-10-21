import {
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  Line,
  BoxGeometry,
  EdgesGeometry,
  LineSegments,
  Vector3,
} from "three";

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
