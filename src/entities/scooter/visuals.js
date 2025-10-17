import {
  Box3,
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

const TARGET_SCOOTER_SIZE = new Vector3(0.5, 0.9, 1.05);

export function buildFallbackScooterMesh() {
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

  rearWheel.name = 'rearWheel';
  frontWheel.name = 'frontWheel';

  const hubGeometry = new CylinderGeometry(0.12, 0.12, 0.24, 16);
  hubGeometry.rotateZ(Math.PI / 2);

  const rearHub = new Mesh(hubGeometry, polishedMetal);
  rearHub.position.copy(rearWheel.position);
  scooterGroup.add(rearHub);

  const frontHub = rearHub.clone();
  frontHub.position.z = frontWheel.position.z;
  scooterGroup.add(frontHub);

  rearHub.name = 'rearHub';
  frontHub.name = 'frontHub';

  const frontFork = new Mesh(new BoxGeometry(0.12, 0.9, 0.24), polishedMetal);
  frontFork.position.set(0, -0.05, 1.05);
  scooterGroup.add(frontFork);
  frontFork.name = 'fork';

  const seatPost = new Mesh(new CylinderGeometry(0.07, 0.07, 0.9, 16), polishedMetal);
  seatPost.position.set(0, 0.1, -0.55);
  scooterGroup.add(seatPost);

  const seat = new Mesh(new BoxGeometry(0.36, 0.09, 0.42), seatMaterial);
  seat.position.set(0, 0.58, -0.55);
  seat.name = 'seat';
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
  handlebar.name = 'handlebar';

  const gripGeometry = new CylinderGeometry(0.07, 0.07, 0.14, 12);
  gripGeometry.rotateZ(Math.PI / 2);
  const leftGrip = new Mesh(gripGeometry, primaryPaint);
  leftGrip.position.set(0.33, 1.08, 0.22);
  scooterGroup.add(leftGrip);
  const rightGrip = leftGrip.clone();
  rightGrip.position.x = -leftGrip.position.x;
  scooterGroup.add(rightGrip);
  leftGrip.name = 'leftGrip';
  rightGrip.name = 'rightGrip';

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
  leftArm.rotation.set(-Math.PI / 2.4, Math.PI / 14, Math.PI / 8);
  grandma.add(leftArm);
  const rightArm = leftArm.clone();
  rightArm.position.x = -leftArm.position.x;
  rightArm.rotation.set(-Math.PI / 2.4, -Math.PI / 14, -Math.PI / 8);
  grandma.add(rightArm);

  const handGeometry = new SphereGeometry(0.07, 12, 12);
  const leftHand = new Mesh(handGeometry, skinMaterial);
  leftHand.position.set(0.34, 0.94, 0.2);
  scooterGroup.add(leftHand);
  const rightHand = leftHand.clone();
  rightHand.position.x = -leftHand.position.x;
  scooterGroup.add(rightHand);

  function createLeg(side) {
    const legGroup = new Group();
    const thigh = new Mesh(new CylinderGeometry(0.11, 0.12, 0.5, 16), fabricMaterial);
    thigh.position.set(0, 0.1, 0.12);
    thigh.rotation.x = Math.PI / 2.1;
    legGroup.add(thigh);
    const calf = new Mesh(new CylinderGeometry(0.09, 0.09, 0.42, 16), fabricMaterial);
    calf.position.set(0, -0.12, 0.48);
    calf.rotation.x = Math.PI / 2.8;
    legGroup.add(calf);
    const foot = new Mesh(new BoxGeometry(0.26, 0.1, 0.42), accentPaint);
    foot.position.set(0, -0.28, 0.7);
    foot.rotation.x = Math.PI / 14;
    legGroup.add(foot);
    legGroup.position.set(0.14 * side, -0.12, 0.12);
    legGroup.rotation.y = (side * Math.PI) / 28;
    return legGroup;
  }
  grandma.add(createLeg(1));
  grandma.add(createLeg(-1));

  const cane = new Mesh(new CylinderGeometry(0.03, 0.03, 0.8, 12), new MeshStandardMaterial({ color: '#a77855', roughness: 0.9 }));
  cane.position.set(0.38, 0.22, 0.65);
  cane.rotation.set(Math.PI / 2.8, 0, Math.PI / 8);
  scooterGroup.add(cane);
  const caneTip = new Mesh(new SphereGeometry(0.05, 10, 10), accentPaint);
  caneTip.position.set(0.56, -0.24, 0.85);
  scooterGroup.add(caneTip);
  scooterGroup.add(grandma);

  scooterGroup.updateMatrixWorld(true);
  const fallbackBounds = new Box3().setFromObject(scooterGroup);
  const fallbackSize = fallbackBounds.getSize(new Vector3());
  const fallbackScale = fallbackSize.z > 0 ? TARGET_SCOOTER_SIZE.z / fallbackSize.z : 1;
  scooterGroup.scale.setScalar(fallbackScale);
  scooterGroup.updateMatrixWorld(true);
  const normalizedBounds = new Box3().setFromObject(scooterGroup);
  const normalizedCenter = normalizedBounds.getCenter(new Vector3());
  scooterGroup.position.sub(normalizedCenter);
  scooterGroup.position.y -= normalizedBounds.min.y;

  const wheelsMeta = scooterGroup.userData.wheels || {};
  wheelsMeta.frontWheel = wheelsMeta.frontWheel || frontWheel;
  wheelsMeta.rearWheel = wheelsMeta.rearWheel || rearWheel;
  wheelsMeta.fork = wheelsMeta.fork || frontFork;
  wheelsMeta.handlebar = wheelsMeta.handlebar || handlebar;
  wheelsMeta.frontRadius = computeWheelRadius(wheelsMeta.frontWheel) ?? wheelsMeta.frontRadius ?? 0.18;
  wheelsMeta.rearRadius = computeWheelRadius(wheelsMeta.rearWheel) ?? wheelsMeta.rearRadius ?? 0.18;
  scooterGroup.userData.wheels = wheelsMeta;
  return scooterGroup;
}

export function findWheelsAndSteering(root) {
  const result = { frontWheel: null, rearWheel: null, fork: null, handlebar: null };
  const wheelCandidates = [];
  const forkCandidates = [];
  const handleCandidates = [];
  root.traverse((obj) => {
    const name = (obj?.name || '').toLowerCase();
    if (!name) return;
    // Wheels: accept "wheel", and be lenient with spelling/aliases
    if (name.includes('wheel') || name.includes('tyre') || name.includes('tire')) wheelCandidates.push(obj);
    // Fork/steering column synonyms
    if (name.includes('fork') || name.includes('steer') || name.includes('stem') || name.includes('tiller') || name.includes('column')) forkCandidates.push(obj);
    // Handle/handlebar synonyms
    if (name.includes('handle') || name.includes('bar') || name.includes('handlebar') || name.includes('grip')) handleCandidates.push(obj);
  });

  if (wheelCandidates.length >= 2) {
    wheelCandidates.sort((a, b) => (a.position?.z ?? 0) - (b.position?.z ?? 0));
    result.rearWheel = wheelCandidates[0];
    result.frontWheel = wheelCandidates[wheelCandidates.length - 1];
  } else if (wheelCandidates.length === 1) {
    result.frontWheel = wheelCandidates[0];
  }

  // Prefer explicit matches if present
  result.fork = forkCandidates[0] || null;
  result.handlebar = handleCandidates[0] || null;

  // Graceful fallbacks: if steering parts are missing, steer using the front wheel (or its parent) as a pivot
  if (!result.fork && result.frontWheel) {
    result.fork = result.frontWheel.parent || result.frontWheel;
  }
  if (!result.handlebar && result.fork) {
    result.handlebar = result.fork;
  }

  return result;
}

export function computeWheelRadius(object3d) {
  if (!object3d) return null;
  const bounds = new Box3().setFromObject(object3d);
  const size = bounds.getSize(new Vector3());
  const diameter = Math.max(size.x, size.y);
  return diameter > 0 ? diameter / 2 : null;
}

export function findSeatAnchor(root) {
  let seatNode = null;
  root.traverse((obj) => {
    const name = (obj?.name || '').toLowerCase();
    if (!name) return;
    if (!seatNode && (name.includes('seat') || name.includes('saddle'))) {
      seatNode = obj;
    }
  });
  if (seatNode) {
    const b = new Box3().setFromObject(seatNode);
    const c = b.getCenter(new Vector3());
    c.y = b.max.y + 0.01;
    return c;
  }
  const bounds = new Box3().setFromObject(root);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  return new Vector3(center.x, bounds.min.y + size.y * 0.62, center.z - size.z * 0.18);
}
