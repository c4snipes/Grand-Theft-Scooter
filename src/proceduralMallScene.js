import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  TorusGeometry,
} from 'three';

function setShadowFlags(object, { cast = true, receive = true } = {}) {
  object.castShadow = cast;
  object.receiveShadow = receive;
}

function createRailing(length, height, material) {
  const geometry = new BoxGeometry(length, height, 0.4);
  const mesh = new Mesh(geometry, material);
  setShadowFlags(mesh, { cast: false, receive: false });
  return mesh;
}

function createColumn(radius, height, material) {
  const geometry = new CylinderGeometry(radius, radius, height, 16);
  const mesh = new Mesh(geometry, material);
  mesh.position.y = height / 2;
  setShadowFlags(mesh);
  return mesh;
}

function addStorefrontRow(group, options) {
  const {
    count,
    width,
    height,
    depth,
    spacing,
    offset = 0,
    y = 0,
    direction = 'x',
    material,
    baseName,
  } = options;

  const geometry = new BoxGeometry(width, height, depth);
  for (let i = 0; i < count; i += 1) {
    const mesh = new Mesh(geometry, material);
    mesh.name = `${baseName}-${i}`;
    setShadowFlags(mesh);
    if (direction === 'x') {
      mesh.position.set(offset + i * spacing, y + height / 2, 0);
    } else {
      mesh.position.set(0, y + height / 2, offset + i * spacing);
    }
    group.add(mesh);
  }
}

function addPlanters(group, material, radius, height, positions) {
  const geometry = new CylinderGeometry(radius, radius * 1.05, height, 12);
  positions.forEach(([x, z]) => {
    const mesh = new Mesh(geometry, material);
    mesh.name = 'mall-planter';
    mesh.position.set(x, height / 2, z);
    setShadowFlags(mesh);
    group.add(mesh);
  });
}

function addBenches(group, material, length, width, height, positions) {
  const geometry = new BoxGeometry(length, height, width);
  positions.forEach(([x, z, rotation]) => {
    const mesh = new Mesh(geometry, material);
    mesh.name = 'mall-bench';
    mesh.position.set(x, height / 2, z);
    mesh.rotation.y = rotation ?? 0;
    setShadowFlags(mesh, { cast: true, receive: true });
    group.add(mesh);
  });
}

