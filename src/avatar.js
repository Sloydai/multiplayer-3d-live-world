import * as THREE from 'three';

const skin = new THREE.MeshLambertMaterial({ color: 0xf0c7a4 });
const dark = new THREE.MeshLambertMaterial({ color: 0x2b3133 });
const white = new THREE.MeshLambertMaterial({ color: 0xf4f2ee });
const towelWhite = new THREE.MeshLambertMaterial({ color: 0xfbfbf8 });
const water = new THREE.MeshLambertMaterial({ color: 0x9fd3f0, opacity: 0.8, transparent: true });

export const SHOULDER_HEIGHT = 1.36;
export const ARM_REACH = 0.62;

const UPPER_ARM = 0.2;
const UPPER_LEG = 0.25;
const ELBOW_DEPTH = UPPER_ARM + 0.065 * 0.6;
const KNEE_DEPTH = UPPER_LEG + 0.085 * 0.6;
const FOOT_DEPTH = 0.72 - KNEE_DEPTH;
const GRIP = ARM_REACH - ELBOW_DEPTH;
const HAND = 0.42 - UPPER_ARM + 0.065;
const PRESS_REACH = ELBOW_DEPTH + HAND;
const SQUAT_BAR = new THREE.Vector3(0, 0.62, -0.24);
const DOWN = new THREE.Vector3(0, -1, 0);

/** Points an arm so its hand lands on `target` (chest space), with the elbow bending towards `pole`. */
function aimArm(arm, target, pole) {
  const toTarget = target.clone().sub(arm.position);
  const distance = Math.min(Math.max(toTarget.length(), Math.abs(ELBOW_DEPTH - HAND) + 1e-3), ELBOW_DEPTH + HAND - 1e-3);
  const direction = toTarget.normalize();
  const along = (ELBOW_DEPTH * ELBOW_DEPTH - HAND * HAND + distance * distance) / (2 * distance);
  const bend = pole.clone().addScaledVector(direction, -pole.dot(direction)).normalize();
  const elbow = direction.clone().multiplyScalar(along).addScaledVector(bend, Math.sqrt(Math.max(0, ELBOW_DEPTH * ELBOW_DEPTH - along * along)));
  const forearm = direction.multiplyScalar(distance).sub(elbow).normalize();
  arm.quaternion.setFromUnitVectors(DOWN, elbow.normalize());
  arm.userData.joint.quaternion.setFromUnitVectors(DOWN, forearm.applyQuaternion(arm.quaternion.clone().invert()));
}

function limb(radius, upper, lower, material) {
  const pivot = new THREE.Group();
  const upperMesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, upper, 4, 10), material);
  upperMesh.position.y = -upper / 2 - radius * 0.6;
  const joint = new THREE.Group();
  joint.position.y = -upper - radius * 0.6;
  const lowerMesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius * 0.92, lower, 4, 10), material);
  lowerMesh.position.y = -lower / 2;
  upperMesh.castShadow = lowerMesh.castShadow = true;
  joint.add(lowerMesh);
  pivot.add(upperMesh, joint);
  pivot.userData = { joint, meshes: [upperMesh, lowerMesh] };
  return pivot;
}

/** Two-bone solve in a limb's swing plane: returns [pivot, joint] angles that put its end at (y, z) from the pivot. */
function reach(y, z, upper, lower, bend) {
  const distance = Math.min(Math.max(Math.hypot(y, z), Math.abs(upper - lower) + 1e-3), upper + lower - 1e-3);
  const joint = Math.acos((distance * distance - upper * upper - lower * lower) / (2 * upper * lower));
  const spread = Math.acos((upper * upper + distance * distance - lower * lower) / (2 * upper * distance));
  return [Math.atan2(-z, -y) - bend * spread, bend * joint];
}

