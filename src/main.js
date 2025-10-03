import {
  AmbientLight,
  BoxGeometry,
  Clock,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
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

const scooterSize = new Vec3(1.2, 1.6, 3);
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

function createScooterMesh() {
  const scooterGroup = new Group();
  scooterGroup.name = 'scooter';

  const primaryPaint = new MeshStandardMaterial({ color: '#f0567d', metalness: 0.3, roughness: 0.55 });
  const accentPaint = new MeshStandardMaterial({ color: '#292d36', roughness: 0.9 });
  const polishedMetal = new MeshStandardMaterial({ color: '#d7d9dc', metalness: 1, roughness: 0.25 });
  const seatMaterial = new MeshStandardMaterial({ color: '#4b3f3a', roughness: 0.7 });
  const skinMaterial = new MeshStandardMaterial({ color: '#f7d7c4', roughness: 0.6 });
  const fabricMaterial = new MeshStandardMaterial({ color: '#78b0a0', roughness: 0.8 });
  const hairMaterial = new MeshStandardMaterial({ color: '#dad0c6', roughness: 0.4 });
  const glassMaterial = new MeshStandardMaterial({
    color: '#fff7c7',
    emissive: '#ffd36e',
    emissiveIntensity: 0.6,
    roughness: 0.3,
  });

  const deck = new Mesh(new BoxGeometry(0.6, 0.12, 1.8), primaryPaint);
  deck.position.set(0, -0.35, -0.1);
  scooterGroup.add(deck);

  const wheelGeometry = new CylinderGeometry(0.35, 0.35, 0.2, 24);
  wheelGeometry.rotateZ(Math.PI / 2);

  const rearWheel = new Mesh(wheelGeometry, accentPaint);
  rearWheel.position.set(0, -0.35, -1.05);
  scooterGroup.add(rearWheel);

  const frontWheel = rearWheel.clone();
  frontWheel.position.z = 1.15;
  scooterGroup.add(frontWheel);

  const hubGeometry = new CylinderGeometry(0.12, 0.12, 0.24, 16);
  hubGeometry.rotateZ(Math.PI / 2);

  const rearHub = new Mesh(hubGeometry, polishedMetal);
  rearHub.position.copy(rearWheel.position);
  scooterGroup.add(rearHub);

  const frontHub = rearHub.clone();
  frontHub.position.z = frontWheel.position.z;
  scooterGroup.add(frontHub);

  const frontFork = new Mesh(new BoxGeometry(0.12, 0.9, 0.24), polishedMetal);
  frontFork.position.set(0, -0.05, 1.05);
  scooterGroup.add(frontFork);

  const seatPost = new Mesh(new CylinderGeometry(0.07, 0.07, 0.9, 16), polishedMetal);
  seatPost.position.set(0, 0.1, -0.55);
  scooterGroup.add(seatPost);

  const seat = new Mesh(new BoxGeometry(0.36, 0.09, 0.42), seatMaterial);
  seat.position.set(0, 0.58, -0.55);
  scooterGroup.add(seat);

  const steeringColumn = new Mesh(new CylinderGeometry(0.08, 0.08, 1.5, 20), polishedMetal);
  steeringColumn.position.set(0, 0.42, 0.6);
  steeringColumn.rotation.x = -Math.PI / 10;
  scooterGroup.add(steeringColumn);

  const handlebarGeometry = new CylinderGeometry(0.05, 0.05, 0.65, 18);
  handlebarGeometry.rotateZ(Math.PI / 2);

  const handlebar = new Mesh(handlebarGeometry, polishedMetal);
  handlebar.position.set(0, 1.08, 0.22);
  scooterGroup.add(handlebar);

  const gripGeometry = new CylinderGeometry(0.07, 0.07, 0.14, 12);
  gripGeometry.rotateZ(Math.PI / 2);

  const leftGrip = new Mesh(gripGeometry, primaryPaint);
  leftGrip.position.set(0.33, 1.08, 0.22);
  scooterGroup.add(leftGrip);

  const rightGrip = leftGrip.clone();
  rightGrip.position.x = -leftGrip.position.x;
  scooterGroup.add(rightGrip);

  const headlight = new Mesh(new SphereGeometry(0.12, 16, 16), glassMaterial);
  headlight.position.set(0, 0.35, 1.25);
  scooterGroup.add(headlight);

  const grandma = new Group();
  grandma.position.set(0, 0.25, -0.55);

  const skirt = new Mesh(new CylinderGeometry(0.28, 0.36, 0.5, 24), fabricMaterial);
  skirt.position.set(0, 0.15, 0);
  grandma.add(skirt);

  const torso = new Mesh(new CylinderGeometry(0.22, 0.22, 0.4, 20), primaryPaint);
  torso.position.set(0, 0.55, 0);
  grandma.add(torso);

  const head = new Mesh(new SphereGeometry(0.18, 20, 20), skinMaterial);
  head.position.set(0, 0.92, 0.06);
  grandma.add(head);

  const bun = new Mesh(new SphereGeometry(0.12, 16, 16), hairMaterial);
  bun.position.set(0, 1.08, -0.05);
  grandma.add(bun);

  const armGeometry = new CylinderGeometry(0.06, 0.06, 0.5, 16);

  const leftArm = new Mesh(armGeometry, primaryPaint);
  leftArm.position.set(0.18, 0.68, 0.2);
  leftArm.rotation.set(-Math.PI / 5, 0, Math.PI / 4);
  grandma.add(leftArm);

  const rightArm = leftArm.clone();
  rightArm.position.x = -leftArm.position.x;
  rightArm.rotation.set(-Math.PI / 5, 0, -Math.PI / 4);
  grandma.add(rightArm);

  const handGeometry = new SphereGeometry(0.07, 12, 12);
  const leftHand = new Mesh(handGeometry, skinMaterial);
  leftHand.position.set(0.34, 0.94, 0.2);
  scooterGroup.add(leftHand);

  const rightHand = leftHand.clone();
  rightHand.position.x = -leftHand.position.x;
  scooterGroup.add(rightHand);

  const legGeometry = new CylinderGeometry(0.08, 0.08, 0.5, 16);

  const leftLeg = new Mesh(legGeometry, fabricMaterial);
  leftLeg.position.set(0.12, -0.1, 0.05);
  leftLeg.rotation.x = Math.PI / 9;
  grandma.add(leftLeg);

  const rightLeg = leftLeg.clone();
  rightLeg.position.x = -leftLeg.position.x;
  rightLeg.rotation.x = Math.PI / 6;
  grandma.add(rightLeg);

  const cane = new Mesh(new CylinderGeometry(0.03, 0.03, 0.8, 12), new MeshStandardMaterial({ color: '#a77855', roughness: 0.9 }));
  cane.position.set(0.38, 0.22, 0.65);
  cane.rotation.set(Math.PI / 2.8, 0, Math.PI / 8);
  scooterGroup.add(cane);

  const caneTip = new Mesh(new SphereGeometry(0.05, 10, 10), accentPaint);
  caneTip.position.set(0.56, -0.24, 0.85);
  scooterGroup.add(caneTip);

  scooterGroup.add(grandma);

  return scooterGroup;
}

const scooter = createScooterMesh();
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
