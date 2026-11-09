import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import { ACTION_SECONDS, ARM_REACH, SHOULDER_HEIGHT, animateAvatar, createAvatar, setTowel } from './avatar.js';
import { setVolume, sounds, toggleSound, volumes } from './audio.js';
import { HALL, PULLUP_BAR_HEIGHT, SAUNA, TREADMILL_HEIGHT, buildWorld } from './world.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const ANIMALS = ['Elk', 'Lynx', 'Puffin', 'Reindeer', 'Fox', 'Seal', 'Owl', 'Hare', 'Wolf', 'Otter'];
const MOODS = ['Calm', 'Quiet', 'Steady', 'Gentle', 'Patient', 'Brave', 'Sleepy', 'Strong'];
const COLORS = [0x5b8c85, 0xc8875a, 0x7d8fb3, 0xb5656a, 0x8aa36b, 0xd2a845, 0x6f6aa8, 0x4d7ea8];
const ROOMS_DEFAULT = 'Room 1';
const SPEED = 2.8;
const RADIUS = 0.3;
const HANG = PULLUP_BAR_HEIGHT - (SHOULDER_HEIGHT + ARM_REACH);
const CARDIO = {
  cycle: { auto: 85, decay: 18, max: 120, metersPerBeat: 6, push: 14, radiansPerBeat: Math.PI * 2, statKey: 'meters', unit: 'rpm' },
  run: { auto: 160, decay: 30, max: 200, metersPerBeat: 0.9, push: 24, radiansPerBeat: Math.PI, statKey: 'runMeters', unit: 'steps/min' },
};
const HYDRATION = { perCardioSecond: 0.15, perRep: 0.9, perSaunaSecond: 0.3, perSecond: 0.005, sip: 25, thirsty: 25 };
const BOTTLE_SIPS = 4;

const EXERCISES = {
  curl: { action: 'curl', anim: 'curl', button: 'Curl', setSize: 12, sound: 'rep', title: 'Dumbbell curls', unit: 'curls' },
  cycle: { anim: 'cycle', button: 'Pedal', title: 'Spin bike' },
  press: { action: 'press', anim: 'bench', button: 'Press', setSize: 8, sound: 'clank', title: 'Bench press', unit: 'presses' },
  pullup: { action: 'pullup', anim: 'hang', button: 'Pull', setSize: 6, sound: 'rep', title: 'Pull-ups', unit: 'pull-ups' },
  run: { anim: 'run', button: 'Step', title: 'Treadmill' },
  squat: { action: 'squat', anim: 'squat', button: 'Squat', setSize: 8, sound: 'clank', title: 'Barbell squats', unit: 'squats' },
};

const pick = (items) => items[Math.floor(Math.random() * items.length)];
const today = new Date().toDateString();
const saved = JSON.parse(localStorage.getItem('gym-me') || '{}');
const emptyStats = { curl: 0, day: today, meters: 0, press: 0, pullup: 0, runMeters: 0, saunaSeconds: 0, squat: 0 };
const me = {
  color: saved.color ?? pick(COLORS),
  bottle: saved.bottle ?? BOTTLE_SIPS,
  hydration: saved.hydration ?? 100,
  name: saved.name || `${pick(MOODS)} ${pick(ANIMALS)}`,
  stats: saved.stats?.day === today ? { ...emptyStats, ...saved.stats } : emptyStats,
};
const persist = () => localStorage.setItem('gym-me', JSON.stringify(me));
persist();

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: $('scene'), preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const labels = new CSS2DRenderer();
Object.assign(labels.domElement.style, { inset: '0', pointerEvents: 'none', position: 'fixed' });
document.body.appendChild(labels.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const world = await buildWorld(scene);
const props = { barbell: world.barbell, dumbbell: world.dumbbell };

function makeLabel(name, mine) {
  const element = document.createElement('div');
  element.className = mine ? 'label me' : 'label';
  element.textContent = name;
  const label = new CSS2DObject(element);
  label.position.y = 2.05;
  return label;
}

const player = {
  action: null,
  actionTime: 0,
  anim: 'idle',
  avatar: createAvatar(me.color, props),
  cadence: 0,
  pending: null,
  position: new THREE.Vector3(3.5 + (Math.random() - 0.5) * 4, 0, HALL.maxZ - 4 + Math.random()),
  seatHeight: 0.45,
  speed: 0,
  station: null,
  stride: 0,
  waypoints: [],
};
player.avatar.position.copy(player.position);
player.avatar.rotation.y = Math.PI;
player.label = makeLabel(me.name, true);
player.avatar.add(player.label);
scene.add(player.avatar);

const remotes = new Map();
let socket = null;
let myId = null;
let currentRoom = params.get('room') || localStorage.getItem('gym-room') || ROOMS_DEFAULT;
let sauna = { current: null, queue: [] };
const steamClouds = [];

function toast(text, seconds = 3.5) {
  const element = $('toast');
  element.textContent = text;
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.hidden = true; }, seconds * 1000);
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

