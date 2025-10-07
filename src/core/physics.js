import {
  Body,
  ContactMaterial,
  Material,
  Plane as CannonPlane,
  SAPBroadphase,
  Vec3,
  World,
} from 'cannon-es';

// --> Core Physics: constructs the physics world and exposes a fixed-step integrator.
export function createPhysicsWorld() {
  const world = new World({ gravity: new Vec3(0, -9.82, 0) });
  world.allowSleep = false;
  world.broadphase = new SAPBroadphase(world);

  const materials = {
    ground: new Material('ground'),
    dynamic: new Material('dynamic'),
    player: new Material('player'),
  };

  world.defaultContactMaterial.friction = 0.45;
  world.defaultContactMaterial.restitution = 0.05;
  world.defaultContactMaterial.contactEquationStiffness = 1.2e7;
  world.defaultContactMaterial.contactEquationRelaxation = 2;

  const groundBody = new Body({ mass: 0, shape: new CannonPlane(), material: materials.ground });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  world.addContactMaterial(new ContactMaterial(materials.player, materials.ground, {
    friction: 0.65,
    restitution: 0.05,
    contactEquationStiffness: 1e7,
    contactEquationRelaxation: 2,
  }));

  world.addContactMaterial(new ContactMaterial(materials.dynamic, materials.ground, {
    friction: 0.8,
    restitution: 0.15,
    contactEquationStiffness: 5e6,
    contactEquationRelaxation: 3,
  }));

  return { world, materials };
}

export function stepPhysics(world, delta) {
  world.step(1 / 60, delta, 3);
}