export function buildProceduralMallScene(options = {}) {
  const {
    extent = 140,
    ceilingHeight = 14,
    walkwayHeight = 4.6,
    walkwayWidth = 18,
    atriumRadius = 24,
  } = options;

  const root = new Group();
  root.name = 'shopping-mall';

  const fullSize = extent * 2;
  const wallThickness = 3;

  const materials = {
    floorPrimary: new MeshStandardMaterial({
      color: '#eff3fa',
      metalness: 0.04,
      roughness: 0.85,
    }),
    floorAccent: new MeshStandardMaterial({
      color: '#d9e0f2',
      metalness: 0.05,
      roughness: 0.7,
    }),
    floorTrim: new MeshStandardMaterial({
      color: '#c5cedf',
      metalness: 0.08,
      roughness: 0.6,
    }),
    wall: new MeshStandardMaterial({
      color: '#f7f9fd',
      metalness: 0.05,
      roughness: 0.9,
    }),
    glass: new MeshStandardMaterial({
      color: '#c5d9f5',
      metalness: 0.6,
      roughness: 0.15,
      transparent: true,
      opacity: 0.45,
    }),
    accent: new MeshStandardMaterial({
      color: '#ff6e8a',
      metalness: 0.2,
      roughness: 0.35,
      emissive: '#220510',
      emissiveIntensity: 0.25,
    }),
    column: new MeshStandardMaterial({
      color: '#e7ecf7',
      metalness: 0.1,
      roughness: 0.55,
    }),
    fixtures: new MeshStandardMaterial({
      color: '#bfc7d6',
      metalness: 0.12,
      roughness: 0.4,
    }),
    planter: new MeshStandardMaterial({
      color: '#a9c798',
      metalness: 0.05,
      roughness: 0.6,
    }),
  };

  // Ground level (floor slab + accents)
  const groundGroup = new Group();
  groundGroup.name = 'mall-ground';

  const slabGeometry = new BoxGeometry(fullSize, 0.6, fullSize);
  const slab = new Mesh(slabGeometry, materials.floorTrim);
  slab.position.y = -0.3;
  setShadowFlags(slab);
  groundGroup.add(slab);

  const floorGeometry = new PlaneGeometry(fullSize, fullSize, 4, 4);
  floorGeometry.rotateX(-Math.PI / 2);
  const floor = new Mesh(floorGeometry, materials.floorPrimary);
  floor.name = 'mall-floor';
  setShadowFlags(floor, { cast: false, receive: true });
  groundGroup.add(floor);

  const atriumInsetGeometry = new PlaneGeometry(atriumRadius * 2.4, atriumRadius * 2.4, 1, 1);
  atriumInsetGeometry.rotateX(-Math.PI / 2);
  const atriumInset = new Mesh(atriumInsetGeometry, materials.floorAccent);
  atriumInset.position.y = 0.01;
  setShadowFlags(atriumInset, { cast: false, receive: true });
  groundGroup.add(atriumInset);

  const trimRingGeometry = new TorusGeometry(atriumRadius * 1.3, 0.5, 16, 64);
  const trimRing = new Mesh(trimRingGeometry, materials.floorTrim);
  trimRing.rotation.x = Math.PI / 2;
  trimRing.position.y = 0.02;
  setShadowFlags(trimRing);
  groundGroup.add(trimRing);

  root.add(groundGroup);

  // Perimeter walls
  const wallGroup = new Group();
  wallGroup.name = 'mall-walls';
  const wallHeight = ceilingHeight;

  const longWallGeometry = new BoxGeometry(fullSize + wallThickness * 2, wallHeight, wallThickness);
  const shortWallGeometry = new BoxGeometry(
    fullSize + wallThickness * 2,
    wallHeight,
    wallThickness
  );

  const northWall = new Mesh(longWallGeometry, materials.wall);
  northWall.position.set(0, wallHeight / 2, extent + wallThickness / 2);
  setShadowFlags(northWall);
  wallGroup.add(northWall);

  const southWall = northWall.clone();
  southWall.position.z = -(extent + wallThickness / 2);
  wallGroup.add(southWall);

  const eastWall = new Mesh(shortWallGeometry, materials.wall);
  eastWall.rotation.y = Math.PI / 2;
  eastWall.position.set(extent + wallThickness / 2, wallHeight / 2, 0);
  setShadowFlags(eastWall);
  wallGroup.add(eastWall);

  const westWall = eastWall.clone();
  westWall.position.x = -(extent + wallThickness / 2);
  wallGroup.add(westWall);

  root.add(wallGroup);

  // Anchor buildings at corners (two levels tall)
  const anchors = new Group();
  anchors.name = 'mall-anchors';

  const anchorGeometry = new BoxGeometry(46, ceilingHeight * 0.95, 32);
  const anchorMaterial = new MeshStandardMaterial({
    color: '#f0f5ff',
    metalness: 0.12,
    roughness: 0.65,
  });

  const anchorPositions = [
    [extent - 40, 0, extent - 26],
    [-(extent - 40), 0, extent - 26],
    [extent - 40, 0, -(extent - 26)],
    [-(extent - 40), 0, -(extent - 26)],
  ];

  anchorPositions.forEach(([x, _, z], index) => {
    const mesh = new Mesh(anchorGeometry, anchorMaterial);
    mesh.name = `anchor-store-${index}`;
    mesh.position.set(x, anchorGeometry.parameters.height / 2, z);
    setShadowFlags(mesh);
    anchors.add(mesh);
  });

  root.add(anchors);

  // Upper-level walkways
  const walkwayGroup = new Group();
  walkwayGroup.name = 'mall-walkways';
  const walkwayThickness = 1.4;

  const straightLength = fullSize - walkwayWidth * 2.4;
  const crosswalkLength = atriumRadius * 1.8;

  const walkwayMaterial = new MeshStandardMaterial({
    color: '#dfe5f1',
    metalness: 0.1,
    roughness: 0.45,
  });

  const horizontalWalkwayGeometry = new BoxGeometry(
    straightLength,
    walkwayThickness,
    walkwayWidth
  );
  const verticalWalkwayGeometry = new BoxGeometry(
    walkwayWidth,
    walkwayThickness,
    straightLength
  );
  const crossWalkwayGeometry = new BoxGeometry(
    crosswalkLength,
    walkwayThickness,
    walkwayWidth * 0.7
  );

  const walkwayConfigs = [
    {
      geometry: horizontalWalkwayGeometry,
      position: [0, walkwayHeight, extent - walkwayWidth - 8],
      name: 'walkway-north',
    },
    {
      geometry: horizontalWalkwayGeometry,
      position: [0, walkwayHeight, -(extent - walkwayWidth - 8)],
      name: 'walkway-south',
    },
    {
      geometry: verticalWalkwayGeometry,
      position: [extent - walkwayWidth - 8, walkwayHeight, 0],
      name: 'walkway-east',
    },
    {
      geometry: verticalWalkwayGeometry,
      position: [-(extent - walkwayWidth - 8), walkwayHeight, 0],
      name: 'walkway-west',
    },
    {
      geometry: crossWalkwayGeometry,
      position: [0, walkwayHeight, 0],
      name: 'walkway-cross-x',
    },
    {
      geometry: crossWalkwayGeometry,
      position: [0, walkwayHeight, 0],
      rotationY: Math.PI / 2,
      name: 'walkway-cross-z',
    },
  ];

  walkwayConfigs.forEach((config) => {
    const mesh = new Mesh(config.geometry, walkwayMaterial);
    mesh.name = config.name;
    mesh.position.set(...config.position);
    if (config.rotationY) {
      mesh.rotation.y = config.rotationY;
    }
    mesh.position.y = walkwayHeight;
    setShadowFlags(mesh);
    walkwayGroup.add(mesh);
  });

  // Railings for each walkway segment
  const railingMaterial = new MeshStandardMaterial({
    color: '#a8b6cd',
    metalness: 0.3,
    roughness: 0.25,
  });

  walkwayConfigs.forEach((config) => {
    const [x, _, z] = config.position;
    const length =
      config.geometry.parameters.width ?? config.geometry.parameters.depth ?? straightLength;
    const usingHorizontal = config.geometry === horizontalWalkwayGeometry;
    const isCross = config.geometry === crossWalkwayGeometry;

    const railLength = usingHorizontal ? config.geometry.parameters.width : length;
    const depth = config.geometry.parameters.depth ?? config.geometry.parameters.width;

    if (isCross) {
      // Cross walkways get rails on both sides
      const railA = createRailing(
        railLength,
        1.6,
        railingMaterial
      );
      railA.position.set(x, walkwayHeight + 1.1, z + (depth / 2 + 0.45));
      walkwayGroup.add(railA);

      const railB = railA.clone();
      railB.position.z = z - (depth / 2 + 0.45);
      walkwayGroup.add(railB);
      return;
    }

    if (usingHorizontal) {
      const railFront = createRailing(
        config.geometry.parameters.width,
        1.6,
        railingMaterial
      );
      railFront.position.set(x, walkwayHeight + 1.1, z + (depth / 2 + 0.45));
      walkwayGroup.add(railFront);

      const railBack = railFront.clone();
      railBack.position.z = z - (depth / 2 + 0.45);
      walkwayGroup.add(railBack);
    } else {
      const railLeft = createRailing(
        config.geometry.parameters.depth,
        1.6,
        railingMaterial
      );
      railLeft.rotation.y = Math.PI / 2;
      railLeft.position.set(x + (depth / 2 + 0.45), walkwayHeight + 1.1, z);
      walkwayGroup.add(railLeft);

      const railRight = railLeft.clone();
      railRight.position.x = x - (depth / 2 + 0.45);
      walkwayGroup.add(railRight);
    }
  });

  // Walkway support columns
  const columnRadius = 1.5;
  const columnHeight = walkwayHeight + 3.8;
  const columnPositions = [];
  const walkwayOffset = extent - walkwayWidth - 8;
  const spacing = (straightLength - 20) / 3;
  for (let i = -1; i <= 1; i += 1) {
    columnPositions.push([i * spacing, walkwayOffset]);
    columnPositions.push([i * spacing, -walkwayOffset]);
    columnPositions.push([walkwayOffset, i * spacing]);
    columnPositions.push([-walkwayOffset, i * spacing]);
  }

  columnPositions.forEach(([x, z], index) => {
    const column = createColumn(columnRadius, columnHeight, materials.column);
    column.name = `mall-column-${index}`;
    column.position.set(x, columnHeight / 2, z);
    walkwayGroup.add(column);
  });

  root.add(walkwayGroup);

  // Central atrium feature and skylight
  const atriumGroup = new Group();
  atriumGroup.name = 'mall-atrium';

  const atriumCylinderGeometry = new CylinderGeometry(
    atriumRadius * 0.6,
    atriumRadius * 0.6,
    walkwayHeight,
    32,
    1,
    true
  );
  const atriumWalls = new Mesh(atriumCylinderGeometry, materials.glass);
  atriumWalls.name = 'atrium-glass';
  atriumWalls.position.y = walkwayHeight / 2;
  setShadowFlags(atriumWalls, { cast: false, receive: false });
  atriumGroup.add(atriumWalls);

  const skylightGeometry = new PlaneGeometry(atriumRadius * 1.8, atriumRadius * 1.8, 1, 1);
  skylightGeometry.rotateX(-Math.PI / 2);
  const skylight = new Mesh(skylightGeometry, materials.glass);
  skylight.name = 'atrium-skylight';
  skylight.position.y = ceilingHeight - 0.4;
  setShadowFlags(skylight, { cast: false, receive: false });
  atriumGroup.add(skylight);

  const skylightTrim = new Mesh(new TorusGeometry(atriumRadius * 0.95, 0.45, 12, 48), materials.accent);
  skylightTrim.rotation.x = Math.PI / 2;
  skylightTrim.position.y = skylight.position.y - 0.2;
  setShadowFlags(skylightTrim);
  atriumGroup.add(skylightTrim);

  root.add(atriumGroup);

  // Retail pods on ground floor
  const retailPods = new Group();
  retailPods.name = 'mall-retail-pods';
  const podGeometry = new BoxGeometry(16, 4.2, 12);
  const podMaterial = new MeshStandardMaterial({
    color: '#f8f1ff',
    metalness: 0.18,
    roughness: 0.5,
  });
  const podPositions = [
    [0, 0, atriumRadius + 14],
    [0, 0, -(atriumRadius + 14)],
    [atriumRadius + 16, 0, 0],
    [-(atriumRadius + 16), 0, 0],
  ];
  podPositions.forEach(([x, _, z], index) => {
    const pod = new Mesh(podGeometry, podMaterial);
    pod.name = `retail-pod-${index}`;
    pod.position.set(x, podGeometry.parameters.height / 2, z);
    setShadowFlags(pod);
    retailPods.add(pod);
  });
  root.add(retailPods);

  // Decorative fixtures and seating
  const fixtureGroup = new Group();
  fixtureGroup.name = 'mall-fixtures';

  addPlanters(
    fixtureGroup,
    materials.planter,
    3,
    2,
    [
      [atriumRadius + 8, atriumRadius + 8],
      [-(atriumRadius + 8), atriumRadius + 8],
      [atriumRadius + 8, -(atriumRadius + 8)],
      [-(atriumRadius + 8), -(atriumRadius + 8)],
      [0, atriumRadius + 26],
      [0, -(atriumRadius + 26)],
    ]
  );

  addBenches(
    fixtureGroup,
    materials.fixtures,
    10,
    2.2,
    1.2,
    [
      [atriumRadius + 22, 0, Math.PI / 2],
      [-(atriumRadius + 22), 0, Math.PI / 2],
      [0, atriumRadius + 30, 0],
      [0, -(atriumRadius + 30), 0],
    ]
  );

  root.add(fixtureGroup);

  // Storefront rows along the long edges
  const storefrontGroup = new Group();
  storefrontGroup.name = 'mall-storefronts';
  addStorefrontRow(storefrontGroup, {
    count: 6,
    width: 20,
    height: 6,
    depth: 10,
    spacing: 34,
    offset: -85,
    y: 0,
    direction: 'x',
    material: materials.wall,
    baseName: 'store-row-north',
  });
  storefrontGroup.position.z = extent - 16;

  const southRow = storefrontGroup.clone();
  southRow.name = 'mall-storefronts-south';
  southRow.position.z = -(extent - 16);

  const eastRow = storefrontGroup.clone();
  eastRow.name = 'mall-storefronts-east';
  eastRow.rotation.y = Math.PI / 2;
  eastRow.position.set(extent - 16, 0, 0);

  const westRow = eastRow.clone();
  westRow.name = 'mall-storefronts-west';
  westRow.position.x = -(extent - 16);

  root.add(storefrontGroup);
  root.add(southRow);
  root.add(eastRow);
  root.add(westRow);

  return root;
}

export default buildProceduralMallScene;