// Network

function addRemote(state) {
  if (state.id === myId || remotes.has(state.id)) return;
  const avatar = createAvatar(state.color, props);
  const label = makeLabel(state.name, false);
  label.element.classList.toggle('away', Boolean(state.away));
  avatar.add(label);
  avatar.traverse((node) => {
    node.castShadow = false;
    node.userData.remoteId = state.id;
  });
  scene.add(avatar);
  const remote = { action: null, actionTime: 0, avatar, away: state.away, color: state.color, id: state.id, label, name: state.name, pose: state.pose, speed: 0, stride: 0 };
  if (state.pose) avatar.position.set(state.pose.x, 0, state.pose.z);
  remotes.set(state.id, remote);
}

function removeRemote(id) {
  const remote = remotes.get(id);
  if (!remote) return;
  remote.label.element.remove();
  scene.remove(remote.avatar);
  remotes.delete(id);
}

function connect(room) {
  socket?.close();
  for (const id of [...remotes.keys()]) removeRemote(id);
  currentRoom = room;
  localStorage.setItem('gym-room', room);
  $('room-label').textContent = room;
  $('count-label').textContent = 'connecting…';
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const query = new URLSearchParams({ color: me.color, name: me.name, room });
  const ws = new WebSocket(`${protocol}://${location.host}/presence?${query}`);
  socket = ws;
  ws.onmessage = (event) => handle(JSON.parse(event.data));
  ws.onclose = () => {
    if (socket !== ws) return;
    $('count-label').textContent = 'reconnecting…';
    setTimeout(() => socket === ws && connect(currentRoom), 2000);
  };
}

function handle(message) {
  if (message.kind === 'welcome') {
    myId = message.id;
    currentRoom = message.room;
    $('room-label').textContent = currentRoom;
    message.players.forEach(addRemote);
    sauna = message.sauna;
  } else if (message.kind === 'full') {
    toast('This room is full. Pick another one.');
    openPanel('rooms-panel');
  } else if (message.kind === 'join') addRemote(message.player);
  else if (message.kind === 'leave') removeRemote(message.id);
  else if (message.kind === 'poses') {
    for (const [id, pose] of message.poses) {
      const remote = remotes.get(id);
      if (remote) remote.pose = pose;
    }
  } else if (message.kind === 'action') {
    const remote = remotes.get(message.id);
    if (remote && ACTION_SECONDS[message.action]) Object.assign(remote, { action: message.action, actionTime: 0 });
  } else if (message.kind === 'away') {
    const remote = remotes.get(message.id);
    if (remote) {
      remote.away = message.away;
      remote.label.element.classList.toggle('away', remote.away);
    }
  } else if (message.kind === 'sauna') updateSauna(message);
  else if (message.kind === 'loyly') loyly(message.id);
  $('count-label').textContent = `${remotes.size + 1} training`;
  if (!$('people-panel').hidden) refreshPeople();
}

// Movement

function insideSauna(point) {
  return point.x > SAUNA.minX && point.z < SAUNA.maxZ;
}

function walkTo(target, pending = null) {
  getUp();
  player.pending = pending;
  const doorX = (SAUNA.door[0] + SAUNA.door[1]) / 2;
  const entering = insideSauna(target);
  player.waypoints = insideSauna(player.position) !== entering
    ? [new THREE.Vector3(doorX, 0, SAUNA.maxZ + (entering ? 0.9 : -0.9)), new THREE.Vector3(doorX, 0, SAUNA.maxZ + (entering ? -0.9 : 0.9)), target.clone()]
    : [target.clone()];
}

