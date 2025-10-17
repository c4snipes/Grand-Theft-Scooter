import * as THREE from 'three';

export function createGameLoop({
  clock,
  readInput,
  updatePhysics,
  updateRunTelemetry,
  syncGraphics,
  renderer,
  camera,
  orbitControls,
  isFreeCameraActive,
  alignHorizontalAxis,
}) {
  // Free camera movement helpers
  const cameraForward = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const cameraMove = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);

  // Dynamic resolution scaling
  const basePixelRatio = Math.min(window.devicePixelRatio, 1.5);
  let dynamicPixelRatio = basePixelRatio;
  let fpsEMA = 60;

  function updateFreeCameraMovement(delta, input) {
    if (!isFreeCameraActive()) return;
    const moveZ = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (moveZ === 0 && moveX === 0) return;

    camera.getWorldDirection(cameraForward);
    alignHorizontalAxis(cameraForward, 0, -1);
    cameraRight.copy(cameraForward).cross(worldUp);
    alignHorizontalAxis(cameraRight, 1, 0);

    cameraMove.set(0, 0, 0);
    cameraMove.addScaledVector(cameraForward, moveZ);
    cameraMove.addScaledVector(cameraRight, moveX);
    if (cameraMove.lengthSq() === 0) return;
    cameraMove.normalize().multiplyScalar(delta * 22);
    camera.position.add(cameraMove);
    orbitControls.target.add(cameraMove);
    orbitControls.update();
  }

  function updateDRS(delta) {
    const fps = delta > 0 ? 1 / delta : 60;
    fpsEMA = fpsEMA * 0.9 + fps * 0.1;
    let nextPR = dynamicPixelRatio;
    if (fpsEMA < 40 && dynamicPixelRatio > 1.0) nextPR = Math.max(1.0, dynamicPixelRatio - 0.1);
    else if (fpsEMA > 58 && dynamicPixelRatio < basePixelRatio) nextPR = Math.min(basePixelRatio, dynamicPixelRatio + 0.1);
    if (Math.abs(nextPR - dynamicPixelRatio) > 0.05) {
      dynamicPixelRatio = nextPR;
      renderer.setPixelRatio(dynamicPixelRatio);
    }
  }

  function frame() {
    const delta = clock.getDelta();
    const input = readInput();
    updatePhysics(delta, input);
    updateFreeCameraMovement(delta, input);
    updateRunTelemetry();
    updateDRS(delta);
    syncGraphics(delta);
    requestAnimationFrame(frame);
  }

  return { start: () => requestAnimationFrame(frame) };
}
