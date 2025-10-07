import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { TextureLoader } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// --> Asset Loader: pulls in simple GLTF + texture files so the mall feels more like a real venue.
const textureLoader = new TextureLoader();
const gltfLoader = new GLTFLoader();

async function safeLoad(label, loaderFn) {
  try {
    return await loaderFn();
  } catch (error) {
    const hintedSrc = error?.target?.src ?? error?.path?.[0]?.src ?? 'unknown-src';
    console.warn(`[assets] Failed to load ${label} (${hintedSrc}):`, error);
    return null;
  }
}

function encodePath(path) {
  return encodeURI(path).replace(/%5B/g, '[').replace(/%5D/g, ']');
}

function toFriendlyLabel(fileName) {
  return fileName
    .replace(/\.glb$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b([a-z])/g, (_, char) => char.toUpperCase())
    .trim();
}

async function loadNpcPack(labelPrefix, basePath, files) {
  const results = await Promise.all(
    files.map(async (file) => {
      const gltf = await safeLoad(`${labelPrefix} ${file}`, () => gltfLoader.loadAsync(encodePath(`${basePath}/${file}`)));
      if (!gltf) return null;
      return {
        scene: gltf.scene,
        animations: gltf.animations ?? [],
        label: toFriendlyLabel(file),
      };
    }),
  );
  return results.filter((item) => item);
}

function createProceduralFloorTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const colors = ['#1f2a32', '#202b35', '#25323c', '#1c252c'];
  const tile = size / 4;

  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      ctx.fillStyle = colors[(x + y) % colors.length];
      ctx.fillRect(x * tile, y * tile, tile, tile);
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(48, 48);
  texture.anisotropy = 4;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export async function loadMallAssets() {
  const [
    floorTexture,
    kioskGltf,
    floorTileGltf,
    columnGltf,
    bannerGltf,
    bannerTexture,
    mallSceneGltf,
    scooterGltf,
    riderGltf,
    characterBaseGltf,
  ] = await Promise.all([
    safeLoad('floor texture', () => textureLoader.loadAsync('/assets/mall_floor.png')),
    safeLoad('mall kiosk gltf', () => gltfLoader.loadAsync('/assets/mall_kiosk.gltf')),
    safeLoad('floor tile gltf', () => gltfLoader.loadAsync('/assets/mall_floor_tile.gltf')),
    safeLoad('column gltf', () => gltfLoader.loadAsync('/assets/mall_column.gltf')),
    safeLoad('banner gltf', () => gltfLoader.loadAsync('/assets/mall_banner.gltf')),
    safeLoad('banner texture', () => textureLoader.loadAsync('/assets/mall_banner.png')),
    safeLoad('shopping mall gltf', () => gltfLoader.loadAsync('/assets/shopping_mall/scene.gltf')),
    safeLoad('mobility scooter gltf', () => gltfLoader.loadAsync('/assets/mobility_scooter_animated/scene.gltf')),
    safeLoad('evil old lady gltf', () => gltfLoader.loadAsync('/assets/evil_old_lady/scene.gltf')),
    safeLoad('base npc glb', () => gltfLoader.loadAsync(encodePath('/assets/Character Base.glb'))),
  ]);

  const menNpcGltfs = await loadNpcPack('animated men npc', '/assets/Animated Men Pack-glb', [
    'Man.glb',
    'Man in Suit.glb',
    'Man in Long Sleeves.glb',
    'Man-fjHyMd5Wxw.glb',
  ]);

  const womenNpcGltfs = await loadNpcPack('animated women npc', '/assets/Ultimate Modular Women Pack-glb', [
    'Animated Woman.glb',
    'Animated Woman-nIItLV9nxS.glb',
    'Adventurer.glb',
    'Medieval.glb',
    'Punk.glb',
    'Sci Fi Character.glb',
    'Soldier.glb',
    'Suit.glb',
    'Witch.glb',
    'Worker.glb',
  ]);

  let resolvedFloorTexture = floorTexture;
  if (resolvedFloorTexture) {
    resolvedFloorTexture.wrapS = RepeatWrapping;
    resolvedFloorTexture.wrapT = RepeatWrapping;
    resolvedFloorTexture.repeat.set(32, 32);
    resolvedFloorTexture.anisotropy = 4;
    resolvedFloorTexture.colorSpace = SRGBColorSpace;
  } else {
    resolvedFloorTexture = createProceduralFloorTexture();
    console.info('[assets] Using procedural floor texture as fallback.');
  }

  const kioskScene = kioskGltf ? kioskGltf.scene : null;
  const floorTileScene = floorTileGltf ? floorTileGltf.scene : null;
  const columnScene = columnGltf ? columnGltf.scene : null;
  const bannerScene = bannerGltf ? bannerGltf.scene : null;
  const mallScene = mallSceneGltf ? mallSceneGltf.scene : null;
  const scooterScene = scooterGltf ? scooterGltf.scene : null;
  const riderScene = riderGltf ? riderGltf.scene : null;
  const characterBaseScene = characterBaseGltf ? characterBaseGltf.scene : null;

  const animatedMenVariants = menNpcGltfs;
  const animatedWomenVariants = womenNpcGltfs;

  if (bannerTexture) {
    bannerTexture.wrapS = RepeatWrapping;
    bannerTexture.wrapT = RepeatWrapping;
    bannerTexture.repeat.set(1, 1);
    bannerTexture.colorSpace = SRGBColorSpace;
  }

  return {
    floorTexture: resolvedFloorTexture,
    kioskScene,
    floorTileScene,
    columnScene,
    bannerScene,
    bannerTexture,
    mallScene,
    scooterScene,
    scooterAnimations: scooterGltf ? scooterGltf.animations ?? [] : [],
    riderScene,
    riderAnimations: riderGltf ? riderGltf.animations ?? [] : [],
    characterBaseScene,
    characterBaseAnimations: characterBaseGltf ? characterBaseGltf.animations ?? [] : [],
    animatedMenVariants,
    animatedWomenVariants,
    makeKioskInstance() {
      return kioskScene ? kioskScene.clone(true) : null;
    },
    makeFloorTileInstance() {
      return floorTileScene ? floorTileScene.clone(true) : null;
    },
    makeColumnInstance() {
      return columnScene ? columnScene.clone(true) : null;
    },
    makeBannerInstance() {
      return bannerScene ? bannerScene.clone(true) : null;
    },
  };
}