function resolveCollisions(position) {
  position.x = THREE.MathUtils.clamp(position.x, HALL.minX + RADIUS, HALL.maxX - RADIUS);
  position.z = THREE.MathUtils.clamp(position.z, HALL.minZ + RADIUS, HALL.maxZ - RADIUS);
  for (const box of world.obstacles) {
    const nearestX = THREE.MathUtils.clamp(position.x, box.minX, box.maxX);
    const nearestZ = THREE.MathUtils.clamp(position.z, box.minZ, box.maxZ);
    const dx = position.x - nearestX, dz = position.z - nearestZ;
    const distance = Math.hypot(dx, dz);
    if (distance >= RADIUS) continue;
    if (distance > 1e-4) {
      position.x = nearestX + (dx / distance) * RADIUS;
      position.z = nearestZ + (dz / distance) * RADIUS;
    } else {
      const pushes = [[box.minX - RADIUS - position.x, 0], [box.maxX + RADIUS - position.x, 0], [0, box.minZ - RADIUS - position.z], [0, box.maxZ + RADIUS - position.z]];
      const [px, pz] = pushes.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]))[0];
      position.x += px;
      position.z += pz;
    }
  }
}

function faceTowards(point) {
  player.avatar.rotation.y = Math.atan2(point.x - player.position.x, point.z - player.position.z);
}

const keys = new Set();
addEventListener('keydown', (event) => {
  if (event.target.tagName === 'INPUT') return;
  keys.add(event.code);
  if (event.code === 'KeyE') getUp();
  else if (event.code === 'KeyH') wave();
  else if (event.code === 'KeyQ') drink();
  else if (event.code === 'Space' && player.station && EXERCISES[player.station.kind]) {
    event.preventDefault();
    if (!event.repeat || CARDIO[player.station.kind]) rep();
  }
});
addEventListener('keyup', (event) => keys.delete(event.code));

function updatePlayer(delta) {
  const before = player.position.clone();
  const input = new THREE.Vector3((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), 0, (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0));
  if (input.lengthSq() && !player.action) {
    if (player.station) getUp();
    player.waypoints = [];
    player.pending = null;
    input.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), view.yaw);
    player.position.addScaledVector(input, SPEED * delta);
    player.avatar.rotation.y = Math.atan2(input.x, input.z);
  } else if (player.waypoints.length && !player.action) {
    const target = player.waypoints[0];
    const offset = target.clone().sub(player.position).setY(0);
    const step = SPEED * delta;
    if (offset.length() <= step) {
      player.position.copy(target);
      player.waypoints.shift();
      if (!player.waypoints.length) arrive();
    } else {
      player.position.addScaledVector(offset.normalize(), step);
      player.avatar.rotation.y = Math.atan2(offset.x, offset.z);
    }
  }
  if (!player.station) resolveCollisions(player.position);
  player.speed = player.position.distanceTo(before) / Math.max(delta, 1e-3);
  if (player.waypoints.length && player.speed < 0.2 * SPEED) {
    player.stuck = (player.stuck || 0) + delta;
    if (player.stuck > 1.2) {
      player.waypoints = [];
      player.stuck = 0;
      arrive();
    }
  } else player.stuck = 0;
  player.avatar.position.copy(player.position);
  if (player.action) {
    player.actionTime += delta;
    if (player.actionTime >= ACTION_SECONDS[player.action]) finishAction();
  }
  if (CARDIO[player.station?.kind]) updateCardio(delta);
  if (player.station?.kind === 'sauna-seat') {
    me.stats.saunaSeconds += delta;
    drain(HYDRATION.perSaunaSecond * delta);
    $('sauna-text').textContent = `${formatDuration(me.stats.saunaSeconds)} in the sauna today · breathe slowly`;
  } else drain(HYDRATION.perSecond * delta);
  const inSauna = insideSauna(player.position);
  setTowel(player.avatar, inSauna);
  if (inSauna) sweat(player.avatar, delta);
  animateAvatar(player.avatar, { ...player, hang: HANG, lift: player.anim === 'run' ? TREADMILL_HEIGHT : 0, time: clock.elapsedTime });
}

function arrive() {
  const pending = player.pending;
  player.pending = null;
  if (!pending) return;
  if (pending.interactable) use(pending.interactable);
  else pending.done?.();
}

// Stations

function occupied(interactable) {
  return [...remotes.values()].some((remote) => remote.pose && remote.pose.anim !== 'idle' && Math.hypot(remote.pose.x - interactable.spot.x, remote.pose.z - interactable.spot.z) < 0.35);
}

