import { AnimationMixer, Box3, Group, LoopRepeat, Vector3 } from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Body, Box as CannonBox, Vec3 } from 'cannon-es';
import { invariant, warnOnce } from '../core/assert';
import {
  buildFallbackScooterMesh,
  findWheelsAndSteering,
  computeWheelRadius,
  findSeatAnchor,
} from './scooter/visuals';

const SCOOTER_DIMENSIONS = {
  width: 0.5,
  height: 0.9,
  length: 1.05,
};
const TARGET_SCOOTER_SIZE = new Vector3(SCOOTER_DIMENSIONS.width, SCOOTER_DIMENSIONS.height, SCOOTER_DIMENSIONS.length);
const TARGET_RIDER_HEIGHT = 0.82;

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
  // Keep model centered at the physics body's origin so visuals match physics.
  // (We no longer raise the model; the physics body spawn height handles ground clearance.)
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

    // Temporarily add rider to group to compute world-aligned placement using hip bone
    group.add(rider);
    rider.updateMatrixWorld(true);

    const { bones } = validateAndCollectBones(rider);
    const hip = bones.hip;

    // Compute desired seat anchor in group space and move rider so hip aligns with it
    const seatAnchor = findSeatAnchor(scooterRoot);
    const seatWorld = seatAnchor.clone();
    group.localToWorld(seatWorld);

    const hipWorld = new Vector3();
    if (hip && typeof hip.getWorldPosition === 'function') {
      hip.getWorldPosition(hipWorld);
    } else {
      // Fallback to using rider bottom as approximate hip position
      const rb = new Box3().setFromObject(rider);
      const rc = rb.getCenter(new Vector3());
      hipWorld.copy(rc);
      hipWorld.y = rb.min.y + (rb.getSize(new Vector3()).y * 0.55);
    }

    const delta = seatWorld.sub(hipWorld);
    rider.position.add(delta);
    rider.updateMatrixWorld(true);

    // Ensure rider sits down onto the seat surface with tiny downward bias if needed
    try {
      const seatNode = scooterRoot.getObjectByName('seat') || scooterRoot.getObjectByName('Seat');
      const riderBounds = new Box3().setFromObject(rider);
      const riderBottom = riderBounds.min.y;
      if (seatNode) {
        const seatBounds = new Box3().setFromObject(seatNode);
        const seatTop = seatBounds.max.y;
        const gap = seatTop - riderBottom;
        if (!Number.isNaN(gap)) {
          const nudge = gap - 0.005; // place just on top
          rider.position.y += nudge;
          rider.updateMatrixWorld(true);
        }
      } else {
        // Fallback: use computed seat anchor height even if no explicit seat node exists
        const anchorTop = seatWorld.y;
        const gap = anchorTop - riderBottom;
        if (!Number.isNaN(gap)) {
          const nudge = gap - 0.005;
          rider.position.y += nudge;
          rider.updateMatrixWorld(true);
        }
      }
    } catch (_) { /* best effort placement */ }

    poseRiderForScooter(rider);
    rider.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

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

  // Enhanced physics body with better stability
  const body = new Body({
    mass: 35, // Increased mass for better stability
    shape: new CannonBox(new Vec3(
      SCOOTER_DIMENSIONS.width / 2,
      SCOOTER_DIMENSIONS.height / 2,
      SCOOTER_DIMENSIONS.length / 2,
    )),
    position: new Vec3(0, SCOOTER_DIMENSIONS.height / 2 + 0.1, 0), // Slightly higher spawn
    angularDamping: 0.7, // Increased angular damping for better control
    linearDamping: 0.15, // Reduced linear damping for more responsive movement
  });

  // Enhanced inertia for more realistic physics
  body.updateMassProperties();

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
