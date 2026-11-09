import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const HALL = { maxX: 22, maxZ: 15, minX: -22, minZ: -15 };
export const SAUNA = { door: [15.4, 16.8], maxX: 22, maxZ: -3.5, minX: 14, minZ: -15 };
export const PULLUP_BAR_HEIGHT = 2.42;
export const TREADMILL_HEIGHT = 0.14;
const CEILING = 3.8;

const SIZES = {
  barbell: { length: 2.1 },
  'bench-press': { length: 1.3 },
  dumbbell: { length: 0.36 },
  'dumbbell-rack': { height: 0.95 },
  monstera: { height: 1.6 },
  'pullup-bar': { height: 2.45 },
  'sauna-heater': { height: 0.8 },
  'spin-bike': { length: 1.25 },
  'squat-rack': { height: 2.4 },
  treadmill: { length: 1.9 },
  'water-station': { height: 0.9 },
};

async function loadModels() {
  const names = await (await fetch('/models/manifest.json')).json().catch(() => []);
  const loader = new GLTFLoader();
  const entries = await Promise.all(names.filter((name) => SIZES[name]).map(async (name) => [name, (await loader.loadAsync(`/models/${name}.glb`)).scene]));
  return Object.fromEntries(entries);
}

/** Scales a model to its catalogue size, long side along x, standing on the floor and centred on its origin. */
export function normalise(scene, name) {
  const holder = new THREE.Group();
  const model = scene.clone(true);
  model.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  let bounds = new THREE.Box3().setFromObject(model);
  let size = bounds.getSize(new THREE.Vector3());
  if (size.z > size.x) {
    model.rotation.y = Math.PI / 2;
    model.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(model);
    size = bounds.getSize(new THREE.Vector3());
  }
  const target = SIZES[name];
  const scale = target.height ? target.height / size.y : target.length / size.x;
  model.scale.multiplyScalar(scale);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  holder.add(model);
  return holder;
}

function placeholder(name) {
  const target = SIZES[name] || { height: 1 };
  const height = target.height || 0.6;
  const length = target.length || height * 0.6;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, Math.min(length, 0.7)), new THREE.MeshLambertMaterial({ color: 0x3a3d40 }));
  mesh.position.y = height / 2;
  mesh.castShadow = true;
  const holder = new THREE.Group();
  holder.add(mesh);
  return holder;
}