function use(interactable) {
  faceTowards(interactable.facing);
  if (interactable.kind === 'loyly') return joinSaunaQueue();
  if (interactable.kind === 'water') return me.bottle >= BOTTLE_SIPS ? toast('Your bottle is already full.') : doAction('fill');
  if (EXERCISES[interactable.kind] && me.hydration <= 0) return toast('You are dehydrated. Drink from your bottle (Q) before training again.', 5);
  if (occupied(interactable)) return toast(`Someone is using this ${interactable.label.toLowerCase()}. Try the next one.`);
  player.station = interactable;
  player.position.copy(interactable.spot);
  faceTowards(interactable.facing);
  view.yaw = player.avatar.rotation.y + Math.PI;
  $('stand-button').hidden = false;
  if (interactable.kind === 'sauna-seat') {
    player.anim = 'sit';
    player.seatHeight = interactable.seatHeight;
    showSaunaPanel('In the sauna', '');
    return;
  }
  const exercise = EXERCISES[interactable.kind];
  player.anim = exercise.anim;
  player.setReps = 0;
  player.set = 1;
  $('workout-title').textContent = exercise.title;
  $('rep-label').textContent = exercise.button;
  refreshWorkout();
  openPanel('workout-panel');
}

function getUp() {
  if (!player.station) return;
  stopAuto();
  player.position.copy(player.station.approach);
  player.station = null;
  player.anim = 'idle';
  player.cadence = 0;
  player.action = null;
  $('stand-button').hidden = true;
  closePanel('workout-panel');
  if (!sauna.queue.includes(myId) && sauna.current !== myId) $('sauna-panel').hidden = true;
}

function doAction(action) {
  if (player.action) return;
  if (player.speed > 0.2) player.waypoints = [];
  player.action = action;
  player.actionTime = 0;
  send({ action, kind: 'action' });
}

function wave() {
  if (player.station && player.station.kind !== 'sauna-seat') return toast('Step off the equipment to wave.');
  doAction('wave');
}

function rep() {
  const kind = player.station?.kind;
  if (me.hydration <= 0) return toast('Too dehydrated to keep going. Drink from your bottle (Q).', 5);
  if (CARDIO[kind]) {
    player.cadence = Math.min(player.cadence + CARDIO[kind].push, CARDIO[kind].max);
    return;
  }
  if (EXERCISES[kind]) doAction(EXERCISES[kind].action);
}

function drink() {
  if (player.action) return;
  if (!me.bottle) return toast('Your bottle is empty. Fill it at a water station.', 4);
  if (me.hydration >= 100) return toast('You are fully hydrated.');
  doAction('drink');
}

function drain(amount) {
  const before = me.hydration;
  me.hydration = Math.max(me.hydration - amount, 0);
  if (before > HYDRATION.thirsty && me.hydration <= HYDRATION.thirsty) toast('You are getting thirsty. Drink from your bottle (Q).', 5);
  if (before > 0 && me.hydration <= 0) {
    toast('Dehydrated. Drink from your bottle (Q) before training again.', 6);
    stopAuto();
  }
  refreshHydration();
}

function refreshHydration() {
  const level = Math.round(me.hydration);
  if (refreshHydration.level === `${level}/${me.bottle}`) return;
  refreshHydration.level = `${level}/${me.bottle}`;
  $('hydration-fill').style.width = `${level}%`;
  $('hydration').classList.toggle('low', level <= HYDRATION.thirsty);
  $('hydration-value').textContent = `${level}%`;
  $('bottle-label').textContent = `Drink ${me.bottle}/${BOTTLE_SIPS}`;
}

function finishAction() {
  const action = player.action;
  player.action = null;
  const kind = player.station?.kind;
  const exercise = EXERCISES[kind];
  if (action === 'drink') {
    me.bottle--;
    me.hydration = Math.min(me.hydration + HYDRATION.sip, 100);
    sounds.pour();
    refreshHydration();
    persist();
    if (!me.bottle) toast('Bottle empty. Fill it at a water station.', 4);
    return;
  }
  if (action === 'fill') {
    me.bottle = BOTTLE_SIPS;
    sounds.pour();
    refreshHydration();
    persist();
    toast('Bottle filled. Press Q or Drink to take a sip.');
    return;
  }
  if (exercise && action === exercise.action) {
    drain(HYDRATION.perRep);
    me.stats[kind]++;
    player.setReps++;
    sounds[exercise.sound]();
    if (player.setReps >= exercise.setSize) {
      sounds.chime();
      toast(`Set ${player.set} done · ${exercise.setSize} ${exercise.unit}. Breathe, then go again.`);
      player.set++;
      player.setReps = 0;
    }
    persist();
    refreshWorkout();
    refreshStats();
  }
}