export function createAvatar(color, props) {
  const shirt = new THREE.MeshLambertMaterial({ color });
  const beanie = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).offsetHSL(0.5, -0.1, 0.1) });
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.78;
  body.add(hips);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.38, 4, 12), shirt);
  torso.position.y = 0.33;
  torso.castShadow = true;
  const chest = new THREE.Group();
  chest.add(torso);
  hips.add(chest);

  const towel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.29, 0.46, 18), towelWhite);
  towel.position.y = -0.12;
  towel.castShadow = true;
  towel.visible = false;
  hips.add(towel);

  const head = new THREE.Group();
  head.position.y = 0.86;
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), skin);
  face.castShadow = true;
  const hat = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), beanie);
  cap.position.y = 0.03;
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), white);
  pom.position.y = 0.24;
  hat.add(cap, pom);
  const eyes = [-0.07, 0.07].map((x) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), dark);
    eye.position.set(x, -0.02, 0.18);
    return eye;
  });
  head.add(face, hat, ...eyes);
  chest.add(head);

  const arms = [-1, 1].map((side) => {
    const arm = limb(0.065, UPPER_ARM, 0.42 - UPPER_ARM, shirt);
    arm.position.set(side * 0.3, SHOULDER_HEIGHT - 0.78, 0);
    chest.add(arm);
    return arm;
  });
  const legs = [-1, 1].map((side) => {
    const leg = limb(0.085, UPPER_LEG, FOOT_DEPTH - 0.1, dark);
    leg.position.set(side * 0.11, 0.02, 0);
    hips.add(leg);
    return leg;
  });
  const shoes = legs.map((leg) => {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.26), white);
    shoe.position.set(0, -FOOT_DEPTH, 0.05);
    leg.userData.joint.add(shoe);
    return shoe;
  });

  const barbell = props.barbell.clone();
  const barRadius = new THREE.Box3().setFromObject(barbell).getSize(new THREE.Vector3()).y / 2;
  barbell.visible = false;
  chest.add(barbell);
  const dumbbells = arms.map((arm) => {
    const dumbbell = props.dumbbell.clone();
    dumbbell.position.set(0, -HAND + 0.03 - new THREE.Box3().setFromObject(dumbbell).getSize(new THREE.Vector3()).y / 2, 0);
    dumbbell.visible = false;
    arm.userData.joint.add(dumbbell);
    return dumbbell;
  });
  const bottle = new THREE.Group();
  const bottleBody = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 12), water);
  const bottleCap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.04, 10), white);
  bottleCap.position.y = -0.12;
  bottle.add(bottleBody, bottleCap);
  bottle.position.set(0, ELBOW_DEPTH - 0.62, 0.05);
  bottle.visible = false;
  arms[1].userData.joint.add(bottle);

  root.userData = { arms, barRadius, barbell, body, bottle, chest, dumbbells, hat, head, hips, legs, shirt, shoes, towel, towelOn: false };
  return root;
}

/** Bare skin and a white towel round the waist in the sauna; gym clothes everywhere else. */
export function setTowel(avatar, on) {
  const parts = avatar.userData;
  if (parts.towelOn === on) return;
  parts.towelOn = on;
  parts.towel.visible = on;
  parts.hat.visible = !on;
  for (const shoe of parts.shoes) shoe.visible = !on;
  parts.chest.children[0].material = on ? skin : parts.shirt;
  for (const arm of parts.arms) for (const mesh of arm.userData.meshes) mesh.material = on ? skin : parts.shirt;
  for (const leg of parts.legs) for (const mesh of leg.userData.meshes) mesh.material = on ? skin : dark;
}

const ease = (t) => 0.5 - Math.cos(Math.PI * Math.min(Math.max(t, 0), 1)) / 2;
const arc = (t) => Math.sin(Math.PI * Math.min(Math.max(t, 0), 1));

export const ACTION_SECONDS = { curl: 1.4, drink: 2, fill: 2.5, loyly: 3, press: 1.8, pullup: 1.6, squat: 1.8, wave: 2 };

