import {
  AmbientLight,
  BoxGeometry,
  Clock,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Body, Box as CannonBox, Plane as CannonPlane, Vec3, World } from 'cannon-es';

const canvas = document.getElementById('app');
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new Scene();
scene.background = new Color('#1a1d21');

const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(6, 4, 8);
scene.add(camera);

const ambient = new AmbientLight(0xffffff, 0.4);
scene.add(ambient);

const sun = new DirectionalLight(0xffffff, 0.8);
sun.position.set(5, 10, 4);
scene.add(sun);

const world = new World({ gravity: new Vec3(0, -9.82, 0) });

const groundBody = new Body({ mass: 0, shape: new CannonPlane() });
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

const ground = new Mesh(
  new PlaneGeometry(120, 120),
  new MeshStandardMaterial({ color: '#2f3b40' }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const scooterSize = new Vec3(1.2, 0.4, 2.4);
const scooterHalfExtents = new Vec3(
  scooterSize.x / 2,
  scooterSize.y / 2,
  scooterSize.z / 2,
);

const scooterBody = new Body({
  mass: 25,
  shape: new CannonBox(scooterHalfExtents),
  position: new Vec3(0, 1, 0),
  angularDamping: 0.5,
  linearDamping: 0.3,
});
world.addBody(scooterBody);

const scooter = new Mesh(
  new BoxGeometry(scooterSize.x, scooterSize.y, scooterSize.z),
  new MeshStandardMaterial({ color: '#f0567d' }),
);
scene.add(scooter);

const keys = new Set();
window.addEventListener('keydown', (event) => keys.add(event.key.toLowerCase()));
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

function readInput() {
  const forward = keys.has('arrowup') || keys.has('w');
  const backward = keys.has('arrowdown') || keys.has('s');
  const left = keys.has('arrowleft') || keys.has('a');
  const right = keys.has('arrowright') || keys.has('d');
  return { forward, backward, left, right };
}

const tmpForce = new Vec3();
const forwardVector = new Vec3(0, 0, -1);
const cameraOffset = new Vector3(-6, 4, 8);
const cameraTarget = new Vector3();
const desiredCamera = new Vector3();
const tmpOffset = new Vector3();
const clock = new Clock();

function updatePhysics(delta) {
  const { forward, backward, left, right } = readInput();
  const drive = (forward ? 1 : 0) - (backward ? 1 : 0);
  const steer = (right ? 1 : 0) - (left ? 1 : 0);

  if (drive !== 0) {
    forwardVector.set(0, 0, -1);
    scooterBody.quaternion.vmult(forwardVector, forwardVector);
    tmpForce.copy(forwardVector).scale(75 * drive);
    scooterBody.applyForce(tmpForce, scooterBody.position);
  }

  if (steer !== 0) {
    scooterBody.angularVelocity.y -= steer * delta * 5;
  }

  world.step(1 / 60, delta, 3);
}

function syncGraphics() {
  scooter.position.copy(scooterBody.position);
  scooter.quaternion.copy(scooterBody.quaternion);

  cameraTarget.copy(scooter.position);
  tmpOffset.copy(cameraOffset).applyQuaternion(scooter.quaternion);
  desiredCamera.copy(scooter.position).add(tmpOffset);
  camera.position.lerp(desiredCamera, 0.1);
  camera.lookAt(cameraTarget);
}

function animate() {
  const delta = clock.getDelta();
  updatePhysics(delta);
  syncGraphics();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onResize);