function updateCardio(delta) {
  const cardio = CARDIO[player.station.kind];
  if (autoTimer) player.cadence += (cardio.auto - player.cadence) * Math.min(delta * 2, 1);
  else player.cadence = Math.max(player.cadence - delta * cardio.decay, 0);
  const beats = (player.cadence / 60) * delta;
  const before = Math.floor(player.stride / Math.PI);
  player.stride += beats * cardio.radiansPerBeat;
  if (Math.floor(player.stride / Math.PI) !== before && player.cadence > 20) sounds.pedal();
  me.stats[cardio.statKey] += beats * cardio.metersPerBeat;
  drain(HYDRATION.perCardioSecond * delta * (player.cadence / cardio.auto));
  updateCardio.saved = (updateCardio.saved || 0) + delta;
  if (updateCardio.saved > 2) {
    updateCardio.saved = 0;
    persist();
    refreshStats();
  }
  refreshWorkout();
}

function refreshWorkout() {
  const kind = player.station?.kind;
  if (!EXERCISES[kind]) return;
  const cardio = CARDIO[kind];
  if (cardio) {
    const speed = (player.cadence / 60) * cardio.metersPerBeat * 3.6;
    $('workout-set').textContent = `${Math.round(player.cadence)} ${cardio.unit} · ${speed.toFixed(1)} km/h`;
    $('workout-meta').textContent = `${(me.stats[cardio.statKey] / 1000).toFixed(2)} km today · tap or hold Space`;
    return;
  }
  const exercise = EXERCISES[kind];
  $('workout-set').textContent = `Set ${player.set} · ${player.setReps} / ${exercise.setSize}`;
  $('workout-meta').textContent = `${me.stats[kind]} ${exercise.unit} today`;
}

let autoTimer = null;
function stopAuto() {
  clearInterval(autoTimer);
  autoTimer = null;
  $('auto-button').textContent = 'Auto';
}
$('auto-button').addEventListener('click', () => {
  if (autoTimer) return stopAuto();
  autoTimer = setInterval(() => {
    if (!CARDIO[player.station?.kind] && !player.action) rep();
  }, 300);
  $('auto-button').textContent = 'Pause';
});
$('rep-button').addEventListener('pointerdown', () => {
  rep();
  $('rep-button').classList.add('hit');
  setTimeout(() => $('rep-button').classList.remove('hit'), 90);
});
$('leave-button').addEventListener('click', getUp);

// Sauna

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function showSaunaPanel(title, text) {
  $('sauna-panel').hidden = false;
  $('sauna-title').textContent = title;
  if (text) $('sauna-text').textContent = text;
}

function joinSaunaQueue() {
  if (sauna.current === myId || sauna.queue.includes(myId)) return;
  send({ kind: 'sauna-join' });
  showSaunaPanel('Löyly', 'Asking for the ladle…');
}

function updateSauna(state) {
  const wasCurrent = sauna.current === myId;
  sauna = state;
  if (sauna.current === myId && !wasCurrent) {
    const heater = world.interactables.find((item) => item.kind === 'loyly');
    showSaunaPanel('Your turn at the heater', 'Walking to the stones…');
    walkTo(heater.approach, {
      done: () => {
        faceTowards(heater.facing);
        showSaunaPanel('Breathe in', 'Fill the ladle. Let the heat settle.');
        setTimeout(() => {
          if (sauna.current !== myId) return;
          doAction('loyly');
          send({ kind: 'loyly' });
          showSaunaPanel('Löyly', 'Your steam rolls across the benches. Find a seat and stay a while.');
        }, 2500);
      },
    });
  } else if (sauna.queue.includes(myId)) {
    const ahead = sauna.queue.indexOf(myId) + (sauna.current ? 1 : 0);
    showSaunaPanel('Waiting for the ladle', ahead ? `${ahead} ahead of you · we'll walk you over on your turn` : 'You are next');
  } else if (wasCurrent && player.station?.kind !== 'sauna-seat') {
    setTimeout(() => { if (sauna.current !== myId && !sauna.queue.includes(myId) && player.station?.kind !== 'sauna-seat') $('sauna-panel').hidden = true; }, 6000);
  }
}
$('sauna-leave').addEventListener('click', () => {
  send({ kind: 'sauna-leave' });
  if (player.station?.kind === 'sauna-seat') getUp();
  $('sauna-panel').hidden = true;
});

const steamTexture = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
})();

