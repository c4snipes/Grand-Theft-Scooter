// --> Collision Type Constants: Optimized collision detection using type flags
export const CollisionType = {
  HUMAN: "human",
  METAL: "metal",
  DEFAULT: "default",
  WOOD: "wood",
  PLASTIC: "plastic",
};

// Mapping of target labels to collision types for performance
export const TARGET_COLLISION_TYPES = {
  // Human targets
  "Mall Patron": CollisionType.HUMAN,
  "Security Guard": CollisionType.HUMAN,
  "Store Employee": CollisionType.HUMAN,
  Janitor: CollisionType.HUMAN,
  "Mall Manager": CollisionType.HUMAN,
  "Mall Santa": CollisionType.HUMAN,
  "Mime Artist": CollisionType.HUMAN,
  "Street Performer": CollisionType.HUMAN,

  // Metal targets
  "Mall Kiosk": CollisionType.METAL,
  "Vending Machine": CollisionType.METAL,
  ATM: CollisionType.METAL,
  "Shopping Cart": CollisionType.METAL,
  "Trash Can": CollisionType.METAL,

  // Wood/Plastic targets
  Bench: CollisionType.WOOD,
  "Poster Stand": CollisionType.WOOD,
  "Box Stack": CollisionType.DEFAULT,
  Planter: CollisionType.DEFAULT,
  "Flower Pot": CollisionType.DEFAULT,

  // Default fallback
  default: CollisionType.DEFAULT,
};

// Get collision type for a target label
export function getCollisionType(targetLabel) {
  return TARGET_COLLISION_TYPES[targetLabel] || CollisionType.DEFAULT;
}

// Physics damping values standardized by material type
export const PHYSICS_DAMPING = {
  [CollisionType.HUMAN]: {
    angular: 0.8,
    linear: 0.6,
  },
  [CollisionType.METAL]: {
    angular: 0.9,
    linear: 0.75,
  },
  [CollisionType.WOOD]: {
    angular: 0.7,
    linear: 0.5,
  },
  [CollisionType.DEFAULT]: {
    angular: 0.6,
    linear: 0.4,
  },
};

// Get standardized damping values for a collision type
export function getDampingValues(collisionType) {
  return (
    PHYSICS_DAMPING[collisionType] || PHYSICS_DAMPING[CollisionType.DEFAULT]
  );
}
