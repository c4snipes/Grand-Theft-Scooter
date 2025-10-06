import {
  AmbientLight,
  BoxGeometry,
  CircleGeometry,
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

const scoreEl = document.createElement('div');
scoreEl.id = 'scoreboard';
scoreEl.textContent = 'Score: 0';
Object.assign(scoreEl.style, {
  position: 'fixed',
  top: '20px',
  left: '20px',
  padding: '12px 18px',
  background: 'rgba(17, 21, 26, 0.85)',
  color: '#f5f5f5',
  fontFamily: 'system-ui, sans-serif',
  fontSize: '20px',
  letterSpacing: '0.05em',
  borderRadius: '10px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
  pointerEvents: 'none',
  zIndex: '10',
});
document.body.appendChild(scoreEl);

let score = 0;
function updateScoreboard() {
  scoreEl.textContent = `Score: ${score}`;
}

const interactables = [];
const dynamicActors = [];

const mallBounds = {
  halfExtent: 46,
  clearRadius: 7,
};

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function choose(array) {
  return array[Math.floor(Math.random() * array.length)];
}

const shirtPalette = ['#4f7cd1', '#d94f70', '#4fbfa8', '#f0821f'];
const pantsPalette = ['#383f4c', '#2f3645', '#48423c', '#2d3a4f'];
const hairPalette = ['#2b1f1a', '#d8c4a5', '#3b2f26', '#51423b'];

const propMaterials = {
  kioskPrimary: new MeshStandardMaterial({ color: '#3e7cb1', roughness: 0.55, metalness: 0.1 }),
  kioskAccent: new MeshStandardMaterial({ color: '#f3a712', roughness: 0.6 }),
  planter: new MeshStandardMaterial({ color: '#4c5a52', roughness: 0.95 }),
  foliage: new MeshStandardMaterial({ color: '#2f8f5e', roughness: 0.75 }),
  benchSeat: new MeshStandardMaterial({ color: '#a97155', roughness: 0.8 }),
  benchFrame: new MeshStandardMaterial({ color: '#2c3036', roughness: 0.5 }),
  cartPrimary: new MeshStandardMaterial({ color: '#d94f70', roughness: 0.6 }),
  cartAccent: new MeshStandardMaterial({ color: '#fce36b', roughness: 0.4 }),
  humanSkin: new MeshStandardMaterial({ color: '#f2c7a6', roughness: 0.65 }),
  humanTop: new MeshStandardMaterial({ color: '#4f7cd1', roughness: 0.75 }),
  humanBottom: new MeshStandardMaterial({ color: '#383f4c', roughness: 0.7 }),
  humanHair: new MeshStandardMaterial({ color: '#2b1f1a', roughness: 0.5 }),
  floorPrimary: new MeshStandardMaterial({ color: '#27333a', roughness: 0.95 }),
  floorAccent: new MeshStandardMaterial({ color: '#1c2329', roughness: 0.95 }),
  fountainBase: new MeshStandardMaterial({ color: '#d7dadf', roughness: 0.4 }),
  fountainWater: new MeshStandardMaterial({ color: '#4aa3d8', roughness: 0.2, metalness: 0.2 }),
};

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

function buildMallDecor() {
  const decor = new Group();
  decor.name = 'mall-decor';
  decor.position.y = 0.015;

  const mainStrip = new Mesh(new PlaneGeometry(18, mallBounds.halfExtent * 2), propMaterials.floorPrimary);
  mainStrip.rotation.x = -Math.PI / 2;
  decor.add(mainStrip);

  const crossStrip = new Mesh(new PlaneGeometry(mallBounds.halfExtent * 2, 14), propMaterials.floorPrimary);
  crossStrip.rotation.x = -Math.PI / 2;
  decor.add(crossStrip);

  const plaza = new Mesh(new CircleGeometry(8, 48), propMaterials.floorAccent);
  plaza.rotation.x = -Math.PI / 2;
  decor.add(plaza);

  const fountainPedestal = new Mesh(new CylinderGeometry(4.8, 5.4, 0.9, 40), propMaterials.fountainBase);
  fountainPedestal.position.y = 0.45;
  decor.add(fountainPedestal);

  const fountainPool = new Mesh(new CylinderGeometry(4, 4, 0.3, 36), propMaterials.fountainWater);
  fountainPool.position.y = 0.75;
  decor.add(fountainPool);

  scene.add(decor);
}

function registerInteractable({ mesh, body, label, points, type, onUpdate }) {
  const record = { mesh, body, label, points, type, hit: false, onUpdate: onUpdate ?? null };
  body.userData = record;
  interactables.push(record);
  if (record.onUpdate) {
    dynamicActors.push(record);
  }
  scene.add(mesh);
  world.addBody(body);
}

function isPositionFree(pos, minDistance) {
  const minDistanceSq = minDistance * minDistance;
  for (const record of interactables) {
    const dx = record.body.position.x - pos.x;
    const dz = record.body.position.z - pos.z;
    if (dx * dx + dz * dz < minDistanceSq) {
      return false;
    }
  }
  return true;
}

function findSpawnPosition(minDistance = 4) {
  const attempts = 24;
  for (let i = 0; i < attempts; i += 1) {
    const candidate = new Vector3(
      randomRange(-mallBounds.halfExtent, mallBounds.halfExtent),
      0,
      randomRange(-mallBounds.halfExtent, mallBounds.halfExtent),
    );
    if (Math.hypot(candidate.x, candidate.z) < mallBounds.clearRadius + 1.5) continue;
    if (Math.abs(candidate.x) < 5 && Math.abs(candidate.z) < 10) continue;
    if (isPositionFree(candidate, minDistance)) {
      return candidate;
    }
  }
  return new Vector3(
    randomRange(-mallBounds.halfExtent, mallBounds.halfExtent),
    0,
    randomRange(-mallBounds.halfExtent, mallBounds.halfExtent),
  );
}

function createPlanter(position) {
  const height = randomRange(0.5, 0.9);
  const radius = randomRange(0.6, 1.1);
  const planter = new Group();
  planter.name = 'planter';

  const pot = new Mesh(new CylinderGeometry(radius, radius * 1.1, height, 24), propMaterials.planter);
  planter.add(pot);

  const foliage = new Mesh(new SphereGeometry(radius * 0.95, 20, 16), propMaterials.foliage);
  foliage.position.y = height / 2 + radius * 0.6;
  planter.add(foliage);

  const centerY = height / 2;
  planter.position.set(position.x, centerY, position.z);

  const body = new Body({
    mass: 0,
    shape: new CannonBox(new Vec3(radius, centerY, radius)),
    position: new Vec3(position.x, centerY, position.z),
  });

  registerInteractable({
    mesh: planter,
    body,
    label: 'Planter',
    points: 40,
    type: 'prop',
  });
}

function createBench(position) {
  const width = randomRange(2.2, 3.0);
  const depth = 0.65;
  const height = 0.7;

  const bench = new Group();
  bench.name = 'bench';

  const seat = new Mesh(new BoxGeometry(width, 0.12, depth), propMaterials.benchSeat);
  seat.position.y = 0;
  bench.add(seat);

  const backRest = new Mesh(new BoxGeometry(width, 0.5, 0.12), propMaterials.benchSeat);
  backRest.position.set(0, 0.31, -depth / 2);
  bench.add(backRest);

  const legGeometry = new BoxGeometry(0.12, height, 0.12);
  const leftLeg = new Mesh(legGeometry, propMaterials.benchFrame);
  leftLeg.position.set(-width / 2 + 0.15, -height / 2 + 0.06, depth / 2 - 0.1);
  bench.add(leftLeg);

  const rightLeg = leftLeg.clone();
  rightLeg.position.x = width / 2 - 0.15;
  bench.add(rightLeg);

  const backLegLeft = new Mesh(legGeometry, propMaterials.benchFrame);
  backLegLeft.position.set(-width / 2 + 0.15, -height / 2 + 0.06, -depth / 2 + 0.1);
  bench.add(backLegLeft);

  const backLegRight = backLegLeft.clone();
  backLegRight.position.x = width / 2 - 0.15;
  bench.add(backLegRight);

  const centerY = height / 2;
  bench.position.set(position.x, centerY, position.z);

  const body = new Body({
    mass: 0,
    shape: new CannonBox(new Vec3(width / 2, centerY, depth / 2)),
    position: new Vec3(position.x, centerY, position.z),
  });

  registerInteractable({
    mesh: bench,
    body,
    label: 'Bench',
    points: 55,
    type: 'prop',
  });
}

function createFoodCart(position) {
  const width = 1.8;
  const height = 1.6;
  const depth = 1.1;

  const cart = new Group();
  cart.name = 'food-cart';

  const base = new Mesh(new BoxGeometry(width, 0.9, depth), propMaterials.cartPrimary);
  base.position.y = -0.3;
  cart.add(base);

  const canopy = new Mesh(new BoxGeometry(width + 0.4, 0.2, depth + 0.4), propMaterials.cartAccent);
  canopy.position.y = 0.6;
  cart.add(canopy);

  const poleGeometry = new CylinderGeometry(0.05, 0.05, 1.0, 12);
  const leftPole = new Mesh(poleGeometry, propMaterials.cartAccent);
  leftPole.position.set(-width / 2 + 0.2, 0.1, -depth / 2 + 0.15);
  cart.add(leftPole);

  const rightPole = leftPole.clone();
  rightPole.position.x = width / 2 - 0.2;
  cart.add(rightPole);

  const axleGeometry = new CylinderGeometry(0.22, 0.22, depth + 0.2, 16);
  axleGeometry.rotateZ(Math.PI / 2);
  const wheelLeft = new Mesh(axleGeometry, propMaterials.benchFrame);
  wheelLeft.position.set(-width / 2 + 0.1, -0.65, 0);
  cart.add(wheelLeft);

  const wheelRight = wheelLeft.clone();
  wheelRight.position.x = width / 2 - 0.1;
  cart.add(wheelRight);

  const centerY = 0.8;
  cart.position.set(position.x, centerY, position.z);

  const body = new Body({
    mass: 6,
    shape: new CannonBox(new Vec3(width / 2, 0.8, depth / 2)),
    position: new Vec3(position.x, centerY, position.z),
    angularDamping: 0.85,
    linearDamping: 0.65,
  });

  registerInteractable({
    mesh: cart,
    body,
    label: 'Food Cart',
    points: 85,
    type: 'prop',
  });
}

function createMallPatron(position) {
  const group = new Group();
  group.name = 'mall-patron';

  const shirtColor = choose(shirtPalette);
  const pantsColor = choose(pantsPalette);
  const hairColor = choose(hairPalette);

  const torsoMaterial = propMaterials.humanTop.clone();
  torsoMaterial.color = new Color(shirtColor);
  const legMaterial = propMaterials.humanBottom.clone();
  legMaterial.color = new Color(pantsColor);
  const hairMaterial = propMaterials.humanHair.clone();
  hairMaterial.color = new Color(hairColor);

  const legs = new Mesh(new CylinderGeometry(0.22, 0.26, 0.9, 16), legMaterial);
  legs.position.y = -0.25;
  group.add(legs);

  const torso = new Mesh(new CylinderGeometry(0.28, 0.24, 0.9, 16), torsoMaterial);
  torso.position.y = 0.4;
  group.add(torso);

  const neck = new Mesh(new CylinderGeometry(0.1, 0.1, 0.15, 10), propMaterials.humanSkin);
  neck.position.y = 0.9;
  group.add(neck);

  const head = new Mesh(new SphereGeometry(0.22, 18, 14), propMaterials.humanSkin);
  head.position.y = 1.15;
  group.add(head);

  const hair = new Mesh(new SphereGeometry(0.24, 18, 14), hairMaterial);
  hair.position.set(0, 1.18, -0.02);
  hair.scale.set(1, 0.7, 1);
  group.add(hair);

  const armGeometry = new CylinderGeometry(0.1, 0.08, 0.7, 12);
  armGeometry.rotateZ(Math.PI / 16);
  const leftArm = new Mesh(armGeometry, torsoMaterial);
  leftArm.position.set(0.32, 0.5, 0.12);
  group.add(leftArm);

  const rightArm = leftArm.clone();
  rightArm.position.x = -0.32;
  rightArm.rotation.z = -leftArm.rotation.z;
  group.add(rightArm);

  const centerY = 0.9;
  group.position.set(position.x, centerY, position.z);

  const body = new Body({
    mass: 3.5,
    shape: new CannonBox(new Vec3(0.32, centerY, 0.28)),
    position: new Vec3(position.x, centerY, position.z),
    angularDamping: 0.95,
    linearDamping: 0.8,
  });
  body.fixedRotation = true;
  body.updateMassProperties();

  const idlePhase = Math.random() * Math.PI * 2;
  registerInteractable({
    mesh: group,
    body,
    label: 'Mall Patron',
    points: 150,
    type: 'human',
    onUpdate: (delta, record) => {
      record.mesh.rotation.y += delta * 0.1;
      const bounce = Math.sin((performance.now() / 600) + idlePhase) * 0.02;
      record.mesh.position.y = record.body.position.y + bounce;
    },
  });
}

function populateMall() {
  buildMallDecor();

  const planters = 14;
  for (let i = 0; i < planters; i += 1) {
    createPlanter(findSpawnPosition(4));
  }

  const benches = 10;
  for (let i = 0; i < benches; i += 1) {
    createBench(findSpawnPosition(5));
  }

  const carts = 8;
  for (let i = 0; i < carts; i += 1) {
    createFoodCart(findSpawnPosition(6));
  }

  const patrons = 12;
  for (let i = 0; i < patrons; i += 1) {
    createMallPatron(findSpawnPosition(5));
  }
}

populateMall();

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

function syncGraphics(delta) {
  scooter.position.copy(scooterBody.position);
  scooter.quaternion.copy(scooterBody.quaternion);

  for (const record of interactables) {
    const { mesh, body } = record;
    mesh.position.set(body.position.x, body.position.y, body.position.z);
    mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
  }

  for (const actor of dynamicActors) {
    if (!actor.hit && actor.onUpdate) {
      actor.onUpdate(delta, actor);
    }
  }

  cameraTarget.copy(scooter.position);
  tmpOffset.copy(cameraOffset).applyQuaternion(scooter.quaternion);
  desiredCamera.copy(scooter.position).add(tmpOffset);
  camera.position.lerp(desiredCamera, 0.1);
  camera.lookAt(cameraTarget);
}

function animate() {
  const delta = clock.getDelta();
  updatePhysics(delta);
  syncGraphics(delta);
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