function loyly(id) {
  sounds.steam();
  const remote = remotes.get(id);
  if (remote) Object.assign(remote, { action: 'loyly', actionTime: 0 });
  for (let i = 0; i < 40; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthWrite: false, map: steamTexture, opacity: 0, transparent: true }));
    sprite.position.copy(world.heaterPosition).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5));
    sprite.userData = { age: -i * 0.05, life: 14 + Math.random() * 10, velocity: new THREE.Vector3(0.3 + Math.random() * 0.4, 0.5 + Math.random() * 0.4, (Math.random() - 0.3) * 0.5) };
    scene.add(sprite);
    steamClouds.push(sprite);
  }
}

const sweatDrops = [];
const dropGeometry = new THREE.SphereGeometry(0.022, 6, 4);
const dropMaterial = new THREE.MeshLambertMaterial({ color: 0xcfeaff, opacity: 0.85, transparent: true });

function sweat(avatar, delta) {
  if (sweatDrops.length > 160 || Math.random() > delta * 7) return;
  const { chest, head } = avatar.userData;
  const source = Math.random() < 0.5 ? head : chest;
  const drop = new THREE.Mesh(dropGeometry, dropMaterial);
  drop.position.copy(source.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3((Math.random() - 0.5) * 0.36, source === head ? Math.random() * 0.1 : 0.2 + Math.random() * 0.25, (Math.random() - 0.5) * 0.36));
  drop.scale.set(1, 1.6, 1);
  drop.userData.velocity = new THREE.Vector3(0, -0.05, 0);
  scene.add(drop);
  sweatDrops.push(drop);
}

function updateSweat(delta) {
  for (let i = sweatDrops.length - 1; i >= 0; i--) {
    const drop = sweatDrops[i];
    drop.userData.velocity.y -= 2.5 * delta;
    drop.position.addScaledVector(drop.userData.velocity, delta);
    if (drop.position.y < 0.05) {
      scene.remove(drop);
      sweatDrops.splice(i, 1);
    }
  }
}

function updateSteam(delta) {
  for (let i = steamClouds.length - 1; i >= 0; i--) {
    const sprite = steamClouds[i];
    const data = sprite.userData;
    data.age += delta;
    if (data.age < 0) continue;
    const t = data.age / data.life;
    if (t >= 1) {
      scene.remove(sprite);
      sprite.material.dispose();
      steamClouds.splice(i, 1);
      continue;
    }
    sprite.position.addScaledVector(data.velocity, delta);
    if (sprite.position.y > 2.6) data.velocity.y *= 0.95;
    sprite.position.x = THREE.MathUtils.clamp(sprite.position.x, SAUNA.minX + 0.4, SAUNA.maxX - 0.4);
    sprite.position.z = THREE.MathUtils.clamp(sprite.position.z, SAUNA.minZ + 0.4, SAUNA.maxZ - 0.4);
    sprite.scale.setScalar(0.6 + t * 3.5);
    sprite.material.opacity = Math.sin(Math.PI * t) * 0.45;
  }
}

// Camera and pointer

const view = { distance: 8, pitch: 0.5, target: new THREE.Vector3(), yaw: 0 };
const raycaster = new THREE.Raycaster();
let pointerDown = null;

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerDown = { moved: 0, x: event.clientX, y: event.clientY };
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!pointerDown) return hover(event);
  const dx = event.clientX - pointerDown.x, dy = event.clientY - pointerDown.y;
  pointerDown.moved += Math.abs(dx) + Math.abs(dy);
  pointerDown.x = event.clientX;
  pointerDown.y = event.clientY;
  view.yaw -= dx * 0.006;
  view.pitch = THREE.MathUtils.clamp(view.pitch + dy * 0.004, 0.1, 1.35);
});
renderer.domElement.addEventListener('pointerup', (event) => {
  const click = pointerDown && pointerDown.moved < 6;
  pointerDown = null;
  if (click) select(event);
});
renderer.domElement.addEventListener('wheel', (event) => {
  view.distance = THREE.MathUtils.clamp(view.distance * (1 + event.deltaY * 0.001), 2.5, 24);
}, { passive: true });

function interactableAt(event) {
  raycaster.setFromCamera(new THREE.Vector2((event.clientX / innerWidth) * 2 - 1, -(event.clientY / innerHeight) * 2 + 1), camera);
  const objects = [...new Set(world.interactables.map((item) => item.object))];
  const hit = raycaster.intersectObjects([...objects, world.floor], false)[0];
  return hit && hit.object !== world.floor ? world.interactables.find((item) => item.object === hit.object) : null;
}