/** Poses the avatar for this frame: `anim` is the steady state, `action` a one-shot on top, `stride` the cardio phase. */
export function animateAvatar(avatar, { action, actionTime, anim, hang = 0, lift = 0, seatHeight = 0.45, speed, stride = 0, time }) {
  const { arms, barRadius, barbell, body, bottle, chest, dumbbells, head, hips, legs } = avatar.userData;
  let hipY = 0.78, hipZ = 0, hipTilt = 0, chestTilt = 0, headTilt = 0, barReach = PRESS_REACH, pull = 0;
  const armX = [0, 0], armZ = [0.08, -0.08], elbowX = [-0.15, -0.15], elbowZ = [0, 0], legX = [0, 0], kneeX = [0, 0];
  const t = action ? actionTime / ACTION_SECONDS[action] : 0;

  if (anim === 'sit') {
    hipY = seatHeight + 0.05;
    legX[0] = legX[1] = -Math.PI / 2;
    kneeX[0] = kneeX[1] = Math.PI / 2;
    armX[0] = armX[1] = -0.5;
    elbowX[0] = elbowX[1] = -0.5;
  } else if (anim === 'cycle') {
    hipY = 0.98;
    chestTilt = 0.55;
    armX[0] = armX[1] = -1.1;
    elbowX[0] = elbowX[1] = -0.35;
    [0, 1].forEach((i) => {
      const crank = stride + i * Math.PI;
      [legX[i], kneeX[i]] = reach(-0.5 + Math.cos(crank) * 0.15, 0.28 + Math.sin(crank) * 0.15, KNEE_DEPTH, FOOT_DEPTH, 1);
    });
  } else if (anim === 'run') {
    const swing = Math.sin(stride);
    legX[0] = swing * 0.8;
    legX[1] = -swing * 0.8;
    kneeX[0] = 0.3 + Math.max(0, swing) * 1.5;
    kneeX[1] = 0.3 + Math.max(0, -swing) * 1.5;
    armX[0] = -swing * 0.9;
    armX[1] = swing * 0.9;
    elbowX[0] = elbowX[1] = -1.4;
    chestTilt = 0.12;
    hipY += Math.abs(Math.cos(stride)) * 0.06 - 0.04;
  } else if (anim === 'bench') {
    hipY = 0.68;
    hipTilt = -Math.PI / 2;
    legX[0] = legX[1] = Math.PI / 2 - 0.35;
    kneeX[0] = kneeX[1] = -Math.PI / 2 + 0.35;
  } else if (anim === 'squat') {
  } else if (anim !== 'hang' && speed > 0.1) {
    const swing = Math.sin(time * 9) * Math.min(speed / 3, 1) * 0.7;
    legX[0] = swing;
    legX[1] = -swing;
    kneeX[0] = 0.1 + Math.max(0, swing) * 1.1;
    kneeX[1] = 0.1 + Math.max(0, -swing) * 1.1;
    armX[0] = -swing * 0.8;
    armX[1] = swing * 0.8;
    elbowX[0] = elbowX[1] = -0.35;
    hipY += Math.abs(Math.cos(time * 9)) * 0.04;
  } else if (anim !== 'hang') {
    chestTilt = Math.sin(time * 1.6) * 0.015;
  }

  barbell.visible = anim === 'squat' || anim === 'bench';
  for (const dumbbell of dumbbells) dumbbell.visible = anim === 'curl';
  bottle.visible = action === 'drink' || action === 'fill';

  if (action === 'squat') {
    const depth = arc(t);
    hipY -= depth * 0.38;
    hipZ = -depth * 0.16;
    chestTilt = depth * 0.45;
  } else if (action === 'press') {
    barReach = PRESS_REACH - arc(t) * 0.26;
  } else if (action === 'curl') {
    const curl = arc(t);
    armX[0] = armX[1] = -curl * 0.15;
    elbowX[0] = elbowX[1] = -0.15 - curl * 2.1;
  } else if (action === 'pullup') {
    pull = ease(t < 0.5 ? t * 2 : 2 - t * 2);
  } else if (action === 'drink') {
    const raise = arc(t);
    armX[1] = -raise * 1.35;
    armZ[1] = -0.08 + raise * 0.5;
    elbowX[1] = -0.15 - raise * 2.2;
    headTilt = -raise * 0.35;
  } else if (action === 'fill') {
    const extend = arc(Math.min(t * 1.4, 1));
    armX[1] = -extend * 1.05;
    elbowX[1] = -0.15 - extend * 0.4;
    chestTilt = extend * 0.15;
  } else if (action === 'wave') {
    const raise = ease(Math.min(t / 0.18, 1)) * ease(Math.min((1 - t) / 0.18, 1));
    armX[0] = -raise * 0.2;
    armZ[0] = 0.08 - raise * 1.75;
    elbowX[0] = -0.15 + raise * 0.15;
    elbowZ[0] = -raise * (0.9 + Math.sin(actionTime * 14) * 0.35);
    headTilt = -raise * 0.08;
  } else if (action === 'loyly') {
    armX[1] = -arc(t) * 1.6;
    elbowX[1] = -0.15 - arc(t) * 0.5;
    chestTilt = arc(t) * 0.2;
  }

  if (anim === 'hang') {
    hipY += hang + pull * 0.45;
    [0, 1].forEach((i) => {
      const side = i ? 1 : -1;
      armX[i] = 0;
      [armZ[i], elbowZ[i]] = reach(ARM_REACH - pull * 0.45, -side * 0.12, ELBOW_DEPTH, GRIP, side);
      elbowX[i] = 0;
    });
    legX[0] = legX[1] = 0.25 + Math.sin(time * 2) * 0.05 + pull * 0.3;
    kneeX[0] = kneeX[1] = 0.5 + pull * 0.4;
  } else if (anim === 'bench') {
    [0, 1].forEach((i) => {
      const side = i ? 1 : -1;
      armX[i] = -Math.PI / 2;
      [armZ[i], elbowZ[i]] = reach(-barReach, -side * 0.12, ELBOW_DEPTH, HAND, -side);
      elbowX[i] = 0;
    });
  } else if (anim === 'squat') {
    [0, 1].forEach((i) => { [legX[i], kneeX[i]] = reach(0.08 - (hipY + 0.02), -hipZ, KNEE_DEPTH, FOOT_DEPTH, 1); });
  }

  if (anim === 'bench') barbell.position.set(0, SHOULDER_HEIGHT - 0.78 - barRadius, barReach);
  else barbell.position.set(0, SQUAT_BAR.y - barRadius, SQUAT_BAR.z);
  body.position.y = lift;
  hips.position.set(0, hipY, hipZ);
  hips.rotation.x = hipTilt;
  chest.rotation.x = chestTilt;
  head.rotation.x = headTilt;
  arms.forEach((arm, i) => {
    arm.rotation.set(armX[i], 0, armZ[i]);
    arm.userData.joint.rotation.set(elbowX[i], 0, elbowZ[i]);
    const side = i ? 1 : -1;
    if (anim === 'squat') aimArm(arm, new THREE.Vector3(side * 0.5, SQUAT_BAR.y, SQUAT_BAR.z), new THREE.Vector3(side, -1, -0.3));
  });
  legs.forEach((leg, i) => {
    leg.rotation.x = legX[i];
    leg.userData.joint.rotation.x = kneeX[i];
  });
}
