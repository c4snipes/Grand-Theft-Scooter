import { Group } from 'three';

let chunkSize = 48;
let chunkRadius = 2;
let streamingEnabled = true;
const chunks = new Map();
let lastCenter = null;
let mallPopulateChunk = null;

// Interactable type enum
export const InteractableType = {
  PROP: 'prop',
  HAZARD: 'hazard',
  HUMAN: 'human',
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
