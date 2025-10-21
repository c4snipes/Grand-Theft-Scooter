import {
  Body,
  ContactMaterial,
  Material,
  Plane as CannonPlane,
  SAPBroadphase,
  Vec3,
  World,
} from "cannon-es";

// --> Core Physics: constructs the physics world and exposes a fixed-step integrator.

/**
 * Creates and configures a Cannon.js physics world with optimized settings
 * @returns {Object} Object containing the physics world and material definitions
 * @returns {World} returns.world - The configured Cannon.js physics world
 * @returns {Object} returns.materials - Material definitions for different object types
 */
export function createPhysicsWorld() {
  const world = new World({ gravity: new Vec3(0, -9.82, 0) });
  world.allowSleep = true; // Let inactive bodies sleep to save CPU
  world.broadphase = new SAPBroadphase(world);

  // Optimized solver settings for performance/stability balance
  if (world.solver) {
    world.solver.iterations = Math.min(
      10,
      Math.max(5, (world.solver.iterations ?? 10) - 3)
    );
    world.solver.tolerance = 0.001;
  }

  const materials = {
    ground: new Material("ground"),
    dynamic: new Material("dynamic"),
    player: new Material("player"),
  };

  // Enhanced default contact material settings
  world.defaultContactMaterial.friction = 0.45;
  world.defaultContactMaterial.restitution = 0.05;
  world.defaultContactMaterial.contactEquationStiffness = 1.5e7;
  world.defaultContactMaterial.contactEquationRelaxation = 2;

  const groundBody = new Body({
    mass: 0,
    shape: new CannonPlane(),
    material: materials.ground,
  });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  // Tuning contact pairs for predictable ricochet-less sliding
  world.addContactMaterial(
    new ContactMaterial(materials.player, materials.ground, {
      friction: 0.65,
      restitution: 0.05,
      contactEquationStiffness: 10000000,
      contactEquationRelaxation: 2,
    })
  );

  world.addContactMaterial(
    new ContactMaterial(materials.dynamic, materials.ground, {
      friction: 0.8,
      restitution: 0.15,
      contactEquationStiffness: 5000000,
      contactEquationRelaxation: 3,
    })
  );

  // Player-dynamic object interactions
  world.addContactMaterial(new ContactMaterial(materials.player, materials.dynamic, {
    friction: 0.3,
    restitution: 0.2,
    contactEquationStiffness: 5000000,
    contactEquationRelaxation: 4,
  }));

  return { world, materials };
}

/**
 * Steps the physics simulation forward with optimized settings
 * @param {World} world - The Cannon.js physics world to step
 * @param {number} delta - Time elapsed since last frame in seconds
 */
export function stepPhysics(world, delta) {
  // Optimized fixed step with reduced substeps for better performance
  world.step(1 / 60, delta, 3); // Reduced from 4 to 3 substeps
}
