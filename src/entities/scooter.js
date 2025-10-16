import {
  AnimationMixer,
  Box3,
  BoxGeometry,
  CylinderGeometry,
  Group,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Body, Box as CannonBox, Vec3 } from 'cannon-es';
import { invariant, warnOnce } from '../core/assert';

// --> Entity: player scooter with grandma rider and visual assets.
const SCOOTER_DIMENSIONS = {
  width: 0.36,
  height: 0.58,
  length: 0.64,
};
const TARGET_SCOOTER_SIZE = new Vector3(
  SCOOTER_DIMENSIONS.width,
  SCOOTER_DIMENSIONS.height,
  SCOOTER_DIMENSIONS.length,
);
const TARGET_RIDER_HEIGHT = 0.82;
const RIDER_SEAT_OFFSET = new Vector3(0, 0.26, -0.035);

function buildFallbackScooterMesh() {
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
    legGroup.rotation.y = side * Math.PI / 28;
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


  // Attach wheel/steering metadata for animation
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

function getBoneDescriptors() {
  return [
    { key: 'hip', name: 'CC_Base_Hip_02', critical: true },
    { key: 'spine', name: 'CC_Base_Spine01_034', critical: true },
    { key: 'head', name: 'CC_Base_Head_038', critical: true },
    { key: 'leftThigh', name: 'CC_Base_L_Thigh_04' },
    { key: 'leftCalf', name: 'CC_Base_L_Calf_05' },
    { key: 'leftFoot', name: 'CC_Base_L_Foot_06' },
    { key: 'rightThigh', name: 'CC_Base_R_Thigh_018' },
    { key: 'rightCalf', name: 'CC_Base_R_Calf_019' },
    { key: 'rightFoot', name: 'CC_Base_R_Foot_021' },
    { key: 'leftUpperArm', name: 'CC_Base_L_Upperarm_050' },
    { key: 'leftForearm', name: 'CC_Base_L_Forearm_051' },
    { key: 'leftHand', name: 'CC_Base_L_Hand_055' },
    { key: 'rightUpperArm', name: 'CC_Base_R_Upperarm_078' },
    { key: 'rightForearm', name: 'CC_Base_R_Forearm_079' },
    { key: 'rightHand', name: 'CC_Base_R_Hand_083' },
  ];
}

function validateAndCollectBones(rider) {
  const boneDescriptors = getBoneDescriptors();
  const bones = {};
  const descriptorNameByKey = {};
  const missingCritical = [];

  boneDescriptors.forEach((descriptor) => {
    descriptorNameByKey[descriptor.key] = descriptor.name;
    const node = rider.getObjectByName(descriptor.name);
    bones[descriptor.key] = node;
    if (!node && descriptor.critical) {
      missingCritical.push(descriptor.name);
    }
  });

  return { bones, descriptorNameByKey, missingCritical };
}

function applyBasePose(bones) {
  const { hip, spine, head } = bones;
  hip.rotation.x = 0.45;
  hip.position.y -= 0.05;
  spine.rotation.x = -0.35;
  head.rotation.x = 0.12;
}

function applyLimbPoses(bones, descriptorNameByKey) {
  const missingNames = (keys) => keys
    .filter((key) => !bones[key])
    .map((key) => descriptorNameByKey[key]);

  function setPoseOrWarn(keys, poseFn, warnKey, warnMsg) {
    const missing = missingNames(keys);
    if (missing.length === 0) {
      poseFn();
    } else {
      warnOnce(warnKey, warnMsg, { bones: missing });
    }
  }

  const {
    leftThigh, leftCalf, leftFoot,
    rightThigh, rightCalf, rightFoot,
    leftUpperArm, leftForearm, leftHand,
    rightUpperArm, rightForearm, rightHand,
  } = bones;

  setPoseOrWarn(
    ['leftThigh', 'leftCalf', 'leftFoot'],
    () => {
      leftThigh.rotation.x = 1.65;
      leftCalf.rotation.x = -1.85;
      leftFoot.rotation.x = 0.55;
    },
    'poseRiderForScooter:leftLeg',
    '[poseRiderForScooter] Missing bones for left leg pose.');

  setPoseOrWarn(
    ['rightThigh', 'rightCalf', 'rightFoot'],
    () => {
      rightThigh.rotation.x = 1.65;
      rightCalf.rotation.x = -1.85;
      rightFoot.rotation.x = 0.55;
    },
    'poseRiderForScooter:rightLeg',
    '[poseRiderForScooter] Missing bones for right leg pose.');

  setPoseOrWarn(
    ['leftUpperArm', 'leftForearm', 'leftHand'],
    () => {
      leftUpperArm.rotation.set(-1.35, 0.25, 0.55);
      leftForearm.rotation.x = -0.85;
      leftHand.rotation.x = -0.25;
    },
    'poseRiderForScooter:leftArm',
    '[poseRiderForScooter] Missing bones for left arm pose.');

  setPoseOrWarn(
    ['rightUpperArm', 'rightForearm', 'rightHand'],
    () => {
      rightUpperArm.rotation.set(-1.35, -0.25, -0.55);
      rightForearm.rotation.x = -0.85;
      rightHand.rotation.x = -0.25;
    },
    'poseRiderForScooter:rightArm',
    '[poseRiderForScooter] Missing bones for right arm pose.');
}

function poseRiderForScooter(rider) {
  invariant(rider && typeof rider.getObjectByName === 'function', 'poseRiderForScooter requires a rider with getObjectByName().');

  const { bones, descriptorNameByKey, missingCritical } = validateAndCollectBones(rider);

  if (missingCritical.length > 0) {
    warnOnce(
      'poseRiderForScooter:criticalBones',
      '[poseRiderForScooter] Missing critical rider bones; skipping pose adjustments.',
      { bones: missingCritical },
    );
  } else {
    applyBasePose(bones);
    applyLimbPoses(bones, descriptorNameByKey);
  }
}

// Helpers to detect wheels/steering parts and compute approximate radii
function findWheelsAndSteering(root) {
  const result = { frontWheel: null, rearWheel: null, fork: null, handlebar: null };
  const wheelCandidates = [];
  root.traverse((obj) => {
    const name = (obj?.name || '').toLowerCase();
    if (!name) return;
    if (name.includes('wheel')) {
      wheelCandidates.push(obj);
    }
    if (!result.fork && (name.includes('fork') || name.includes('steer'))) {
      result.fork = obj;
    }
    if (!result.handlebar && name.includes('handle')) {
      result.handlebar = obj;
    }
  });
  if (wheelCandidates.length >= 2) {
    wheelCandidates.sort((a, b) => (a.position?.z ?? 0) - (b.position?.z ?? 0));
    result.rearWheel = wheelCandidates[0];
    result.frontWheel = wheelCandidates[wheelCandidates.length - 1];
  } else if (wheelCandidates.length === 1) {
    result.frontWheel = wheelCandidates[0];
  }
  return result;
}

function computeWheelRadius(object3d) {
  if (!object3d) return null;
  const bounds = new Box3().setFromObject(object3d);
  const size = bounds.getSize(new Vector3());
  const diameter = Math.max(size.x, size.y);
  return diameter > 0 ? diameter / 2 : null;
}


function buildScooterMeshFromAssets(assets = {}) {
  invariant(assets && typeof assets === 'object', 'buildScooterMeshFromAssets expects an assets object.');
  if (!assets.scooterScene) {
    return { group: buildFallbackScooterMesh(), mixers: [] };
  }

  const group = new Group();


  group.name = 'scooter';
  const mixers = [];

  invariant(
    assets.scooterScene && typeof assets.scooterScene.traverse === 'function',
    'Expected assets.scooterScene to be a THREE.Object3D.',
  );
  const scooterRoot = cloneSkeleton(assets.scooterScene);
  scooterRoot.rotation.y = Math.PI;
  scooterRoot.position.set(0, 0, 0);
  scooterRoot.updateMatrixWorld(true);

  const scooterBounds = new Box3().setFromObject(scooterRoot);
  const scooterSize = scooterBounds.getSize(new Vector3());
  const scale = scooterSize.z > 0 ? TARGET_SCOOTER_SIZE.z / scooterSize.z : 1;
  scooterRoot.scale.setScalar(scale);
  scooterRoot.updateMatrixWorld(true);

  const scaledBounds = new Box3().setFromObject(scooterRoot);
  const scaledCenter = scaledBounds.getCenter(new Vector3());
  scooterRoot.position.sub(scaledCenter);
  scooterRoot.position.y -= scaledBounds.min.y;
  scooterRoot.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  group.add(scooterRoot);

    // Collect wheel/steering parts from the imported scooter and compute radii (after scaling)
    const wheelsMetaFromAsset = findWheelsAndSteering(scooterRoot);
    wheelsMetaFromAsset.frontRadius = computeWheelRadius(wheelsMetaFromAsset.frontWheel) ?? wheelsMetaFromAsset.frontRadius ?? null;
    wheelsMetaFromAsset.rearRadius = computeWheelRadius(wheelsMetaFromAsset.rearWheel) ?? wheelsMetaFromAsset.rearRadius ?? null;
    group.userData.wheels = wheelsMetaFromAsset;


  const scooterClips = Array.isArray(assets.scooterAnimations) ? assets.scooterAnimations : [];
  if (scooterClips.length > 0) {
    const scooterMixer = new AnimationMixer(scooterRoot);
    const clip = scooterClips[0];
    const action = scooterMixer.clipAction(clip);
    action.reset();
    action.setLoop(LoopRepeat, Infinity);
    action.play();
    mixers.push(scooterMixer);
  }

  if (assets.riderScene) {
    invariant(
      typeof assets.riderScene.traverse === 'function',
      'Expected assets.riderScene to be a THREE.Object3D.',
    );
    const rider = cloneSkeleton(assets.riderScene);
    rider.rotation.y = Math.PI;
    rider.position.set(0, 0, 0);
    rider.updateMatrixWorld(true);

    const riderBounds = new Box3().setFromObject(rider);
    const riderSize = riderBounds.getSize(new Vector3());
    const riderScale = riderSize.y > 0 ? TARGET_RIDER_HEIGHT / riderSize.y : 1;
    rider.scale.setScalar(riderScale);
    rider.updateMatrixWorld(true);

    const scaledRiderBounds = new Box3().setFromObject(rider);
    const riderCenter = scaledRiderBounds.getCenter(new Vector3());
    rider.position.sub(riderCenter);
    rider.position.y -= scaledRiderBounds.min.y;
    rider.position.add(RIDER_SEAT_OFFSET);

    poseRiderForScooter(rider);
    rider.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    group.add(rider);

  }

  return { group, mixers };
}

export function createScooter(world, material, assets = {}) {
  invariant(world && typeof world.addBody === 'function', 'createScooter requires a physics world with addBody().');
  invariant(
    material === undefined || material === null || typeof material === 'object',
    'createScooter expects material to be an object when provided.',
  );
  invariant(assets && typeof assets === 'object', 'createScooter expects an assets object.');

  const body = new Body({
    mass: 25,
    shape: new CannonBox(new Vec3(
      SCOOTER_DIMENSIONS.width / 2,
      SCOOTER_DIMENSIONS.height / 2,
      SCOOTER_DIMENSIONS.length / 2,
    )),
    position: new Vec3(0, SCOOTER_DIMENSIONS.height / 2 + 0.05, 0),
    angularDamping: 0.5,
    linearDamping: 0.3,
  });
  if (material) {
    body.material = material;
  }
  world.addBody(body);

  const { group, mixers } = buildScooterMeshFromAssets(assets);
  const mesh = group;

  let controlsState = { drive: 0, steer: 0 };
  let wheelSpin = 0;
  function updateVisualWheels(delta) {
    const wheels = mesh.userData && mesh.userData.wheels ? mesh.userData.wheels : null;
    if (!wheels) return;
    const speed = body.velocity.length();
    if (delta > 0) {
      const radius = wheels.frontRadius || wheels.rearRadius || 0.2;
      if (radius > 0) {
        const distance = speed * delta;
        const dir = (controlsState.drive || 0) < 0 ? -1 : 1;
        const spinDelta = (distance / radius) * dir;
        wheelSpin = (wheelSpin + spinDelta) % (Math.PI * 2);
        if (wheels.frontWheel) wheels.frontWheel.rotation.x -= spinDelta;
        if (wheels.rearWheel) wheels.rearWheel.rotation.x -= spinDelta;
      }
    }
    const steerAngle = (controlsState.steer || 0) * 0.35;
    if (wheels.fork) wheels.fork.rotation.y = steerAngle;
    if (wheels.handlebar) wheels.handlebar.rotation.y = steerAngle;
    if (wheels.frontWheel) wheels.frontWheel.rotation.y = steerAngle;
  }


  return {
    mesh,
    body,
    setControlsState(next) {
      if (next && typeof next === 'object') {
        controlsState = { ...controlsState, ...next };
      }
    },
    sync(delta = 0) {
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
      if (delta > 0 && Array.isArray(mixers)) {
        for (const mixer of mixers) {
          mixer.update(delta);
        }
      }
      updateVisualWheels(delta);
    },
  };
}