function hover(event) {
  if (event.pointerType !== 'mouse') return;
  const item = interactableAt(event);
  renderer.domElement.style.cursor = item ? 'pointer' : '';
  renderer.domElement.title = item ? item.label : '';
}

function select(event) {
  $('hint').style.opacity = 0;
  raycaster.setFromCamera(new THREE.Vector2((event.clientX / innerWidth) * 2 - 1, -(event.clientY / innerHeight) * 2 + 1), camera);
  const objects = new Set(world.interactables.map((item) => item.object));
  const hits = raycaster.intersectObjects([...[...remotes.values()].map((remote) => remote.avatar), ...objects, world.floor], true);
  const hit = hits.find((candidate) => candidate.object !== player.avatar);
  if (!hit) return;
  let node = hit.object;
  while (node && !node.userData.remoteId && !objects.has(node) && node !== world.floor) node = node.parent;
  if (node?.userData.remoteId) {
    const remote = remotes.get(node.userData.remoteId);
    return toast(`${remote.name}${remote.away ? ' is catching their breath' : ' is training here'}.`);
  }
  if (objects.has(node)) {
    const closest = world.interactables.filter((item) => item.object === node).sort((a, b) => a.spot ? a.spot.distanceTo(hit.point.clone().setY(0)) - b.spot.distanceTo(hit.point.clone().setY(0)) : 0)[0];
    return walkTo(closest.approach, { interactable: closest });
  }
  if (node === world.floor) walkTo(new THREE.Vector3(hit.point.x, 0, hit.point.z));
}

function updateCamera(delta) {
  if (view.distance === 0) return;
  view.target.lerp(player.position.clone().setY(1.2), 1 - Math.exp(-delta * 6));
  const offset = new THREE.Vector3(Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), Math.cos(view.yaw) * Math.cos(view.pitch)).multiplyScalar(view.distance);
  camera.position.copy(view.target).add(offset);
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, HALL.minX + 0.4, HALL.maxX - 0.4);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, HALL.minZ + 0.4, HALL.maxZ - 0.4);
  camera.lookAt(view.target);
}

// Remote players

function updateRemotes(delta) {
  for (const remote of remotes.values()) {
    if (!remote.pose) continue;
    const before = remote.avatar.position.clone();
    const target = new THREE.Vector3(remote.pose.x, 0, remote.pose.z);
    if (remote.avatar.position.distanceTo(target) > 4) remote.avatar.position.copy(target);
    else remote.avatar.position.lerp(target, 1 - Math.exp(-delta * 10));
    let turn = remote.pose.ry - remote.avatar.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    remote.avatar.rotation.y += turn * (1 - Math.exp(-delta * 10));
    remote.speed = remote.avatar.position.distanceTo(before) / Math.max(delta, 1e-3);
    const cardio = remote.pose.anim === 'run' ? CARDIO.run : CARDIO.cycle;
    remote.stride += ((remote.pose.cadence || 0) / 60) * delta * cardio.radiansPerBeat;
    const inSauna = insideSauna(remote.avatar.position);
    setTowel(remote.avatar, inSauna);
    if (inSauna) sweat(remote.avatar, delta);
    if (remote.action) {
      remote.actionTime += delta;
      if (remote.actionTime >= ACTION_SECONDS[remote.action]) remote.action = null;
    }
    animateAvatar(remote.avatar, { action: remote.action, actionTime: remote.actionTime, anim: remote.pose.anim, hang: HANG, lift: remote.pose.anim === 'run' ? TREADMILL_HEIGHT : 0, seatHeight: remote.pose.seat ?? 0.45, speed: remote.speed, stride: remote.stride, time: clock.elapsedTime + Number(remote.id) });
  }
}

let lastPose = '';
setInterval(() => {
  const round = (value) => Math.round(value * 100) / 100;
  const pose = { anim: player.anim, cadence: Math.round(player.cadence), ry: round(player.avatar.rotation.y), seat: player.seatHeight, x: round(player.position.x), z: round(player.position.z) };
  const key = JSON.stringify(pose);
  if (key !== lastPose) send({ kind: 'pose', pose });
  lastPose = key;
}, 100);

// Panels and top bar

const PANELS = ['workout-panel', 'rooms-panel', 'people-panel', 'settings-panel'];
function openPanel(id) {
  for (const panel of PANELS) if (panel !== id && !(panel === 'workout-panel' && player.station)) closePanel(panel);
  $(id).hidden = false;
  if (id === 'rooms-panel') refreshRooms();
  if (id === 'people-panel') refreshPeople();
}

