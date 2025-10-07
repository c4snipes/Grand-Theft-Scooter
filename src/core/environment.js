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

// --> Core Environment: I pieced this together from a few tutorials so the scene actually shows up.
export function createEnvironment(canvas, assets = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new Scene();
  scene.background = new Color('#14181c');

  // Camera that sits kind of behind the scooter.
  const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(6, 4, 8);
  scene.add(camera);

  // Simple lights so things aren't totally dark.
  const ambient = new AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  const ceilingGlow = new HemisphereLight(0x4f6470, 0x111518, 0.35);
  scene.add(ceilingGlow);

  const sun = new DirectionalLight(0xffffff, 0.8);
  sun.position.set(5, 10, 4);
  scene.add(sun);

  // Flat ground so the physics bodies have something to collide with.
  const groundMaterial = assets.floorTexture
    ? new MeshStandardMaterial({
        color: '#d2d6dc',
        metalness: 0.05,
        roughness: 0.85,
        map: assets.floorTexture,
      })
    : new MeshStandardMaterial({ color: '#2f3b40' });

  const ground = new Mesh(
    new PlaneGeometry(160, 160),
    groundMaterial,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.position.y = -0.02;
  scene.add(ground);

  if (assets.mallScene) {
    const mall = assets.mallScene.clone(true);
    mall.name = 'shopping-mall';
    const mallScale = 0.001;
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
    mall.position.set(-center.x, ground.position.y - min.y, -center.z);
    mall.updateMatrixWorld(true);
    scene.add(mall);
  }

  const cameraOffset = new Vector3(-6, 4, 8);
  const cameraTarget = new Vector3();
  const desiredCamera = new Vector3();
  const tmpOffset = new Vector3();

  function updateCameraFollow(target) {
    // This keeps the camera floating over the scooter. It looks fancy but it's just lerp.
    cameraTarget.copy(target.position);
    tmpOffset.copy(cameraOffset).applyQuaternion(target.quaternion);
    desiredCamera.copy(target.position).add(tmpOffset);
    camera.position.lerp(desiredCamera, 0.1);
    camera.lookAt(cameraTarget);
  }

  function handleResize() {
    // Whenever I resize the window I have to resize the canvas too or it stretches weirdly.
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  return {
    renderer,
    scene,
    camera,
    ground,
    updateCameraFollow,
    handleResize,
  };
}
