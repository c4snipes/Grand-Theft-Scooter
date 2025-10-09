import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --> Core Environment: I pieced this together from a few tutorials so the scene actually shows up.
export function createEnvironment(canvas, assets = {}, options = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new Scene();
  scene.background = new Color('#dfe6ef');

  // Camera that sits kind of behind the scooter.
  const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(50, 28, 50);
  scene.add(camera);

  renderer.domElement.style.cursor = 'grab';
  renderer.domElement.style.touchAction = 'none';

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.target.set(0, 2, 0);
  controls.enabled = false;
  controls.update();
  controls.addEventListener('start', () => {
    renderer.domElement.style.cursor = 'grabbing';
  });
  controls.addEventListener('end', () => {
    renderer.domElement.style.cursor = 'grab';
  });

  // Bright, neutral lights so assets pop against the background.
  const ambient = new AmbientLight(0xffffff, 0.7);
  scene.add(ambient);

  const ceilingGlow = new HemisphereLight(0xf1f5fd, 0xcfd8e3, 0.6);
  scene.add(ceilingGlow);

  const sun = new DirectionalLight(0xfff5dd, 1.2);
  sun.position.set(12, 24, 10);
  sun.castShadow = true;
  scene.add(sun);

  // Flat ground so the physics bodies have something to collide with.
  const groundMaterial = new MeshStandardMaterial({
    color: '#d1d9e6',
    metalness: 0.02,
    roughness: 0.75,
  });

  let ground = null;
  if (!assets.mallScene) {
    ground = new Mesh(
      new PlaneGeometry(160, 160),
      groundMaterial,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.y = -0.02;
    scene.add(ground);
  }

  if (assets.mallScene) {
    const mall = assets.mallScene.clone(true);
    mall.name = 'shopping-mall';
    const mallScale = 1.6;
    mall.scale.setScalar(mallScale);
    mall.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            if (mat && mat.map) {
              mat.map.colorSpace = mat.map.colorSpace ?? renderer.outputColorSpace;
            }
          });
        } else if (child.material && child.material.map) {
          child.material.map.colorSpace = child.material.map.colorSpace ?? renderer.outputColorSpace;
        }
      }
    });
    mall.updateMatrixWorld(true);

    const bounds = new Box3().setFromObject(mall);
    const center = bounds.getCenter(new Vector3());
    const min = bounds.min.clone();
    const groundOffset = ground ? ground.position.y : 0;
    mall.position.set(-center.x, groundOffset - min.y, -center.z);
    mall.updateMatrixWorld(true);
    scene.add(mall);
  }

  const cameraOffset = new Vector3(-14, 8, 22);
  const cameraTarget = new Vector3();
  const desiredCamera = new Vector3();
  const tmpOffset = new Vector3();
  let cameraMode = 'orbit';

  function updateCameraFollow(target) {
    if (cameraMode !== 'follow' || !target) return;
    cameraTarget.copy(target.position);
    tmpOffset.copy(cameraOffset).applyQuaternion(target.quaternion);
    desiredCamera.copy(target.position).add(tmpOffset);
    camera.position.lerp(desiredCamera, 0.15);
    camera.lookAt(cameraTarget);
  }

  function handleResize() {
    // Whenever I resize the window I have to resize the canvas too or it stretches weirdly.
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  const brightPalette = {
    background: '#dfe6ef',
    ambientColor: '#ffffff',
    ambientIntensity: 0.7,
    hemisphereSky: '#f3f7fe',
    hemisphereGround: '#c9d6e6',
    hemisphereIntensity: 0.6,
    sunColor: '#fff3db',
    sunIntensity: 1.2,
    groundColor: '#d1d9e6',
  };

  const darkPalette = {
    background: '#0b1014',
    ambientColor: '#1d2939',
    ambientIntensity: 0.6,
    hemisphereSky: '#1e293b',
    hemisphereGround: '#0b1014',
    hemisphereIntensity: 0.32,
    sunColor: '#94a3b8',
    sunIntensity: 0.85,
    groundColor: '#111c27',
  };

  function applyPalette(palette) {
    scene.background.set(palette.background);
    ambient.color.set(palette.ambientColor);
    ambient.intensity = palette.ambientIntensity;
    ceilingGlow.color.set(palette.hemisphereSky);
    ceilingGlow.groundColor.set(palette.hemisphereGround);
    ceilingGlow.intensity = palette.hemisphereIntensity;
    sun.color.set(palette.sunColor);
    sun.intensity = palette.sunIntensity;

    if (ground) {
      groundMaterial.color.set(palette.groundColor);
      groundMaterial.needsUpdate = true;
    }
  }

  let removeColorSchemeListener = null;
  const palettes = {
    light: brightPalette,
    dark: darkPalette,
  };
  let currentPalette = palettes.light;

  function setColorMode(mode) {
    const nextPalette = palettes[mode] ?? palettes.light;
    currentPalette = nextPalette;
    applyPalette(currentPalette);
  }

  setColorMode(options.theme);

  function setCameraMode(mode) {
    cameraMode = mode === 'follow' ? 'follow' : 'orbit';
    controls.enabled = cameraMode === 'orbit';
    if (controls.enabled) {
      controls.update();
    }
  }

  function updateCamera(target) {
    if (cameraMode === 'orbit') {
      controls.update();
    } else {
      updateCameraFollow(target);
    }
  }

  return {
    renderer,
    scene,
    camera,
    ground,
    setCameraMode,
    updateCamera,
    updateCameraFollow,
    handleResize,
    controls,
    setColorMode,
    dispose: () => {
      if (removeColorSchemeListener) {
        removeColorSchemeListener();
      }
    },
  };
}