function box(width, height, depth, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function wordmark(text, width, height, color = '#f2f2f0') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round(1024 * height / width);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.font = `600 ${canvas.height * 0.62}px "Helvetica Neue", Arial, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.letterSpacing = `${canvas.height * 0.12}px`;
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
}

/** A night sky dome: stars thickening towards the zenith and soft green aurora curtains above the horizon. */
function nightSky() {
  const width = 4096, height = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, height / 2);
  gradient.addColorStop(0, '#02040b');
  gradient.addColorStop(0.7, '#08142a');
  gradient.addColorStop(1, '#13284a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#0a1426';
  context.fillRect(0, height / 2, width, height / 2);

  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 5200; i++) {
    const y = Math.pow(random(), 1.6) * height * 0.5;
    const radius = random() < 0.04 ? 1.8 + random() * 1.4 : 0.5 + random() * 1.1;
    context.globalAlpha = 0.35 + random() * 0.65;
    context.fillStyle = random() < 0.15 ? '#cfe0ff' : random() < 0.1 ? '#ffe8c8' : '#ffffff';
    context.beginPath();
    context.arc(random() * width, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.globalCompositeOperation = 'lighter';
  for (const band of [{ amplitude: 40, base: 0.47, hue: 145, phase: 0, span: [0, 0.45] }, { amplitude: 30, base: 0.46, hue: 160, phase: 2, span: [0.35, 0.8] }, { amplitude: 35, base: 0.45, hue: 150, phase: 4, span: [0.7, 1] }, { amplitude: 25, base: 0.42, hue: 285, phase: 1, span: [0.2, 0.6] }]) {
    for (let x = band.span[0] * width; x < band.span[1] * width; x += 3) {
      const t = (x / width - band.span[0]) / (band.span[1] - band.span[0]);
      const strength = Math.sin(Math.PI * t) * (0.6 + 0.4 * Math.sin(x * 0.013 + band.phase));
      const bottom = band.base * height + Math.sin(x * 0.004 + band.phase) * band.amplitude;
      const top = bottom - (160 + 260 * strength);
      const curtain = context.createLinearGradient(0, bottom, 0, top);
      curtain.addColorStop(0, `hsla(${band.hue}, 95%, 62%, ${0.3 * strength})`);
      curtain.addColorStop(0.35, `hsla(${band.hue + 10}, 85%, 55%, ${0.16 * strength})`);
      curtain.addColorStop(1, `hsla(${band.hue + 120}, 70%, 50%, 0)`);
      context.fillStyle = curtain;
      context.globalAlpha = 1;
      context.fillRect(x, top, 3, bottom - top);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), new THREE.MeshBasicMaterial({ fog: false, map: texture, side: THREE.BackSide }));
  dome.rotation.y = -Math.PI / 2;
  return dome;
}

export async function buildWorld(scene) {
  const models = await loadModels();
  const make = (name) => (models[name] ? normalise(models[name], name) : placeholder(name));
  const interactables = [];
  const obstacles = [];
  const block = (x, z, halfX, halfZ) => obstacles.push({ maxX: x + halfX, maxZ: z + halfZ, minX: x - halfX, minZ: z - halfZ });
  const place = (name, x, z, rotation = 0) => {
    const object = make(name);
    object.position.set(x, 0, z);
    object.rotation.y = rotation;
    scene.add(object);
    return object;
  };
  const width = HALL.maxX - HALL.minX, depth = HALL.maxZ - HALL.minZ;

  scene.background = new THREE.Color(0x02040b);
  const sky = nightSky();
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8783, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-12, 24, -18);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { bottom: -20, left: -28, right: 28, top: 20 });
  scene.add(key);

  const rubber = new THREE.MeshLambertMaterial({ color: 0x4a4d50 });
  const wallGrey = new THREE.MeshLambertMaterial({ color: 0x6b6f72 });
  const wallLight = new THREE.MeshLambertMaterial({ color: 0xd9d9d6 });
  const black = new THREE.MeshLambertMaterial({ color: 0x1e2022 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fb8d0, opacity: 0.12, transparent: true });
  const ceilingWhite = new THREE.MeshLambertMaterial({ color: 0xf3f3f1 });
  const led = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const cedar = new THREE.MeshLambertMaterial({ color: 0xc58a55 });
  const tile = new THREE.MeshLambertMaterial({ color: 0xcfc5b6 });
  const platformWood = new THREE.MeshLambertMaterial({ color: 0xc9b089 });
  const strip = new THREE.MeshBasicMaterial({ color: 0xffc777 });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), rubber);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  scene.add(box(width + 0.4, CEILING, 0.2, wallLight, 0, CEILING / 2, HALL.maxZ + 0.1));
  scene.add(box(0.2, CEILING, depth + 0.4, wallGrey, HALL.minX - 0.1, CEILING / 2, 0));
  scene.add(box(0.2, CEILING, depth + 0.4, wallLight, HALL.maxX + 0.1, CEILING / 2, 0));
  scene.add(box(width + 0.4, 0.7, 0.3, wallGrey, 0, 0.35, HALL.minZ - 0.1));
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(width, CEILING - 0.9), glass);
  pane.position.set(0, 0.7 + (CEILING - 0.9) / 2, HALL.minZ - 0.1);
  scene.add(pane);
  for (let x = HALL.minX; x <= HALL.maxX; x += 2.4) scene.add(box(0.14, CEILING, 0.2, black, x, CEILING / 2, HALL.minZ - 0.1));
  scene.add(box(width + 0.4, 0.2, 0.3, black, 0, CEILING - 0.1, HALL.minZ - 0.1));

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), ceilingWhite);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = CEILING;
  scene.add(ceiling);
  for (let z = HALL.minZ + 3; z <= HALL.maxZ - 3; z += 4.5) {
    for (let x = HALL.minX + 4; x <= SAUNA.minX - 2; x += 5.5) {
      const light = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.08), led);
      light.rotation.x = Math.PI / 2;
      light.position.set(x, CEILING - 0.01, z);
      scene.add(light);
    }
  }

  const logo = wordmark('GYM', 4.5, 1.3);
  logo.position.set(HALL.minX + 0.02, 2.6, 12.8);
  logo.rotation.y = Math.PI / 2;
  scene.add(logo);

  // Each station is placed in its model's own frame: x along the machine's long side, then rotated into the hall.
  const station = (name, x, z, rotation, { approach, block: half, facing, kind, label, spot }) => {
    const object = place(name, x, z, rotation);
    const toWorld = ([localX, localZ]) => new THREE.Vector3(localX, 0, localZ).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation).add(new THREE.Vector3(x, 0, z));
    const corners = [[-half[0], -half[1]], [half[0], half[1]]].map(toWorld);
    obstacles.push({ maxX: Math.max(corners[0].x, corners[1].x), maxZ: Math.max(corners[0].z, corners[1].z), minX: Math.min(corners[0].x, corners[1].x), minZ: Math.min(corners[0].z, corners[1].z) });
    const spotWorld = toWorld(spot);
    interactables.push({ approach: toWorld(approach), facing: spotWorld.clone().add(new THREE.Vector3(facing[0], 0, facing[1]).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation)), kind, label, object, spot: spotWorld });
    return object;
  };

  const grid = (xs, zs, add) => { for (const z of zs) for (const x of xs) add(x, z); };

  // West wall: squat racks on lifting platforms, uprights at local -x and J-hooks reaching +x.
  grid([HALL.minX + 1.4], [-11, -7, -3, 1, 5, 9], (x, z) => {
    scene.add(box(2.8, 0.04, 2.6, platformWood, x + 0.3, 0.02, z));
    station('squat-rack', x, z, 0, { approach: [1.4, 0], block: [0.85, 0.55], facing: [1, 0], kind: 'squat', label: 'Squat rack', spot: [-0.25, 0] });
  });

  // North, facing the windows (their local -x): a block of spin bikes, then two rows of treadmills up to the sauna.
  grid([-14.6, -12.4, -10.2, -8], [-13.4, -10.6, -7.8], (x, z) => {
    station('spin-bike', x, z, -Math.PI / 2, { approach: [1, 0.6], block: [0.6, 0.25], facing: [-1, 0], kind: 'cycle', label: 'Spin bike', spot: [0.32, 0] });
  });
  grid([-4, -2, 0, 2, 4, 6, 8, 10, 12], [-13.2, -9.4], (x, z) => {
    station('treadmill', x, z, -Math.PI / 2, { approach: [1.4, 0], block: [0.25, 0.4], facing: [-1, 0], kind: 'run', label: 'Treadmill', spot: [0.25, 0] });
  });
  // South-east: a block of pull-up bars.
  grid([11, 13.5, 16], [1.5, 6, 10.5], (x, z) => {
    const bar = place('pullup-bar', x, z);
    block(x - 0.75, z, 0.1, 0.1);
    block(x + 0.75, z, 0.1, 0.1);
    interactables.push({ approach: new THREE.Vector3(x, 0, z + 0.9), facing: new THREE.Vector3(x, 0, z - 8), kind: 'pullup', label: 'Pull-up bar', object: bar, spot: new THREE.Vector3(x, 0, z) });
  });

  // Middle of the floor: two blocks of bench presses with uprights behind the head.
  grid([-13, -8.5, 0, 4.5], [-2.5, 2, 6.5], (x, z) => {
    const bench = station('bench-press', x, z, 0, { approach: [-0.2, 0.9], block: [0.75, 0.6], facing: [-1, 0], kind: 'press', label: 'Bench press', spot: [-0.32, 0] });
    for (const side of [-1, 1]) {
      bench.add(box(0.07, 1.15, 0.07, black, 0.6, 0.575, side * 0.55));
      bench.add(box(0.12, 0.05, 0.07, black, 0.54, 1.1, side * 0.55));
      bench.add(box(0.35, 0.05, 0.35, black, 0.6, 0.025, side * 0.55));
    }
  });

  // Dumbbell racks along the south and east walls, three lifters in front of each.
  const dumbbellRack = (x, z, rotation) => {
    const rack = place('dumbbell-rack', x, z, rotation);
    const along = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
    const out = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
    obstacles.push({ maxX: x + Math.abs(along.x) * 1.8 + Math.abs(out.x) * 0.5, maxZ: z + Math.abs(along.z) * 1.8 + Math.abs(out.z) * 0.5, minX: x - Math.abs(along.x) * 1.8 - Math.abs(out.x) * 0.5, minZ: z - Math.abs(along.z) * 1.8 - Math.abs(out.z) * 0.5 });
    for (const offset of [-1.1, 0, 1.1]) {
      const spot = new THREE.Vector3(x, 0, z).addScaledVector(along, offset).addScaledVector(out, 1.6);
      interactables.push({ approach: spot.clone().addScaledVector(out, 0.3), facing: spot.clone().addScaledVector(out, -5), kind: 'curl', label: 'Dumbbells', object: rack, spot });
    }
  };
  for (const x of [-16.5, -12, -7.5]) dumbbellRack(x, HALL.maxZ - 0.7, 0);
  for (const z of [3, 8]) dumbbellRack(HALL.maxX - 0.7, z, Math.PI / 2);

  // Wall-mounted water stations where people fill their bottles.
  for (const [x, z, rotation] of [[HALL.minX + 0.35, 12.8, Math.PI / 2], [-3.5, HALL.maxZ - 0.35, Math.PI], [11, HALL.maxZ - 0.35, Math.PI], [HALL.maxX - 0.35, -1, -Math.PI / 2], [SAUNA.door[0] - 1.6, SAUNA.maxZ + 0.35, 0]]) {
    const tap = place('water-station', x, z, rotation);
    tap.position.y = 0.45;
    const out = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
    block(x, z, 0.3, 0.3);
    interactables.push({ approach: new THREE.Vector3(x, 0, z).addScaledVector(out, 0.8), facing: new THREE.Vector3(x, 0, z), kind: 'water', label: 'Water station', object: tap });
  }

  // Reception and plants.
  scene.add(box(3.2, 1.1, 0.8, black, 3.5, 0.55, HALL.maxZ - 1.2));
  scene.add(box(3.4, 0.05, 1, platformWood, 3.5, 1.12, HALL.maxZ - 1.2));
  block(3.5, HALL.maxZ - 1.2, 1.7, 0.5);
  const welcome = wordmark('GYM', 2.4, 0.7, '#2a2c2e');
  welcome.position.set(3.5, 2.6, HALL.maxZ - 0.02);
  welcome.rotation.y = Math.PI;
  scene.add(welcome);
  for (const [x, z] of [[HALL.minX + 1, HALL.maxZ - 1], [HALL.maxX - 1, HALL.maxZ - 1], [HALL.minX + 1, HALL.minZ + 1], [SAUNA.minX - 0.8, HALL.minZ + 1], [-1, HALL.maxZ - 1]]) {
    place('monstera', x, z);
    block(x, z, 0.4, 0.4);
  }

  // Sauna: beige tiles, three cedar tiers along the east wall, black heater by the door.
  const saunaWidth = SAUNA.maxX - SAUNA.minX, saunaDepth = SAUNA.maxZ - SAUNA.minZ;
  const saunaCenterX = (SAUNA.minX + SAUNA.maxX) / 2, saunaCenterZ = (SAUNA.minZ + SAUNA.maxZ) / 2;
  scene.add(box(0.2, CEILING, saunaDepth, tile, SAUNA.minX, CEILING / 2, saunaCenterZ));
  scene.add(box(SAUNA.door[0] - SAUNA.minX, CEILING, 0.2, tile, (SAUNA.minX + SAUNA.door[0]) / 2, CEILING / 2, SAUNA.maxZ));
  scene.add(box(SAUNA.maxX - SAUNA.door[1], CEILING, 0.2, tile, (SAUNA.door[1] + SAUNA.maxX) / 2, CEILING / 2, SAUNA.maxZ));
  scene.add(box(saunaWidth, CEILING, 0.2, tile, saunaCenterX, CEILING / 2, SAUNA.minZ + 0.05));
  const saunaFloor = new THREE.Mesh(new THREE.PlaneGeometry(saunaWidth, saunaDepth), tile);
  saunaFloor.rotation.x = -Math.PI / 2;
  saunaFloor.position.set(saunaCenterX, 0.01, saunaCenterZ);
  saunaFloor.receiveShadow = true;
  scene.add(saunaFloor);
  const saunaCeiling = new THREE.Mesh(new THREE.PlaneGeometry(saunaWidth, saunaDepth), cedar);
  saunaCeiling.rotation.x = Math.PI / 2;
  saunaCeiling.position.set(saunaCenterX, CEILING - 0.02, saunaCenterZ);
  scene.add(saunaCeiling);
  obstacles.push(
    { maxX: SAUNA.minX + 0.15, maxZ: SAUNA.maxZ, minX: SAUNA.minX - 0.15, minZ: SAUNA.minZ },
    { maxX: SAUNA.door[0], maxZ: SAUNA.maxZ + 0.15, minX: SAUNA.minX, minZ: SAUNA.maxZ - 0.15 },
    { maxX: SAUNA.maxX, maxZ: SAUNA.maxZ + 0.15, minX: SAUNA.door[1], minZ: SAUNA.maxZ - 0.15 },
  );

  const tiers = [{ height: 0.45, x: SAUNA.maxX - 2.8 }, { height: 0.9, x: SAUNA.maxX - 2 }, { height: 1.35, x: SAUNA.maxX - 1.2 }];
  const tierDepth = 0.75, tierLength = saunaDepth - 2.4, tierZ = saunaCenterZ - 0.6;
  for (const tier of tiers) {
    scene.add(box(tierDepth, 0.08, tierLength, cedar, tier.x, tier.height, tierZ));
    scene.add(box(0.06, tier.height - 0.08, tierLength, cedar, tier.x - tierDepth / 2 + 0.03, (tier.height - 0.08) / 2, tierZ));
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, tierLength - 0.2), strip);
    glow.position.set(tier.x - tierDepth / 2 + 0.07, tier.height - 0.07, tierZ);
    scene.add(glow);
    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(tierDepth, 0.3, tierLength), new THREE.MeshBasicMaterial({ visible: false }));
    hitbox.position.set(tier.x, tier.height, tierZ);
    scene.add(hitbox);
    for (let z = tierZ - tierLength / 2 + 0.6; z < tierZ + tierLength / 2 - 0.3; z += 1.25) {
      interactables.push({ approach: new THREE.Vector3(tiers[0].x - 0.8, 0, z), facing: new THREE.Vector3(SAUNA.minX, 0, z), kind: 'sauna-seat', label: 'Sauna bench', object: hitbox, seatHeight: tier.height + 0.04, spot: new THREE.Vector3(tier.x + 0.05, 0, z) });
    }
  }
  obstacles.push({ maxX: SAUNA.maxX, maxZ: tierZ + tierLength / 2, minX: tiers[0].x - tierDepth / 2, minZ: tierZ - tierLength / 2 });
  const saunaGlow = new THREE.PointLight(0xffb36b, 12, 11, 1.4);
  saunaGlow.position.set(saunaCenterX, 2.6, saunaCenterZ);
  scene.add(saunaGlow);

  const heaterPosition = new THREE.Vector3(SAUNA.minX + 0.6, 0, SAUNA.minZ + 1.2);
  const heater = place('sauna-heater', heaterPosition.x, heaterPosition.z, Math.PI / 2);
  block(heaterPosition.x, heaterPosition.z, 0.4, 0.5);
  interactables.push({ approach: new THREE.Vector3(heaterPosition.x + 1, 0, heaterPosition.z + 0.6), facing: heaterPosition.clone(), kind: 'loyly', label: 'Sauna heater', object: heater });

  const hitboxes = new Map();
  for (const item of interactables) {
    if (item.object.isMesh) continue;
    if (!hitboxes.has(item.object)) {
      const bounds = new THREE.Box3().setFromObject(item.object).expandByScalar(0.15);
      const hitbox = new THREE.Mesh(new THREE.BoxGeometry(...bounds.getSize(new THREE.Vector3()).toArray()), new THREE.MeshBasicMaterial({ visible: false }));
      bounds.getCenter(hitbox.position);
      scene.add(hitbox);
      hitboxes.set(item.object, hitbox);
    }
    item.object = hitboxes.get(item.object);
  }

  return { barbell: make('barbell'), dumbbell: make('dumbbell'), floor, heaterPosition: heaterPosition.clone().setY(0.9), interactables, obstacles, sky };
}