function closePanel(id) {
  $(id).hidden = true;
}
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => {
  if (button.dataset.close === 'workout-panel') getUp();
  else closePanel(button.dataset.close);
}));

async function refreshRooms() {
  const rooms = await (await fetch('/rooms')).json();
  $('rooms-list').replaceChildren(...rooms.map((room) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.className = room.name === currentRoom ? 'current' : '';
    button.innerHTML = `<span>${room.name}</span><small>${room.count >= room.capacity ? 'full' : `${room.count} / ${room.capacity}`}</small>`;
    button.disabled = room.count >= room.capacity && room.name !== currentRoom;
    button.addEventListener('click', () => {
      closePanel('rooms-panel');
      if (room.name !== currentRoom) connect(room.name);
    });
    item.append(button);
    return item;
  }));
}

const ACTIVITY = { bench: 'bench pressing', curl: 'curling dumbbells', cycle: 'on a spin bike', hang: 'doing pull-ups', run: 'on a treadmill', sit: 'resting', squat: 'squatting' };
function refreshPeople() {
  const people = [{ anim: player.anim, away: false, color: me.color, name: `${me.name} (you)` }, ...[...remotes.values()].map((remote) => ({ anim: remote.pose?.anim, away: remote.away, color: remote.color, name: remote.name }))];
  $('people-list').replaceChildren(...people.map((person) => {
    const item = document.createElement('li');
    const status = person.away ? 'catching their breath' : ACTIVITY[person.anim] || '';
    item.innerHTML = `<span class="swatch" style="background:#${Number(person.color).toString(16).padStart(6, '0')}"></span><span></span><small></small>`;
    item.children[1].textContent = person.name;
    item.children[2].textContent = status;
    return item;
  }));
}

function refreshStats() {
  const { curl, meters, press, pullup, runMeters, saunaSeconds, squat } = me.stats;
  $('stats').textContent = `${squat} squats · ${press} presses · ${curl} curls · ${pullup} pull-ups · ${(runMeters / 1000).toFixed(1)} km run · ${(meters / 1000).toFixed(1)} km ride · ${Math.floor(saunaSeconds / 60)} min sauna`;
}

$('room-button').addEventListener('click', () => openPanel('rooms-panel'));
$('people-button').addEventListener('click', () => openPanel('people-panel'));
$('settings-button').addEventListener('click', () => openPanel('settings-panel'));
$('sound-button').addEventListener('click', async () => {
  $('sound-button').textContent = (await toggleSound()) ? '🔊' : '🔇';
});
$('stand-button').addEventListener('click', getUp);
$('wave-button').addEventListener('click', wave);
$('drink-button').addEventListener('click', drink);
$('photo-button').addEventListener('click', () => {
  renderer.render(scene, camera);
  const link = document.createElement('a');
  link.download = 'gym.png';
  link.href = renderer.domElement.toDataURL('image/png');
  link.click();
  toast('Photo saved.');
});

$('name-input').value = me.name;
$('name-input').addEventListener('change', () => {
  me.name = $('name-input').value.trim() || me.name;
  persist();
  player.label.element.textContent = me.name;
  connect(currentRoom);
});
for (const name of ['ambience', 'effects']) {
  const input = $(`${name}-volume`);
  input.value = volumes[name];
  input.addEventListener('input', () => setVolume(name, Number(input.value)));
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    persist();
    send({ away: true, kind: 'away' });
  } else $('away').hidden = false;
});
$('away-back').addEventListener('click', () => {
  $('away').hidden = true;
  send({ away: false, kind: 'away' });
});
setInterval(persist, 10000);

// Loop

const clock = new THREE.Clock();
function frame() {
  const delta = Math.min(clock.getDelta(), 0.1);
  updatePlayer(delta);
  updateRemotes(delta);
  updateSteam(delta);
  updateSweat(delta);
  world.sky.rotation.y += delta * 0.003;
  updateCamera(delta);
  renderer.render(scene, camera);
  labels.render(scene, camera);
  requestAnimationFrame(frame);
}

connect(currentRoom);
refreshStats();
refreshHydration();
frame();
$('boot').classList.add('done');
setTimeout(() => $('boot').remove(), 1000);
window.gym = { Raycaster: THREE.Raycaster, camera, me, player, remotes, scene, use: (kind, index = 0) => use(world.interactables.filter((item) => item.kind === kind)[index]), view, world };
