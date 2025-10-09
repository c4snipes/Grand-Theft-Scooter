import { RepeatWrapping, SRGBColorSpace } from 'three';
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

function resolveAssetPath(inputPath) {
  if (!inputPath) return '';
  if (/^[a-z][a-z0-9+\-.]*:/i.test(inputPath)) {
    return inputPath;
  }

  const rawBase = (typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.BASE_URL === 'string')
    ? import.meta.env.BASE_URL
    : '/';

  const normalizedBase = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  const trimmedPath = inputPath.startsWith('/') ? inputPath.slice(1) : inputPath;
  const encodedSegments = trimmedPath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment));

  const prefix = normalizedBase.startsWith('/') ? normalizedBase : `/${normalizedBase}`;
  const base = prefix.endsWith('/') ? prefix : `${prefix}/`;
  return `${base}${encodedSegments.join('/')}`;
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
      const gltf = await safeLoad(
        `${labelPrefix} ${file}`,
        () => gltfLoader.loadAsync(resolveAssetPath(`${basePath}/${file}`)),
      );
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

export async function loadMallAssets() {
  const [
    kioskGltf,
    columnGltf,
    bannerGltf,
    bannerTexture,
    mallSceneGltf,
    scooterGltf,
    riderGltf,
    characterBaseGltf,
  ] = await Promise.all([
    safeLoad('mall kiosk glb', () => gltfLoader.loadAsync(resolveAssetPath('assets/mall_kiosk.glb'))),
    safeLoad('column glb', () => gltfLoader.loadAsync(resolveAssetPath('assets/mall_column.glb'))),
    safeLoad('banner glb', () => gltfLoader.loadAsync(resolveAssetPath('assets/mall_banner.glb'))),
    safeLoad('banner texture', () => textureLoader.loadAsync(resolveAssetPath('assets/mall_banner.png'))),
    safeLoad('shopping mall glb', () => gltfLoader.loadAsync(resolveAssetPath('assets/shopping_mall/scene.glb'))),
    safeLoad('mobility scooter glb', () => gltfLoader.loadAsync(resolveAssetPath('assets/mobility_scooter_animated/scene.glb'))),
    safeLoad('evil old lady glb', () => gltfLoader.loadAsync(resolveAssetPath('assets/evil_old_lady/scene.glb'))),
    safeLoad('base npc glb', () => gltfLoader.loadAsync(resolveAssetPath('assets/Character Base.glb'))),
  ]);

  const menNpcGltfs = await loadNpcPack('animated men npc', 'assets/Animated Men Pack-glb', [
    'Man.glb',
    'Man in Suit.glb',
    'Man in Long Sleeves.glb',
    'Man-fjHyMd5Wxw.glb',
  ]);

  const womenNpcGltfs = await loadNpcPack('animated women npc', 'assets/Ultimate Modular Women Pack-glb', [
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

  const kioskScene = kioskGltf ? kioskGltf.scene : null;
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
    kioskScene,
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
    makeColumnInstance() {
      return columnScene ? columnScene.clone(true) : null;
    },
    makeBannerInstance() {
      return bannerScene ? bannerScene.clone(true) : null;
    },
  };
}
