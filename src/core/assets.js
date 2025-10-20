import { RepeatWrapping, SRGBColorSpace } from "three";
import { TextureLoader } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

// --> Asset Loader: pulls in simple GLTF + texture files so the mall feels more like a real venue.
const textureLoader = new TextureLoader();
const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
dracoLoader.setCrossOrigin("anonymous");
dracoLoader.preload();
gltfLoader.setDRACOLoader(dracoLoader);

async function safeLoad(label, loaderFn) {
  try {
    return await loaderFn();
  } catch (error) {
    const hintedSrc =
      error?.target?.src ?? error?.path?.[0]?.src ?? "unknown-src";
    console.warn(`[assets] Failed to load ${label} (${hintedSrc}):`, error);
    return null;
  }
}

function isAbsoluteUrl(p) {
  return /^[a-z][a-z0-9+\-.]*:/i.test(p);
}

function getBaseUrl() {
  const rawBase =
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    typeof import.meta.env.BASE_URL === "string"
      ? import.meta.env.BASE_URL
      : "/";
  return rawBase;
}

function normalizeBasePath(base) {
  const b = base.endsWith("/") ? base : `${base}/`;
  return b.startsWith("/") ? b : `/${b}`;
}

function encodePath(path) {
  const trimmed = path.startsWith("/") ? path.slice(1) : path;
  return trimmed
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function resolveAssetPath(inputPath) {
  if (!inputPath) return "";
  if (isAbsoluteUrl(inputPath)) return inputPath;
  const base = normalizeBasePath(getBaseUrl());
  const encoded = encodePath(inputPath);
  return `${base}${encoded}`;
}

function toFriendlyLabel(fileName) {
  return fileName
    .replace(/\.(glb|gltf)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b([a-z])/g, (_, char) => char.toUpperCase())
    .trim();
}

async function loadNpcPack(labelPrefix, basePath, files) {
  const results = await Promise.all(
    files.map(async (file) => {
      const gltf = await safeLoad(`${labelPrefix} ${file}`, () =>
        gltfLoader.loadAsync(resolveAssetPath(`${basePath}/${file}`))
      );
      if (!gltf) return null;
      return {
        scene: gltf.scene,
        animations: gltf.animations ?? [],
        label: toFriendlyLabel(file),
      };
    })
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
    // future: could load a separate collision mesh file here if desired
  ] = await Promise.all([
    safeLoad("mall kiosk model", () =>
      gltfLoader.loadAsync(resolveAssetPath("assets/mall_kiosk.gltf"))
    ),
    safeLoad("column model", () =>
      gltfLoader.loadAsync(resolveAssetPath("assets/mall_column.gltf"))
    ),
    safeLoad("banner model", () =>
      gltfLoader.loadAsync(resolveAssetPath("assets/mall_banner.gltf"))
    ),
    safeLoad("banner texture", () =>
      textureLoader.loadAsync(resolveAssetPath("assets/mall_banner.png"))
    ),
    safeLoad("shopping mall model", () =>
      gltfLoader.loadAsync(resolveAssetPath("assets/shopping_mall/scene.gltf"))
    ),
    safeLoad("mobility scooter model", () =>
      gltfLoader.loadAsync(
        resolveAssetPath("assets/mobility_scooter_animated/scene.gltf")
      )
    ),
    safeLoad("evil old lady model", () =>
      gltfLoader.loadAsync(resolveAssetPath("assets/evil_old_lady/scene.gltf"))
    ),
    safeLoad("base npc model", () =>
      gltfLoader.loadAsync(resolveAssetPath("assets/Character Base.gltf"))
    ),
  ]);

  // Note: all loader functions return lightweight clones; heavy packs load lazily.

  const kioskScene = kioskGltf ? kioskGltf.scene : null;
  const columnScene = columnGltf ? columnGltf.scene : null;
  const bannerScene = bannerGltf ? bannerGltf.scene : null;
  const mallScene = mallSceneGltf ? mallSceneGltf.scene : null;
  const scooterScene = scooterGltf ? scooterGltf.scene : null;
  const riderScene = riderGltf ? riderGltf.scene : null;
  const characterBaseScene = characterBaseGltf ? characterBaseGltf.scene : null;

  const animatedMenVariants = [];
  const animatedWomenVariants = [];

  const collisionOnlyMall = false; // flip true to use “collision-only” layout by default
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
    characterBaseAnimations: characterBaseGltf
      ? characterBaseGltf.animations ?? []
      : [],
    animatedMenVariants,
    animatedWomenVariants,
    collisionOnlyMall,
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

// Load heavy NPC packs lazily to improve startup.
export async function loadNpcPacks() {
  const menNpcGltfs = await loadNpcPack(
    "animated men npc",
    "assets/Animated Men Pack-glb",
    [
      "Man.gltf",
      "Man in Suit.gltf",
      "Man in Long Sleeves.gltf",
      "Man-fjHyMd5Wxw.gltf",
    ]
  );

  const womenNpcGltfs = await loadNpcPack(
    "animated women npc",
    "assets/Ultimate Modular Women Pack-glb",
    [
      "Animated Woman.gltf",
      "Animated Woman-nIItLV9nxS.gltf",
      "Adventurer.gltf",
      "Medieval.gltf",
      "Punk.gltf",
      "Sci Fi Character.gltf",
      "Soldier.gltf",
      "Suit.gltf",
      "Witch.gltf",
      "Worker.gltf",
    ]
  );

  return {
    animatedMenVariants: menNpcGltfs,
    animatedWomenVariants: womenNpcGltfs,
  };
}
